import { ClientTier } from './enums.ts';
import type { TechnologyNode, ComponentCategory } from '../domain/enums.ts';
import {
  requireNonEmptyString,
  requireInRange,
  requireNonNegativeNumber,
} from '../domain/validation.ts';

/** A customer's quality gate: the maximum defect density they will accept. */
export interface QualityGate {
  /** Maximum acceptable defect density (defects/cm²). */
  readonly maxDefectDensityPerCm2: number;
  /** Minimum acceptable lot yield fraction (0..1). */
  readonly minAcceptableYield: number;
  /** Optional maximum acceptable dies per wafer (a die-size constraint). */
  readonly maxDiesPerWafer?: number;
}

/** A customer's demand: what they want and how much. */
export interface ClientDemand {
  /** Category of chip they buy (GPU, CPU, AUTOMOTIVE_MCU, ...). */
  readonly componentCategory: ComponentCategory;
  /** Target technology node. */
  readonly targetNode: TechnologyNode;
  /** Wafers required per lot. */
  readonly wafersPerLot: number;
  /** Number of lots ordered. */
  readonly lotCount: number;
  /** Total good dies required across the whole order. */
  readonly requiredGoodDies: number;
  /** Days from order acceptance to final delivery. */
  readonly leadTimeDays: number;
  /** Quality gate the shipment must clear. */
  readonly qualityGate: QualityGate;
  /** 0..1 — how much the client values a quality surplus (premium). */
  readonly qualityWeight: number;
}

/** Caller-supplied input for {@link createClient}. */
export interface ClientInput {
  readonly id: string;
  readonly name: string;
  readonly tier: ClientTier;
  /** 0..1 — how hard they are to work with (drives penalty severity). */
  readonly strictness?: number;
  /** 0..1 — probability weight in the offer board. */
  readonly orderWeight?: number;
}

/**
 * A downstream customer.
 *
 * `Client` is immutable identity; the mutable *relationship* state
 * (reputation drift, history, unlocked tiers) lives in {@link ClientBook},
 * so a client can be re-used across many contracts and save files.
 */
export interface Client {
  readonly id: string;
  readonly name: string;
  readonly tier: ClientTier;
  /** 0..1 — how hard the client is on delivery and quality. */
  readonly strictness: number;
  /** Relative frequency of this client in the offer board. */
  readonly orderWeight: number;
}

/** Reputation thresholds that unlock higher-tier contracts. */
const REPUTATION_GATES: Readonly<Record<ClientTier, number>> = {
  [ClientTier.STARTUP]: 0,
  [ClientTier.TIER1]: 35,
  [ClientTier.HYPERSCALE]: 60,
};

/** Build an immutable client. */
export function createClient(input: ClientInput): Client {
  return Object.freeze({
    id: requireNonEmptyString(input.id, 'client.id'),
    name: requireNonEmptyString(input.name, 'client.name'),
    tier: input.tier,
    strictness: requireInRange(input.strictness ?? 0.5, 'client.strictness', 0, 1),
    orderWeight: requireInRange(input.orderWeight ?? 1, 'client.orderWeight', 0, 100),
  });
}

/** Minimum reputation required for a tier. */
export function reputationGate(tier: ClientTier): number {
  return REPUTATION_GATES[tier];
}

/** One historical contract outcome, kept for the client's record. */
export interface ClientHistoryEntry {
  readonly contractId: string;
  readonly grade: string;
  readonly onTime: boolean;
  readonly qualityPassed: boolean;
  readonly deliveredDies: number;
  readonly valueUsd: number;
  readonly reputationDelta: number;
}

/** Mutable per-client relationship state. */
export interface ClientRecord {
  readonly client: Client;
  /** 0..100 — the score that gates contract access. */
  reputationScore: number;
  readonly history: ClientHistoryEntry[];
  /** Total revenue ever collected from this client. */
  lifetimeRevenueUsd: number;
  /** Total penalties ever paid to this client. */
  lifetimePenaltyUsd: number;
}

/**
 * The book of clients, with their mutable relationship state.
 *
 * Reputation moves on every settlement: exemplary on-time shipments open the
 * door to hyperscale work; late or short shipments close it.
 */
export class ClientBook {
  private readonly records = new Map<string, ClientRecord>();

  constructor(clients: readonly Client[] = []) {
    for (const c of clients) this.add(c);
  }

  /** Register a client (or reset its record). */
  add(client: Client, reputationScore = 50): ClientRecord {
    const record: ClientRecord = {
      client,
      reputationScore: requireInRange(reputationScore, 'client.reputationScore', 0, 100),
      history: [],
      lifetimeRevenueUsd: 0,
      lifetimePenaltyUsd: 0,
    };
    this.records.set(client.id, record);
    return record;
  }

  /** Look up a client record. */
  get(clientId: string): ClientRecord {
    const r = this.records.get(clientId);
    if (!r) throw new Error(`[ClientBook] unknown client '${clientId}'`);
    return r;
  }

  /** List of all registered clients. */
  get clients(): readonly Client[] {
    return Array.from(this.records.values()).map((r) => r.client);
  }

  /** All client records. */
  all(): readonly ClientRecord[] {
    return [...this.records.values()];
  }

  /** Reputation score of a client (0..100). */
  reputationOf(clientId: string): number {
    return this.get(clientId).reputationScore;
  }

  /**
   * Can this client place a contract of the given tier right now?
   * A client only ever places contracts at or below its own tier, and its
   * reputation must clear the gate for that tier.
   */
  canPlaceContract(clientId: string, tier: ClientTier): boolean {
    const record = this.get(clientId);
    if (tier !== record.client.tier) return false;
    return record.reputationScore >= reputationGate(tier);
  }

  /**
   * Apply a reputation delta (clamped to 0..100) and append history.
   */
  applyOutcome(clientId: string, entry: ClientHistoryEntry): ClientRecord {
    const record = this.get(clientId);
    const next = Math.min(100, Math.max(0, record.reputationScore + entry.reputationDelta));
    const updated: ClientRecord = {
      ...record,
      reputationScore: next,
      history: [...record.history, entry],
    };
    this.records.set(clientId, updated);
    return updated;
  }

  /** Record money received from a client. */
  addRevenue(clientId: string, usd: number): void {
    const record = this.get(clientId);
    requireNonNegativeNumber(usd, 'revenue.usd');
    this.records.set(clientId, { ...record, lifetimeRevenueUsd: record.lifetimeRevenueUsd + usd });
  }

  /** Record a penalty paid to a client. */
  addPenalty(clientId: string, usd: number): void {
    const record = this.get(clientId);
    requireNonNegativeNumber(usd, 'penalty.usd');
    this.records.set(clientId, { ...record, lifetimePenaltyUsd: record.lifetimePenaltyUsd + usd });
  }
}
