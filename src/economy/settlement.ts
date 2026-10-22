import { ContractStatus, ShipmentGrade } from './enums.ts';
import type { ContractBoard } from './contract.ts';
import type { ClientBook } from './client.ts';
import type { FinancialSystem } from './financials.ts';
import type { MarketEnvironment } from './market.ts';

/** Quality metrics of a delivered lot, measured against the contract gate. */
export interface DeliveryQuality {
  /** Good dies delivered in this lot. */
  readonly goodDies: number;
  /** Total dies produced (gross). */
  readonly totalDies: number;
  /** Achieved yield fraction (0..1). */
  readonly yieldFraction: number;
  /** Measured defect density (defects/cm²). */
  readonly defectDensityPerCm2: number;
}

/** A single lot being delivered against a contract. */
export interface LotDelivery {
  readonly lotId: string;
  readonly quality: DeliveryQuality;
  /** Sim-day the lot shipped. */
  readonly shipDay: number;
}

/** The outcome of settling a contract. */
export interface SettlementResult {
  readonly contractId: string;
  readonly clientId: string;
  readonly grade: ShipmentGrade;
  readonly onTime: boolean;
  readonly qualityPassed: boolean;
  /** Good dies delivered across all lots. */
  readonly deliveredDies: number;
  /** Good dies the client required. */
  readonly requiredDies: number;
  /** Days late (0 if on time). */
  readonly daysLate: number;
  /** Gross contract value. */
  readonly contractValueUsd: number;
  /** Value of the dies actually delivered (pro-rated). */
  readonly deliveredValueUsd: number;
  /** Total penalties levied (late + short + quality). */
  readonly penaltyUsd: number;
  /** Net cash received by the player. */
  readonly netPaymentUsd: number;
  /** Reputation delta applied to the client. */
  readonly reputationDelta: number;
  /** Final contract status. */
  readonly finalStatus: ContractStatus;
  /** Human-readable explanation lines for the settlement log. */
  readonly notes: readonly string[];
}

/** Options for the settlement engine. */
export interface SettlementOptions {
  /** Multiplier on the revenue actually collected (a client can pay late/part). */
  readonly collectionRate?: number;
  /** Whether the client might default (rolled against the market). */
  readonly allowDefault?: boolean;
}

/** Reputation gained or lost per grade. */
const REPUTATION_DELTA: Record<ShipmentGrade, number> = {
  EXEMPLARY: 8,
  ON_SPEC: 3,
  MARGINAL: -2,
  LATE: -6,
  SHORT: -8,
  REJECTED: -15,
};

/**
 * The settlement engine: decides whether a delivery was good, on time and
 * complete, applies the contract's penalty schedule, moves cash, and updates
 * the client's reputation.
 */
export class SettlementEngine {
  private readonly rng: () => number;
  private readonly financials: FinancialSystem;
  private readonly clients: ClientBook;
  private readonly market: MarketEnvironment;
  private readonly options: SettlementOptions;

  constructor(
    financials: FinancialSystem,
    clients: ClientBook,
    market: MarketEnvironment,
    options: SettlementOptions = {},
    seed = 4242,
  ) {
    this.financials = financials;
    this.clients = clients;
    this.market = market;
    this.options = options;
    this.rng = makeRng(seed);
  }

