/**
 * Semiconductor Tycoon — Step 4: Advanced Technology Tree.
 *
 * Gates which process nodes a fab can manufacture based on unlocked research
 * and installed equipment capability. Mature nodes (350nm → 7nm) start
 * unlocked; advanced nodes (3nm, 2nm, A16) must be researched in order and
 * require EUV-class lithography, culminating in High-NA EUV for A16
 * (GAA/CFET).
 *
 * Pure, deterministic, no I/O.
 */

import { supportsNode, type Equipment } from '../domain/equipment.ts';
import { LithoSource, ProcessType, TechnologyNode } from '../domain/enums.ts';
import {
  deepFreeze,
  requireInRange,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireOneOf,
  requirePositiveNumber,
} from '../domain/validation.ts';

/** What a fab must have in place before a node can be manufactured. */
export interface TechNodeRequirement {
  readonly node: TechnologyNode;
  readonly name: string;
  /** Marketing / process family (e.g. "FinFET", "GAA", "CFET"). */
  readonly processFamily: string;
  /**
   * Prerequisite node that must be unlocked first (`undefined` = root /
   * already available at game start).
   */
  readonly prerequisiteNode?: TechnologyNode;
  /** Lithography source at least one installed litho tool must use. */
  readonly requiredLithoSource?: LithoSource;
  /** Minimum throughput (wafers/hour) at least one installed tool must reach. */
  readonly minThroughputWph?: number;
  /** Process types that must be represented in the installed tool base. */
  readonly requiredProcessTypes?: readonly ProcessType[];
  /** Research cost in USD to unlock the node. */
  readonly researchCostUsd: number;
  /** Research time in days. */
  readonly researchTimeDays: number;
}

/** Outcome of attempting to unlock a node. */
export interface UnlockResult {
  readonly node: TechnologyNode;
  /** Whether the unlock succeeded. */
  readonly unlocked: boolean;
  /** Human reason when `unlocked === false`. */
  readonly reason?: string;
  /** Research cost charged (0 when the attempt failed before charging). */
  readonly researchCostUsd: number;
  /** Sim-day the attempt was made. */
  readonly day: number;
}

// ---------------------------------------------------------------------------
// Default research tree
// ---------------------------------------------------------------------------

/**
 * Research requirements per node. Roots (`prerequisiteNode === undefined` and
 * `researchCostUsd === 0`) begin unlocked. The chain is:
 *
 *  350nm → 180nm → 90nm → 28nm → 7nm → 3nm → 2nm → A16
 *
 * 3nm and 2nm need EUV lithography; A16 (GAA/CFET) needs High-NA EUV.
 */
export const DEFAULT_TREE_REQUIREMENTS: readonly TechNodeRequirement[] = Object.freeze([
  { node: '350nm', name: '350 nm (bulk CMOS)', processFamily: 'Bulk', researchCostUsd: 0, researchTimeDays: 0 },
  { node: '180nm', name: '180 nm (bulk CMOS)', processFamily: 'Bulk', prerequisiteNode: '350nm', researchCostUsd: 0, researchTimeDays: 0 },
  { node: '90nm', name: '90 nm (bulk CMOS)', processFamily: 'Bulk', prerequisiteNode: '180nm', researchCostUsd: 0, researchTimeDays: 0 },
  { node: '28nm', name: '28 nm (bulk CMOS)', processFamily: 'Bulk', prerequisiteNode: '90nm', researchCostUsd: 0, researchTimeDays: 0 },
  { node: '7nm', name: '7 nm (FinFET)', processFamily: 'FinFET', prerequisiteNode: '28nm', researchCostUsd: 0, researchTimeDays: 0 },
  {
    node: '3nm',
    name: '3 nm (FinFET, EUV)',
    processFamily: 'FinFET',
    prerequisiteNode: '7nm',
    requiredLithoSource: LithoSource.EUV,
    researchCostUsd: 120_000_000,
    researchTimeDays: 60,
  },
  {
    node: '2nm',
    name: '2 nm (GAA nanosheet, EUV)',
    processFamily: 'GAA',
    prerequisiteNode: '3nm',
    requiredLithoSource: LithoSource.EUV,
    minThroughputWph: 100,
    researchCostUsd: 260_000_000,
    researchTimeDays: 90,
  },
  {
    node: 'A16',
    name: 'A16 (GAA / CFET, High-NA EUV)',
    processFamily: 'CFET',
    prerequisiteNode: '2nm',
    requiredLithoSource: LithoSource.EUV,
    minThroughputWph: 120,
    researchCostUsd: 520_000_000,
    researchTimeDays: 120,
  },
] as const);

/**
 * Build the default tech tree with all requirements pre-registered.
// ---------------------------------------------------------------------------
// AdvancedTechTree
// ---------------------------------------------------------------------------

/**
 * The player's technology-tree state. Tracks unlocked nodes and the research
 * log. Manufacturability is checked against the installed equipment base on
 * demand (not stored), so selling or downing a tool immediately takes effect.
 */
export class AdvancedTechTree {
  private readonly requirements: ReadonlyMap<TechnologyNode, TechNodeRequirement>;
  private readonly unlocked = new Set<TechnologyNode>();
  private readonly log: UnlockResult[] = [];

