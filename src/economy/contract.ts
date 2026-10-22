import { ContractStatus } from './enums.ts';
import type { Client, ClientDemand, QualityGate } from './client.ts';
import type { MarketEnvironment } from './market.ts';
import type { TechnologyNode, ComponentCategory, WaferSize } from '../domain/enums.ts';
import { grossDiesPerWafer } from '../domain/yield.ts';
import { waferDiameterMm } from '../domain/constants.ts';

/** Penalty schedule attached to a contract. */
export interface ContractPenalties {
  /** USD charged per day of late delivery. */
  readonly perDayLateUsd: number;
  /** One-time USD penalty if the shipment misses the quality gate. */
  readonly qualityFailureUsd: number;
  /** USD penalty per missing good die (short-shipment liquidated damages). */
  readonly perShortDieUsd: number;
  /** Maximum total penalty the client can levy (caps the downside). */
  readonly maxPenaltyUsd: number;
}

/** Money split of a contract's total value. */
export interface ContractTerms {
  /** Headline contract value in USD. */
  readonly totalValueUsd: number;
  /** Fraction of the value paid on delivery of the last lot (0..1). */
  readonly finalPaymentFraction: number;
  /** Fraction withheld until the quality gate is confirmed (0..1). */
  readonly retentionFraction: number;
  readonly penalties: ContractPenalties;
  /** Currency of the contract (always USD in this build). */
  readonly currency: 'USD';
}

/** Immutable description of an order the player can accept. */
export interface Contract {
  readonly id: string;
  readonly client: Client;
  readonly demand: ClientDemand;
  readonly terms: ContractTerms;
  readonly status: ContractStatus;
  /** Sim-day the contract was issued. */
  readonly issuedDay: number;
  /** Sim-day the full order must be delivered by. */
  readonly deliveryDeadlineDay: number;
  /** Lot ids already delivered against this contract. */
  readonly deliveredLotIds: readonly string[];
  /** Good dies already delivered against this contract. */
  readonly deliveredDies: number;
}

/** Why a contract is worth what it is. Surfaced in the offer board UI. */
export interface PriceBreakdown {
  /** Market value of the good dies at the contracted quality. */
  readonly baseValueUsd: number;
  /** Scarcity premium from the market (0..1 → price multiplier). */
  readonly scarcityPremium: number;
  /** Penalty the client applies because of its own strictness (0..1). */
  readonly strictnessDiscount: number;
  /** Discount from rival pricing (0..1). */
  readonly competitiveDiscount: number;
  /** Premium for the client's quality focus (0..1). */
  readonly qualityPremium: number;
  /** Total quoted price per good die, USD. */
  readonly pricePerDieUsd: number;
  /** Total contract value, USD. */
  readonly totalValueUsd: number;
  /** Market ASP index at the time of quoting. */
  readonly priceIndex: number;
  /** Blended competitor price level at the time of quoting. */
  readonly competitorPriceLevel: number;
}

/** Options for generating an offer. */
export interface ContractOfferOptions {
  readonly client: Client;
  readonly demand: ClientDemand;
  /** Sim-day the offer is issued (default: market's current day). */
  readonly issuedDay?: number;
  /** Override the quoted total value (e.g. to apply a player-side discount). */
  readonly valueOverrideUsd?: number;
}

/**
 * Quote a contract's price from live market conditions.
 *
 * The price per good die is built from:
 *   1. the node's market ASP (already carries the cyclical scarcity premium),
 *   2. the client's quality focus (pays more for a better part),
 *   3. the client's strictness (a harsher customer pays less),
 *   4. the rival price level (rivals undercut the player's quote).
 */
export function priceContract(
  market: MarketEnvironment,
  client: Client,
  demand: ClientDemand,
): PriceBreakdown {
  const node = demand.targetNode;
  const state = market.stateFor(node);

  // Quality the customer expects: the yield they require, plus a bonus for
  // beating the gate (0..1 quality factor fed into the market price model).
  const qualityFactor = Math.min(
    1,
    demand.qualityGate.minAcceptableYield + (1 - demand.qualityGate.minAcceptableYield) * 0.35,
  );

  const competitiveLevel = market.competitorPriceLevel();
  const competitiveDiscount = Math.min(0.35, Math.max(0, (competitiveLevel - 0.85) * 0.5));
  const strictnessDiscount = client.strictness * 0.12;
  const qualityPremium = demand.qualityWeight * 0.18;
  const scarcityPremium = Math.min(0.8, Math.max(0, (state.priceIndex - 1) * 0.35));

  const pricePerDie =
    market.pricePerGoodDie(node, qualityFactor) * (1 - competitiveDiscount) * (1 - strictnessDiscount) * (1 + qualityPremium);

  // A customer orders a *quantity*; they pay for the dies they asked for, and
  // the last 10% of a qualified shipment earns a quality premium.
  const baseValueUsd = pricePerDie * demand.requiredGoodDies;
  const totalValueUsd = baseValueUsd * (1 + scarcityPremium * 0.15);

  return Object.freeze({
    baseValueUsd,
    scarcityPremium,
    strictnessDiscount,
    competitiveDiscount,
    qualityPremium,
    pricePerDieUsd: pricePerDie,
    totalValueUsd,
    priceIndex: state.priceIndex,
    competitorPriceLevel: competitiveLevel,
  });
}