  /**
   * Settle a contract against the lots that were shipped.
   *
   * @param board  the contract board holding the contract's live state
   * @param deliveries the lots delivered against the contract
   */
  settle(
    board: ContractBoard,
    contractId: string,
    deliveries: readonly LotDelivery[],
  ): SettlementResult {
    const record = board.get(contractId);
    const { contract } = record;
    const notes: string[] = [];

    const deliveredDies = deliveries.reduce((s, d) => s + d.quality.goodDies, 0);
    const totalDies = deliveries.reduce((s, d) => s + d.quality.totalDies, 0);
    const weightedYield = totalDies > 0 ? deliveredDies / totalDies : 0;
    const defectDensity =
      deliveries.length > 0
        ? deliveries.reduce((s, d) => s + d.quality.defectDensityPerCm2, 0) / deliveries.length
        : Number.POSITIVE_INFINITY;

    const gate = contract.demand.qualityGate;
    const qualityPassed =
      defectDensity <= gate.maxDefectDensityPerCm2 && weightedYield >= gate.minAcceptableYield;
    if (!qualityPassed) {
      notes.push(
        `Quality gate missed: defect density ${defectDensity.toFixed(3)}/cm2 ` +
          `(limit ${gate.maxDefectDensityPerCm2.toFixed(3)}), yield ${(weightedYield * 100).toFixed(1)}% ` +
          `(min ${(gate.minAcceptableYield * 100).toFixed(1)}%).`,
      );
    }

    // Schedule: the contract is late if the final lot missed the deadline.
    const lastShipDay =
      deliveries.length > 0 ? Math.max(...deliveries.map((d) => d.shipDay)) : contract.issuedDay;
    const daysLate = Math.max(0, lastShipDay - contract.deliveryDeadlineDay);
    const onTime = daysLate === 0;
    if (!onTime) notes.push(`Delivered ${daysLate} day(s) after the deadline.`);

    // Quantity: the client needs a minimum number of good dies.
    const shortfall = Math.max(0, contract.demand.requiredGoodDies - deliveredDies);
    const short = shortfall > 0;
    if (short) {
      notes.push(`Short ${shortfall} good dies of ${contract.demand.requiredGoodDies} required.`);
    }

    const penalties = contract.terms.penalties;
    let penaltyUsd = 0;
    if (!onTime) penaltyUsd += penalties.perDayLateUsd * daysLate;
    if (short) penaltyUsd += penalties.perShortDieUsd * shortfall;
    if (!qualityPassed) penaltyUsd += penalties.qualityFailureUsd;
    penaltyUsd = Math.min(penaltyUsd, penalties.maxPenaltyUsd);

    // Revenue: the client pays for the dies actually delivered, pro-rated
    // against the order, minus any liquidated damages.
    const proRatedValue =
      contract.demand.requiredGoodDies > 0
        ? contract.terms.totalValueUsd * Math.min(1, deliveredDies / contract.demand.requiredGoodDies)
        : 0;
    const qualityBonus = qualityPassed && weightedYield > gate.minAcceptableYield + 0.05 ? 1.05 : 1;
    const deliveredValueUsd = proRatedValue * qualityBonus;

    // Client credit risk: in a downturn, a shipment can simply not be paid.
    let collectionRate = this.options.collectionRate ?? 1;
    if (this.options.allowDefault !== false) {
      const defaultRisk = this.market.defaultProbability(daysLate);
      if (defaultRisk > 0 && this.rng() < defaultRisk) {
        collectionRate = 0.2;
        notes.push(`Client defaulted on payment (${(defaultRisk * 100).toFixed(1)}% market risk).`);
      }
    }

    const grossPayment = deliveredValueUsd * collectionRate;
    const netPaymentUsd = Math.max(0, grossPayment - penaltyUsd);

    // Move the money.
    const day = lastShipDay;
    if (grossPayment > 0) {
      this.financials.recogniseRevenue(contractId, grossPayment, day);
    }
    if (penaltyUsd > 0) {
      this.financials.chargePenalty(contractId, penaltyUsd, day);
      board.addPenalty(contractId, penaltyUsd);
    }
    this.clients.addRevenue(contract.client.id, grossPayment);
    if (penaltyUsd > 0) this.clients.addPenalty(contract.client.id, penaltyUsd);

    // Grade the shipment.
    const grade = this.gradeShipment({
      qualityPassed,
      onTime,
      short,
      weightedYield,
      minYield: gate.minAcceptableYield,
    });

    const reputationDelta = REPUTATION_DELTA[grade];
    this.clients.applyOutcome(contract.client.id, {
      contractId,
      grade,
      onTime,
      qualityPassed,
      deliveredDies,
      valueUsd: grossPayment,
      reputationDelta,
    });

    const finalStatus =
      qualityPassed && onTime && !short ? ContractStatus.SETTLED : ContractStatus.BREACHED;
    if (finalStatus === ContractStatus.SETTLED) board.settle(contractId);
    else board.breach(contractId);

    return Object.freeze({
      contractId,
      clientId: contract.client.id,
      grade,
      onTime,
      qualityPassed,
      deliveredDies,
      requiredDies: contract.demand.requiredGoodDies,
      daysLate,
      contractValueUsd: contract.terms.totalValueUsd,
      deliveredValueUsd,
      penaltyUsd,
      netPaymentUsd,
      reputationDelta,
      finalStatus,
      notes: Object.freeze(notes),
    });
  }

  /**
   * Grade a shipment. The worst failing dimension names the grade, so a
   * client always learns *why* they were unhappy.
   */
  private gradeShipment(input: {
    qualityPassed: boolean;
    onTime: boolean;
    short: boolean;
    weightedYield: number;
    minYield: number;
  }): ShipmentGrade {
    if (!input.qualityPassed) return ShipmentGrade.REJECTED;
    if (input.short) return ShipmentGrade.SHORT;
    if (!input.onTime) return ShipmentGrade.LATE;
    if (input.weightedYield >= input.minYield + 0.08) return ShipmentGrade.EXEMPLARY;
    if (input.weightedYield >= input.minYield + 0.02) return ShipmentGrade.ON_SPEC;
    return ShipmentGrade.MARGINAL;
  }

  /**
   * Roll against the market's default probability for this phase.
   * Split out so it can be stubbed in tests.
   */
  private rollDefault(probability: number): boolean {
    return this.rng() < probability;
  }
}

/** Deterministic mulberry32 PRNG (same algorithm as the market engine). */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