  constructor(requirements: readonly TechNodeRequirement[] = DEFAULT_TREE_REQUIREMENTS) {
    const reqs = new Map<TechnologyNode, TechNodeRequirement>();
    for (const r of requirements) {
      requireNonEmptyString(r.name, `tree.${r.node}.name`);
      requireNonNegativeNumber(r.researchCostUsd, `tree.${r.node}.researchCostUsd`);
      requireNonNegativeNumber(r.researchTimeDays, `tree.${r.node}.researchTimeDays`);
      if (r.requiredLithoSource !== undefined) {
        requireOneOf(r.requiredLithoSource, `tree.${r.node}.requiredLithoSource`, Object.values(LithoSource));
      }
      if (r.minThroughputWph !== undefined) {
        requirePositiveNumber(r.minThroughputWph, `tree.${r.node}.minThroughputWph`);
      }
      if (r.prerequisiteNode !== undefined) {
        requireOneOf(r.prerequisiteNode, `tree.${r.node}.prerequisiteNode`, Object.values(TechnologyNode));
      }
      if (r.requiredProcessTypes !== undefined) {
        for (const p of r.requiredProcessTypes) {
          requireOneOf(p, `tree.${r.node}.requiredProcessTypes[]`, Object.values(ProcessType));
        }
      }
      reqs.set(r.node, r);
      // Zero-cost (mature / already-available) nodes start unlocked.
      if (r.researchCostUsd === 0) {
        this.unlocked.add(r.node);
      }
    }
    this.requirements = Object.freeze(reqs);
  }

  /** Every node currently unlocked. */
  get unlockedNodes(): readonly TechnologyNode[] {
    return [...this.unlocked].sort(
      (a, b) => this.requirements.get(a)!.name.localeCompare(this.requirements.get(b)!.name),
    );
  }

  /** Whether `node` is unlocked. */
  isUnlocked(node: TechnologyNode): boolean {
    return this.unlocked.has(node);
  }

  /** The research requirement for `node`, or `undefined` if unknown. */
  requirementFor(node: TechnologyNode): TechNodeRequirement | undefined {
    return this.requirements.get(node);
  }

  /** Nodes not yet unlocked whose prerequisite is met and which are affordable. */
  nextResearchableNodes(cashUsd: number): TechnologyNode[] {
    const out: TechnologyNode[] = [];
    for (const [node, req] of this.requirements) {
      if (this.unlocked.has(node)) continue;
      if (req.prerequisiteNode !== undefined && !this.unlocked.has(req.prerequisiteNode)) continue;
      if (req.researchCostUsd > cashUsd) continue;
      out.push(node);
    }
    return out.sort(
      (a, b) => this.requirements.get(a)!.researchCostUsd - this.requirements.get(b)!.researchCostUsd,
    );
  }
/**
   * Attempt to unlock `node` on `day`. Charges `researchCostUsd` from
   * `cashUsd` and returns the remaining cash plus an `UnlockResult`. Fails
   * (no cash moved) when the prerequisite is missing, the node is already
   * unlocked, or cash is insufficient.
   */
  unlock(
    node: TechnologyNode,
    day: number,
    cashUsd: number,
  ): { readonly result: UnlockResult; readonly remainingCashUsd: number } {
    const req = this.requirements.get(node);
    const base: UnlockResult = { node, unlocked: false, researchCostUsd: 0, day };

    if (!req) {
      return { result: { ...base, reason: `unknown node '${node}'` }, remainingCashUsd: cashUsd };
    }
    if (this.unlocked.has(node)) {
      return { result: { ...base, reason: `node '${node}' already unlocked` }, remainingCashUsd: cashUsd };
    }
    if (req.prerequisiteNode !== undefined && !this.unlocked.has(req.prerequisiteNode)) {
      return {
        result: { ...base, reason: `prerequisite '${req.prerequisiteNode}' not yet unlocked`, researchCostUsd: req.researchCostUsd },
        remainingCashUsd: cashUsd,
      };
    }
    if (cashUsd < req.researchCostUsd) {
      return {
        result: {
          ...base,
          reason: `insufficient funds: need $${req.researchCostUsd.toLocaleString()}, have $${cashUsd.toLocaleString()}`,
          researchCostUsd: req.researchCostUsd,
        },
        remainingCashUsd: cashUsd,
      };
    }

    this.unlocked.add(node);
    const result: UnlockResult = { node, unlocked: true, researchCostUsd: req.researchCostUsd, day };
    this.log.push(result);
    return { result, remainingCashUsd: cashUsd - req.researchCostUsd };
  }

  /**
   * Whether the installed equipment base can manufacture `node`.
   *
   * Requires the node to be unlocked, at least one lithography tool matching
   * `requiredLithoSource`, every `requiredProcessType` represented by an
   * installed tool, and (when set) some tool meeting `minThroughputWph`.
   */
  canManufacture(node: TechnologyNode, installedEquipment: readonly Equipment[]): boolean {
    const req = this.requirements.get(node);
    if (!req || !this.unlocked.has(node)) return false;

    if (req.requiredLithoSource !== undefined) {
      const hasLitho = installedEquipment.some(
        (e) => e.processType === ProcessType.LITHOGRAPHY &&
          e.lithoSource === req.requiredLithoSource &&
          supportsNode(e, node),
      );
      if (!hasLitho) return false;
    }

    if (req.requiredProcessTypes !== undefined) {
      for (const p of req.requiredProcessTypes) {
        if (!installedEquipment.some((e) => e.processType === p)) return false;
      }
    }

    if (req.minThroughputWph !== undefined) {
      const meetsThroughput = installedEquipment.some((e) => e.throughputWph >= req.minThroughputWph!);
      if (!meetsThroughput) return false;
    }

    return true;
  }

  /** The full, immutable research log (oldest first). */
  get researchLog(): readonly UnlockResult[] {
    return Object.freeze([...this.log]);
  }
}

export function createDefaultTree(): AdvancedTechTree {
  return new AdvancedTechTree(DEFAULT_TREE_REQUIREMENTS);
}
