/**
 * Semiconductor Tycoon — Step 4: Green Data Center & Compute Revenue.
 *
 * Data-center facility that consumes the player's own AI accelerators, a
 * PUE-tuning engine driven by cooling technology + network interconnect, and
 * a compute-revenue stream that monetizes tokens/hour instead of B2B die
 * contracts.
 *
 * Pure, deterministic, no I/O.
 */

import {
  requireInRange,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from '../domain/validation.ts';

// ---------------------------------------------------------------------------
// Cooling & network
// ---------------------------------------------------------------------------

/** Cooling technology tier, each with a baseline PUE. */
export const CoolingTechnology = {
  /** Traditional CRAC/CRAH air cooling — least efficient. */
  AIR_COOLING: 'AIR_COOLING',
  /** Cold-plate liquid cooling direct to chips. */
  COLD_PLATE: 'COLD_PLATE',
  /** Full-tank immersion cooling — most efficient. */
  IMMERSION_COOLING: 'IMMERSION_COOLING',
} as const;
export type CoolingTechnology = (typeof CoolingTechnology)[keyof typeof CoolingTechnology];

/** Cluster network interconnect. */
export const NetworkInterconnect = {
  /** NVIDIA/Mellanox-style InfiniBand fabric. */
  INFINIBAND: 'INFINIBAND',
  /** Co-packaged optics (CPO) — lower power, higher bandwidth. */
  CPO: 'CPO',
} as const;
export type NetworkInterconnect = (typeof NetworkInterconnect)[keyof typeof NetworkInterconnect];

/** Baseline PUE by cooling technology (total facility power / IT power). */
export const COOLING_PUE: Readonly<Record<CoolingTechnology, number>> = Object.freeze({
  [CoolingTechnology.AIR_COOLING]: 1.60,
  [CoolingTechnology.COLD_PLATE]: 1.25,
  [CoolingTechnology.IMMERSION_COOLING]: 1.08,
});

/** PUE multiplier applied by the network (CPO is slightly more efficient). */
export const NETWORK_PUE_FACTOR: Readonly<Record<NetworkInterconnect, number>> = Object.freeze({
  [NetworkInterconnect.INFINIBAND]: 1.00,
  [NetworkInterconnect.CPO]: 0.98,
});

// ---------------------------------------------------------------------------
// PUE tuning engine
// ---------------------------------------------------------------------------

/**
 * Pure engine for PUE / power calculations. No static state; everything is a
 * function of inputs so results are fully deterministic.
 */
export class PUETuningEngine {
  /** Baseline PUE for a cooling technology. */
  static pueForCooling(cooling: CoolingTechnology): number {
    const pue = COOLING_PUE[cooling];
    if (pue === undefined) {
      throw new Error(`[PUETuningEngine] unknown cooling '${cooling}'`);
    }
    return pue;
  }

  /** PUE multiplier for a network interconnect. */
  static networkFactor(network: NetworkInterconnect): number {
    const f = NETWORK_PUE_FACTOR[network];
    if (f === undefined) {
      throw new Error(`[PUETuningEngine] unknown network '${network}'`);
    }
    return f;
  }

  /** Effective PUE = cooling PUE × network factor, clamped to >= 1.0. */
  static effectivePue(cooling: CoolingTechnology, network: NetworkInterconnect): number {
    return Math.max(1.0, PUETuningEngine.pueForCooling(cooling) * PUETuningEngine.networkFactor(network));
  }

  /** Total facility power draw = IT load × PUE (kW). */
  static totalPowerKw(itPowerKw: number, pue: number): number {
    return itPowerKw * pue;
  }

  /** Power spent on cooling / overhead = IT load × (PUE − 1) (kW). */
  static coolingPowerKw(itPowerKw: number, pue: number): number {
    return itPowerKw * (pue - 1);
  }
}

// ---------------------------------------------------------------------------
// Data center spec
// ---------------------------------------------------------------------------

/** Specification of a data-center facility. */
export interface DataCenterSpec {
  readonly facilityId: string;
  readonly name: string;
  readonly cooling: CoolingTechnology;
  readonly network: NetworkInterconnect;
  /** Maximum number of server racks. */
  readonly rackCapacity: number;
  /** Accelerator cards populated per full rack. */
  readonly cardsPerRack: number;
  /** IT load (kW) of one fully populated rack. */
  readonly itPowerKwPerRack: number;
  /** Useful life in days (for straight-line depreciation). */
  readonly usefulLifeDays: number;
  /** Acquisition cost in USD (CapEX). */
  readonly costUsd: number;
}

/** One deployed server rack. */
export interface RackDeployment {
  readonly rackId: string;
  readonly acceleratorCards: number;
  readonly itPowerKw: number;
  readonly deployedDay: number;
}

/** Snapshot of a data center at a point in time. */
export interface DataCenterSnapshot {
  readonly facilityId: string;
  readonly cooling: CoolingTechnology;
  readonly network: NetworkInterconnect;
  readonly pue: number;
  readonly deployedRacks: number;
  readonly totalItPowerKw: number;
  readonly coolingPowerKw: number;
  readonly totalFacilityPowerKw: number;
  readonly pueOverheadKw: number;
}
// ---------------------------------------------------------------------------
// DataCenterFacility
// ---------------------------------------------------------------------------

/**
 * A player-owned data center. Holds deployed racks and reports live power /
 * PUE state. Does not own money — {@link ComputeRevenueStream} does the
 * monetization and settles against the financial system.
 */
export class DataCenterFacility {
  private readonly dcSpec: Readonly<DataCenterSpec>;
  private readonly racks = new Map<string, RackDeployment>();

  constructor(spec: DataCenterSpec) {
    requireNonEmptyString(spec.facilityId, 'datacenter.facilityId');
    requireNonEmptyString(spec.name, 'datacenter.name');
    requirePositiveNumber(spec.rackCapacity, 'datacenter.rackCapacity');
    requirePositiveNumber(spec.cardsPerRack, 'datacenter.cardsPerRack');
    requirePositiveNumber(spec.itPowerKwPerRack, 'datacenter.itPowerKwPerRack');
    requirePositiveNumber(spec.usefulLifeDays, 'datacenter.usefulLifeDays');
    requirePositiveNumber(spec.costUsd, 'datacenter.costUsd');
    this.dcSpec = Object.freeze(spec);
  }

  get spec(): Readonly<DataCenterSpec> {
    return this.dcSpec;
  }

  /** Effective PUE for this facility (cooling × network). */
  get pue(): number {
    return PUETuningEngine.effectivePue(this.dcSpec.cooling, this.dcSpec.network);
  }

  /** Number of deployed racks. */
  get deployedRacks(): number {
    return this.racks.size;
  }

  /** Whether a rack with `rackId` is already deployed. */
  hasRack(rackId: string): boolean {
    return this.racks.has(rackId);
  }

  /** All deployments, oldest first. */
  get deployments(): readonly RackDeployment[] {
    return Object.freeze([...this.racks.values()]);
  }

  /** Total IT load of all deployed racks (kW). */
  get totalItPowerKw(): number {
    let total = 0;
    const kwPerCard = this.dcSpec.itPowerKwPerRack / this.dcSpec.cardsPerRack;
    for (const r of this.racks.values()) total += r.acceleratorCards * kwPerCard;
    return total;
  }

  /** Cooling/overhead power (kW) = IT × (PUE − 1). */
  get coolingPowerKw(): number {
    return PUETuningEngine.coolingPowerKw(this.totalItPowerKw, this.pue);
  }

  /** Total facility power (kW) = IT × PUE. */
  get totalFacilityPowerKw(): number {
    return PUETuningEngine.totalPowerKw(this.totalItPowerKw, this.pue);
  }

  /** Power spent purely on PUE overhead (kW) = facility − IT. */
  get pueOverheadKw(): number {
    return this.totalFacilityPowerKw - this.totalItPowerKw;
  }

  /**
   * Deploy a rack. Fails (returns null) when the rack id exists, the data
   * center is full, or card count is invalid.
   */
  deployRack(
    rackId: string,
    acceleratorCards: number,
    deployedDay: number,
  ): { readonly deployment?: RackDeployment; readonly ok: boolean; readonly reason?: string } {
    requireNonEmptyString(rackId, 'datacenter.rackId');
    requirePositiveNumber(acceleratorCards, 'datacenter.acceleratorCards');
    if (acceleratorCards > this.dcSpec.cardsPerRack) {
      return {
        ok: false,
        reason: `rack '${rackId}': ${acceleratorCards} cards exceeds capacity ${this.dcSpec.cardsPerRack}`,
      };
    }
    if (this.racks.has(rackId)) {
      return { ok: false, reason: `rack '${rackId}' already deployed` };
    }
    if (this.racks.size >= this.dcSpec.rackCapacity) {
      return { ok: false, reason: `data center full: ${this.dcSpec.rackCapacity} racks` };
    }
    const kwPerCard = this.dcSpec.itPowerKwPerRack / this.dcSpec.cardsPerRack;
    const deployment: RackDeployment = {
      rackId,
      acceleratorCards,
      itPowerKw: acceleratorCards * kwPerCard,
      deployedDay: deployedDay,
    };
    this.racks.set(rackId, deployment);
    return { ok: true, deployment };
  }

  /** Snapshot of current facility state. */
  snapshot(): DataCenterSnapshot {
    return Object.freeze({
      facilityId: this.dcSpec.facilityId,
      cooling: this.dcSpec.cooling,
      network: this.dcSpec.network,
      pue: this.pue,
      deployedRacks: this.deployedRacks,
      totalItPowerKw: this.totalItPowerKw,
      coolingPowerKw: this.coolingPowerKw,
      totalFacilityPowerKw: this.totalFacilityPowerKw,
      pueOverheadKw: this.pueOverheadKw,
    });
  }
}

// ---------------------------------------------------------------------------
// ComputeRevenueStream
// ---------------------------------------------------------------------------

/** Result of running the compute revenue stream for a duration. */
export interface ComputeRevenueResult {
  readonly hours: number;
  readonly totalCards: number;
  readonly tokensProduced: number;
  readonly revenueUsd: number;
  readonly itPowerKw: number;
  readonly pue: number;
  readonly facilityPowerKw: number;
  readonly powerCostUsd: number;
  readonly depreciationUsd: number;
  readonly netUsd: number;
  readonly marginPercent: number;
}

/**
 * Monetizes deployed AI accelerators as token/hour compute capacity rented to
 * cloud / LLM customers. Produces passive cash flow but carries power cost,
 * PUE overhead and facility depreciation.
 */
export class ComputeRevenueStream {
  private readonly facility: DataCenterFacility;
  private readonly tokensPerCardPerHour: number;
  private readonly pricePerTokenUsd: number;
  private readonly usdPerKwh: number;

  constructor(
    facility: DataCenterFacility,
    tokensPerCardPerHour: number,
    pricePerTokenUsd: number,
    usdPerKwh: number,
  ) {
    requirePositiveNumber(tokensPerCardPerHour, 'revenue.tokensPerCardPerHour');
    requirePositiveNumber(pricePerTokenUsd, 'revenue.pricePerTokenUsd');
    requirePositiveNumber(usdPerKwh, 'revenue.usdPerKwh');
    this.facility = facility;
    this.tokensPerCardPerHour = tokensPerCardPerHour;
    this.pricePerTokenUsd = pricePerTokenUsd;
    this.usdPerKwh = usdPerKwh;
  }

  /** Total accelerator cards deployed across all racks. */
  get totalCards(): number {
    let n = 0;
    for (const r of this.facility.deployments) n += r.acceleratorCards;
    return n;
  }

  /**
   * Run the stream for `hours`. Returns revenue, power cost, depreciation and
   * net. Deterministic given the facility state.
   */
  run(hours: number): ComputeRevenueResult {
    requirePositiveNumber(hours, 'revenue.hours');
    const cards = this.totalCards;
    const tokensProduced = cards * this.tokensPerCardPerHour * hours;
    const revenueUsd = tokensProduced * this.pricePerTokenUsd;

    const itPowerKw = this.facility.totalItPowerKw;
    const pue = this.facility.pue;
    const facilityPowerKw = PUETuningEngine.totalPowerKw(itPowerKw, pue);
    const powerCostUsd = facilityPowerKw * this.usdPerKwh * hours;

    // Straight-line depreciation prorated to hours (1 day = 24 h).
    const depreciationUsd =
      (this.facility.spec.costUsd / this.facility.spec.usefulLifeDays) * (hours / 24);

    const netUsd = revenueUsd - powerCostUsd - depreciationUsd;
    const marginPercent = revenueUsd > 0 ? (netUsd / revenueUsd) * 100 : 0;

    return Object.freeze({
      hours,
      totalCards: cards,
      tokensProduced,
      revenueUsd,
      itPowerKw,
      pue,
      facilityPowerKw,
      powerCostUsd,
      depreciationUsd,
      netUsd,
      marginPercent,
    });
  }
}