/** Build a penalty schedule scaled to the contract's value and the client. */
function buildPenalties(
  totalValueUsd: number,
  client: Client,
  demand: ClientDemand,
  leadTimeDays: number,
): ContractPenalties {
  const perDayLateUsd = totalValueUsd * 0.012 * (0.5 + client.strictness);
  const perShortDieUsd = Math.max(
    0.5,
    (totalValueUsd / Math.max(demand.requiredGoodDies, 1)) * (0.8 + client.strictness * 0.6),
  );
  return Object.freeze({
    perDayLateUsd,
    qualityFailureUsd: totalValueUsd * (0.15 + client.strictness * 0.25),
    perShortDieUsd,
    maxPenaltyUsd: totalValueUsd * 0.6,
  });
}

// ---------------------------------------------------------------------------
// Contract generation & board
// ---------------------------------------------------------------------------

/** Demand template used to synthesise an offer for a client. */
export interface DemandTemplate {
  readonly componentCategory: ComponentCategory;
  readonly targetNode: TechnologyNode;
  readonly wafersPerLot: number;
  readonly lotCount: number;
  readonly leadTimeDays: number;
  readonly minAcceptableYield: number;
  readonly maxDefectDensityPerCm2: number;
  readonly qualityWeight: number;
}

/**
 * Compute the good-die requirement implied by a demand template.
 *
 * Uses the domain's standard GDW approximation (with the edge-exclusion
 * band) and scales by the yield the client is willing to accept.
 */
function requiredDiesFor(
  template: DemandTemplate,
  dieSizeMm2: number,
  wafersPerLot: number,
  waferSize: WaferSize = 'WAFER_200MM',
): number {
  const side = Math.sqrt(Math.max(dieSizeMm2, 1));
  const gdw = grossDiesPerWafer(waferDiameterMm(waferSize), side, side);
  return Math.max(1, Math.floor(gdw * wafersPerLot * template.lotCount * template.minAcceptableYield));
}

/** Caller input for {@link generateContract}. */
export interface GenerateContractInput {
  readonly market: MarketEnvironment;
  readonly client: Client;
  readonly template: DemandTemplate;
  /** Die footprint of the product in mm² (drives the die count). */
  readonly dieSizeMm2: number;
  /** Wafer size the order runs on (default 200mm). */
  readonly waferSize?: WaferSize;
  /** Sim-day the offer is issued. */
  readonly issuedDay?: number;
  readonly contractId?: string;
  readonly valueOverrideUsd?: number;
}

/**
 * Generate a priced contract offer for a client.
 *
 * The price is *dynamic*: it is quoted from the market environment at the
 * moment of issue, so the same order is worth far more in a boom than in a
 * bust, and worth less if rivals are undercutting.
 */
export function generateContract(input: GenerateContractInput): Contract {
  const { market, client, template } = input;
  const issuedDay = input.issuedDay ?? market.currentDay;

  const demand: ClientDemand = {
    componentCategory: template.componentCategory,
    targetNode: template.targetNode,
    wafersPerLot: template.wafersPerLot,
    lotCount: template.lotCount,
    requiredGoodDies: requiredDiesFor(
      template,
      input.dieSizeMm2,
      template.wafersPerLot,
      input.waferSize,
    ),
    leadTimeDays: template.leadTimeDays,
    qualityGate: {
      maxDefectDensityPerCm2: template.maxDefectDensityPerCm2,
      minAcceptableYield: template.minAcceptableYield,
    },
    qualityWeight: template.qualityWeight,
  };

  const breakdown = priceContract(market, client, demand);
  const totalValueUsd = input.valueOverrideUsd ?? breakdown.totalValueUsd;

  const terms: ContractTerms = {
    totalValueUsd,
    finalPaymentFraction: 1,
    retentionFraction: client.strictness > 0.6 ? 0.1 : 0.05,
    penalties: buildPenalties(totalValueUsd, client, demand, template.leadTimeDays),
    currency: 'USD',
  };

  return Object.freeze({
    id: input.contractId ?? `CTR-${client.id.toUpperCase()}-${issuedDay}`,
    client,
    demand,
    terms,
    status: ContractStatus.OFFERED,
    issuedDay,
    deliveryDeadlineDay: issuedDay + template.leadTimeDays,
    deliveredLotIds: [],
    deliveredDies: 0,
  });
}

