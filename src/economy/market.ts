import { MarketPhase } from './enums.ts';
import { NODE_SPECS } from '../domain/nodeSpecs.ts';
import type { TechnologyNode } from '../domain/enums.ts';
import { requireNonNegativeNumber, requirePositiveNumber } from '../domain/validation.ts';

/** How a node's ASP index moves as the cycle progresses. */
export interface NodeMarketState {
  /** ASP index for this node; 1.0 = the cycle's neutral level. */
  readonly priceIndex: number;
  /** End-demand multiplier (volume pull from the end market). */
  readonly demandIndex: number;
  /** Supply multiplier (how much capacity is chasing the demand). */
  readonly supplyIndex: number;
  /** Tool lead time in weeks — lengthens in a boom, shortens in a bust. */
  readonly leadTimeWeeks: number;
}

/** A rival fab competing for the same customers. */
export interface Competitor {
  readonly id: string;
  readonly name: string;
  /** Nodes this rival manufactures. */
  readonly nodes: readonly TechnologyNode[];
  /** How price-aggressive the rival is (1.0 = market price; <1 = undercuts). */
  readonly priceAggression: number;
  /** Relative capacity of the rival (1.0 = the player's fab). */
  readonly capacityFactor: number;
  /** Rival's own yield (0..1) — a high-yield rival pressures the player. */
  readonly yieldRate: number;
}

/** Tunables for the market simulation. */
export interface MarketOptions {
  /** Baseline ASP per good die (USD) at index 1.0, per node. */
  readonly baseDiePriceUsd?: Partial<Record<TechnologyNode, number>>;
  /** Competitors in the pool. */
  readonly competitors?: readonly Competitor[];
  /** Probability weights for the phase transition lottery. */
  readonly phaseWeights?: Partial<Record<MarketPhase, number>>;
  /** Simulated days per tick (default 1). */
  readonly daysPerTick?: number;
  /** Seed for the deterministic RNG (default 1337). */
  readonly seed?: number;
}

/** A snapshot of everything the economy needs to know about the market. */
export interface MarketSnapshot {
  readonly phase: MarketPhase;
  /** Days elapsed in the simulation. */
  readonly day: number;
  /** Overall demand multiplier across all nodes. */
  readonly demandIndex: number;
  /** Overall supply multiplier across all nodes. */
  readonly supplyIndex: number;
  /** Blended competitor price level (0.9 = rivals undercut by 10%). */
  readonly competitorPriceLevel: number;
  /** Blended tool lead time in weeks. */
  readonly leadTimeWeeks: number;
  /** Default rate at which contracts default in this phase (0..1). */
  readonly defaultRate: number;
  readonly byNode: Readonly<Record<TechnologyNode, NodeMarketState>>;
  readonly competitors: readonly Competitor[];
}

/** Deterministic mulberry32 PRNG (mirrors the factory engine's style). */
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

/** Base ASP per good die (USD) at a neutral index of 1.0, per node. */
const DEFAULT_DIE_PRICE: Record<TechnologyNode, number> = {
  '350nm': 0.85,
  '250nm': 1.1,
  '180nm': 1.6,
  '130nm': 2.4,
  '90nm': 4.2,
  '65nm': 6.5,
  '45nm': 9.0,
  '28nm': 14.5,
  '16nm_finfet': 28,
  '7nm': 58,
  '5nm': 95,
  '3nm': 145,
  '2nm_gaa': 260,
  '2nm': 320,
  'A16': 450,
  'a16_cfet': 520,
  'a10': 720,
};

/**
 * Phase dynamics: how demand/supply/price/default-rate move per phase, and
 * how likely the market is to roll into each next phase.
 *
 * The numbers encode the real industry pattern: end-demand is *sticky* (it
 * moves ±), while price is *elastic* (capacity lags, so ASPs overshoot).
 */
const PHASE_PROFILE: Record<
  MarketPhase,
  {
    /** Demand change applied per phase step (multiplicative). */
    readonly demandDelta: number;
    /** Supply change applied per phase step (multiplicative). */
    readonly supplyDelta: number;
    /** Price change applied per phase step (multiplicative). */
    readonly priceDelta: number;
    /** Baseline probability that a client defaults on a due contract. */
    readonly defaultRate: number;
    /** Tool lead-time multiplier for the phase. */
    readonly leadTimeFactor: number;
  }
> = {
  DOWNTURN: { demandDelta: 0.82, supplyDelta: 0.99, priceDelta: 0.78, defaultRate: 0.14, leadTimeFactor: 0.7 },
  RECOVERY: { demandDelta: 1.14, supplyDelta: 0.97, priceDelta: 0.95, defaultRate: 0.06, leadTimeFactor: 0.85 },
  EXPANSION: { demandDelta: 1.12, supplyDelta: 1.02, priceDelta: 1.1, defaultRate: 0.02, leadTimeFactor: 1.0 },
  BOOM: { demandDelta: 1.3, supplyDelta: 1.0, priceDelta: 1.35, defaultRate: 0.01, leadTimeFactor: 1.8 },
  PEAK: { demandDelta: 1.08, supplyDelta: 1.12, priceDelta: 1.12, defaultRate: 0.03, leadTimeFactor: 1.4 },
};

/** Legal phase transitions — the cycle is a ring with a boom/peak overshoot. */
const NEXT_PHASE: Record<MarketPhase, MarketPhase> = {
  DOWNTURN: 'RECOVERY',
  RECOVERY: 'EXPANSION',
  EXPANSION: 'BOOM',
  BOOM: 'PEAK',
  PEAK: 'DOWNTURN',
};

/** Default transition weights — the market drifts toward the next phase. */
const DEFAULT_PHASE_WEIGHTS: Record<MarketPhase, number> = {
  DOWNTURN: 1,
  RECOVERY: 1,
  EXPANSION: 1,
  BOOM: 1,
  PEAK: 1,
};

/** Nodes that ride the AI supercycle hardest. */
const AI_CYCLE_NODES: readonly TechnologyNode[] = ['7nm', '3nm', '2nm', 'A16'];

// ---------------------------------------------------------------------------
// MarketEnvironment
// ---------------------------------------------------------------------------

/**
 * The macroeconomic engine: a cyclical semiconductor industry.
 *
 * Responsibilities:
 *  - run the business cycle (DOWNTURN → RECOVERY → EXPANSION → BOOM → PEAK),
 *  - maintain a per-node ASP index, demand index and supply index,
 *  - expose blended competitor pricing and tool lead times,
 *  - price a good die for any node at any moment,
 *  - quote a contract's value from live market conditions.
 *
 * All state is plain data; the class is deliberately free of I/O so it can be
 * driven deterministically from a test or a save file.
 */
export class MarketEnvironment {
  private phase: MarketPhase;
  private dayCounter: number;
  private readonly rng: () => number;
  private readonly daysPerTick: number;
  private readonly baseDiePrice: Record<TechnologyNode, number>;
  private readonly weights: Record<MarketPhase, number>;
  readonly competitors: readonly Competitor[];

  /** Per-node mutable market state. */
  private readonly nodeState: Map<TechnologyNode, NodeMarketState>;

  constructor(options: MarketOptions = {}) {
    this.rng = makeRng(options.seed ?? 1337);
    this.daysPerTick = requirePositiveNumber(options.daysPerTick ?? 1, 'market.daysPerTick');
    this.dayCounter = 0;
    this.phase = MarketPhase.EXPANSION;
    this.competitors = Object.freeze([...(options.competitors ?? [])]);

    const prices = { ...DEFAULT_DIE_PRICE, ...(options.baseDiePriceUsd ?? {}) } as Record<
      TechnologyNode,
      number
    >;
    for (const node of Object.keys(prices) as TechnologyNode[]) {
      requirePositiveNumber(prices[node], `market.baseDiePriceUsd.${node}`);
    }
    this.baseDiePrice = prices;

    this.weights = { ...DEFAULT_PHASE_WEIGHTS, ...(options.phaseWeights ?? {}) };

    this.nodeState = new Map();
    for (const node of Object.keys(NODE_SPECS) as TechnologyNode[]) {
      this.nodeState.set(node, {
        priceIndex: 1,
        demandIndex: 1,
        supplyIndex: 1,
        leadTimeWeeks: 12,
      });
    }
  }

  /** Current cycle phase. */
  get currentPhase(): MarketPhase {
    return this.phase;
  }

  /** Days elapsed. */
  get currentDay(): number {
    return this.dayCounter;
  }

  /** Market state for a single node. */
  stateFor(node: TechnologyNode): NodeMarketState {
    const s = this.nodeState.get(node);
    if (!s) throw new Error(`[MarketEnvironment] unknown node '${node}'`);
    return s;
  }

  /**
   * Advance the market by one tick. Each tick the phase may roll forward,
   * then every node's demand/supply/price indices are re-based.
   */
  tick(): MarketSnapshot {
    this.dayCounter += this.daysPerTick;
    this.rollPhase();

    const profile = PHASE_PROFILE[this.phase];
    for (const node of Object.keys(this.nodeState) as TechnologyNode[]) {
      const cur = this.stateFor(node);

      // AI-era nodes (GPU / AI accelerator silicon) amplify the cycle.
      const cycleGain = AI_CYCLE_NODES.includes(node) ? 1.35 : 1;
      const matureDrag = node === '350nm' ? 0.85 : 1; // legacy nodes don't boom

      const demand = cur.demandIndex * (1 + (profile.demandDelta - 1) * cycleGain * matureDrag);
      const supply = cur.supplyIndex * (1 + (profile.supplyDelta - 1) * matureDrag);
      // Price tracks the demand/supply imbalance — and overshoots, as it does IRL.
      const imbalance = demand / Math.max(supply, 0.05);
      const priceTarget = Math.pow(imbalance, 0.9);
      const price = cur.priceIndex * (1 + (priceTarget - 1) * 0.35) * profile.priceDelta ** 0.35;

      this.nodeState.set(node, {
        priceIndex: clamp(price, 0.25, 6),
        demandIndex: clamp(demand, 0.15, 8),
        supplyIndex: clamp(supply, 0.15, 8),
        leadTimeWeeks: clamp(12 * profile.leadTimeFactor * (0.7 + imbalance * 0.4), 3, 120),
      });
    }
    return this.snapshot();
  }