/** Mutable board state for one contract (the immutable record plus progress). */
export interface ContractRecord {
  readonly contract: Contract;
  status: ContractStatus;
  deliveredLotIds: string[];
  deliveredDies: number;
  /** Sim-day the last lot was delivered. */
  lastDeliveryDay: number | null;
  /** Total penalties levied on this contract so far. */
  penaltyAccruedUsd: number;
}

/**
 * The contract board: offers the player can accept, plus the live progress of
 * every accepted contract.
 */
export class ContractBoard {
  private readonly records = new Map<string, ContractRecord>();
  private counter = 0;

  /** Post a priced offer. */
  offer(contract: Contract): ContractRecord {
    const record: ContractRecord = {
      contract,
      status: ContractStatus.OFFERED,
      deliveredLotIds: [],
      deliveredDies: 0,
      lastDeliveryDay: null,
      penaltyAccruedUsd: 0,
    };
    this.records.set(contract.id, record);
    return record;
  }

  /** Get a contract record. */
  get(contractId: string): ContractRecord {
    const r = this.records.get(contractId);
    if (!r) throw new Error(`[ContractBoard] unknown contract '${contractId}'`);
    return r;
  }

  /** All records. */
  all(): readonly ContractRecord[] {
    return [...this.records.values()];
  }

  /** Offers the player can still accept. */
  openOffers(): readonly ContractRecord[] {
    return this.all().filter((r) => r.status === ContractStatus.OFFERED);
  }

  /** Contracts the player is currently fulfilling. */
  active(): readonly ContractRecord[] {
    return this.all().filter(
      (r) => r.status === ContractStatus.ACCEPTED || r.status === ContractStatus.IN_PRODUCTION,
    );
  }

  /** Accept an offer (player commitment). */
  accept(contractId: string): ContractRecord {
    const record = this.get(contractId);
    if (record.status !== ContractStatus.OFFERED) {
      throw new Error(`[ContractBoard] contract '${contractId}' is ${record.status}, not OFFERED`);
    }
    record.status = ContractStatus.ACCEPTED;
    return record;
  }

  /** Cancel a contract (player or client walks away). */
  cancel(contractId: string): ContractRecord {
    const record = this.get(contractId);
    record.status = ContractStatus.CANCELLED;
    return record;
  }

  /** Mark a contract as being produced. */
  startProduction(contractId: string): ContractRecord {
    const record = this.get(contractId);
    if (record.status === ContractStatus.ACCEPTED) record.status = ContractStatus.IN_PRODUCTION;
    return record;
  }

  /** Record a delivered lot against the contract. */
  recordDelivery(contractId: string, lotId: string, goodDies: number, day: number): ContractRecord {
    const record = this.get(contractId);
    record.deliveredLotIds = [...record.deliveredLotIds, lotId];
    record.deliveredDies += goodDies;
    record.lastDeliveryDay = day;
    if (record.status === ContractStatus.ACCEPTED) record.status = ContractStatus.IN_PRODUCTION;
    return record;
  }

  /** Add accrued penalties to a contract. */
  addPenalty(contractId: string, usd: number): ContractRecord {
    const record = this.get(contractId);
    record.penaltyAccruedUsd += usd;
    return record;
  }

  /** Settle a contract as fully delivered. */
  settle(contractId: string): ContractRecord {
    const record = this.get(contractId);
    record.status = ContractStatus.SETTLED;
    return record;
  }

  /** Flag a contract as breached (late / short / out of spec). */
  breach(contractId: string): ContractRecord {
    const record = this.get(contractId);
    record.status = ContractStatus.BREACHED;
    return record;
  }

  /** Next contract id in sequence. */
  nextId(prefix = 'CTR'): string {
    this.counter += 1;
    return `${prefix}-${String(this.counter).padStart(4, '0')}`;
  }
}