  /** Roll the cycle phase with a weighted lottery (with market inertia). */
  private rollPhase(): void {
    const next = NEXT_PHASE[this.phase];
    const wNext = this.weights[next];
    const wStay = this.weights[this.phase] * 1.6; // markets rarely flip overnight
    const total = wNext + wStay;
    if (this.rng() < wNext / total) {
      this.phase = next;
    }
  }

  /** Current market snapshot. */
  snapshot(): MarketSnapshot {
    const nodes = Object.keys(NODE_SPECS) as TechnologyNode[];
    let demand = 0;
    let supply = 0;
    let lead = 0;
    const byNode = {} as Record<TechnologyNode, NodeMarketState>;
    for (const node of nodes) {
      const s = this.stateFor(node);
      byNode[node] = s;
      demand += s.demandIndex;
      supply += s.supplyIndex;
      lead += s.leadTimeWeeks;
    }
    const n = nodes.length;
    const profile = PHASE_PROFILE[this.phase];

    return Object.freeze({
      phase: this.phase,
      day: this.dayCounter,
      demandIndex: demand / n,
      supplyIndex: supply / n,
      competitorPriceLevel: this.competitorPriceLevel(),
      leadTimeWeeks: lead / n,
      defaultRate: profile.defaultRate,
      byNode: Object.freeze(byNode),
      competitors: this.competitors,
    });
  }

  /**
   * Blended competitor price level.
   *
   * Each rival is priced off the market index then pulled toward its own
   * aggression; the blend is capacity-weighted, so a giant rival moves the
   * market more than a boutique shop.
   */
  competitorPriceLevel(): number {
    if (this.competitors.length === 0) return 1;
    let weighted = 0;
    let weight = 0;
    for (const c of this.competitors) {
      const nodePrices = c.nodes.map((nd) => this.stateFor(nd).priceIndex);
      const avg = nodePrices.length > 0 ? nodePrices.reduce((a, b) => a + b, 0) / nodePrices.length : 1;
      // A rival with better yield can hold a higher price; a low-yield rival
      // has to discount to win the same socket.
      const yieldSupport = 1 + (c.yieldRate - 0.75) * 0.8;
      const price = avg * c.priceAggression * yieldSupport;
      weighted += price * c.capacityFactor;
      weight += c.capacityFactor;
    }
    return weight > 0 ? weighted / weight : 1;
  }

  /**
   * Current price of one good die at a node, in USD.
   *
   * @param node    technology node
   * @param quality 0..1 quality factor of the die (quality commands a premium)
   */
  pricePerGoodDie(node: TechnologyNode, quality = 1): number {
    const s = this.stateFor(node);
    const base = this.baseDiePrice[node];
    const qualityMultiplier = 0.6 + 0.8 * clamp(quality, 0, 1);
    const scarcity = s.priceIndex / Math.max(s.demandIndex * 0.5 + s.supplyIndex * 0.5, 0.05);
    return base * s.priceIndex * qualityMultiplier * clamp(scarcity, 0.5, 2.2);
  }

  /**
   * Quote the market value of `units` good dies at a node.
   * Rival pricing pushes the achievable price down.
   */
  quoteDieValueUsd(node: TechnologyNode, units: number, quality = 1): number {
    const rivalDiscount = clamp(this.competitorPriceLevel(), 0.6, 1.4);
    return this.pricePerGoodDie(node, quality) * units * rivalDiscount;
  }

  /**
   * Probability that a client defaults on a contract due today, in this phase.
   * Longer overdue periods raise the risk.
   */
  defaultProbability(overdueDays = 0): number {
    const base = PHASE_PROFILE[this.phase].defaultRate;
    const overdue = Math.min(overdueDays / 90, 1) * 0.3;
    return clamp(base + overdue, 0, 0.95);
  }

  /**
   * Tool lead time (weeks) for a node — how long a new order for capacity
   * takes to arrive. Lengthens sharply in a boom.
   */
  leadTimeWeeksFor(node: TechnologyNode): number {
    return this.stateFor(node).leadTimeWeeks;
  }
}

/** Clamp helper. */
function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
