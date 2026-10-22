/**
 * Semiconductor Tycoon — weekly production pacing.
 *
 * The tick-level {@link Factory} simulator answers "what happens in the next
 * minute". This module answers the question a *player* actually asks:
 * "what do I commit to this week, and what does it cost me?"
 *
 * A real fab plans in weekly lots: the planner decides how many lots of each
 * product to start, checks that the line can absorb them without violating
 * Q-Time, and then watches the WIP (work-in-process) build up as those lots
 * move through the 15 stages. This module models that planning loop:
 *
 *   1. {@link planWeek}    — allocate lots to stages given capacity.
 *   2. {@link advanceWeek} — move WIP forward, retire finished lots.
 *   3. {@link weekReport}  — summarise throughput, yield and bottlenecks.
 *
 * Pure and deterministic: no I/O, no clock reads, no randomness. Every input
 * is explicit, so the weekly planner is trivially testable and reproducible.
 */

import { ProcessType } from '../domain/enums.ts';
import type { Equipment } from '../domain/equipment.ts';
import {
  ORDERED_PROCESS_FLOW,
  PROCESS_NODE_BY_ID,
  ProcessNodeId,
  type ProcessNodeSpec,
} from '../domain/processFlow.ts';
import type { ProductRecipe } from '../domain/recipe.ts';
import { deepFreeze, requireNonNegativeInteger, requirePositiveNumber } from '../domain/validation.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minutes in one simulated week (5 fab days x 12 hours x 60). */
export const MINUTES_PER_WEEK = 5 * 12 * 60;

/** Default shift pattern used by the weekly planner. */
export const DEFAULT_SHIFT_HOURS_PER_DAY = 12;

/** Fab days per week (Mon–Fri). */
export const FAB_DAYS_PER_WEEK = 5;

// ---------------------------------------------------------------------------
// Capacity model
// ---------------------------------------------------------------------------

/**
 * The weekly capacity of one installed tool.
 *
 * A tool that runs `throughputWph` wafers/hour for `shiftHours` hours a day
 * for 5 days can move `throughputWph * shiftHours * 5` wafers a week. Since
 * lots are fixed-size, that converts into a whole number of lots.
 */
export interface ToolCapacity {
  readonly equipmentId: string;
  readonly processType: ProcessType;
  readonly weeklyWaferCapacity: number;
  /** Lots this tool can complete per week (floor of wafers / wafers-per-lot). */
  readonly weeklyLotCapacity: number;
}

/** Compute the weekly capacity of one installed tool. */
export function computeToolCapacity(
  equipment: Equipment,
  wafersPerLot: number,
  shiftHoursPerDay: number = DEFAULT_SHIFT_HOURS_PER_DAY,
): ToolCapacity {
  const weeklyWaferCapacity =
    equipment.throughputWph * shiftHoursPerDay * FAB_DAYS_PER_WEEK;
  return deepFreeze({
    equipmentId: equipment.id,
    processType: equipment.processType,
    weeklyWaferCapacity,
    weeklyLotCapacity: Math.floor(weeklyWaferCapacity / wafersPerLot),
  });
}

// ---------------------------------------------------------------------------
// WIP tracking
// ---------------------------------------------------------------------------

/**
 * One lot in flight, tracked against the flow stage it currently occupies.
 *
 * The weekly planner needs to know not just *how many* lots exist but *where*
 * they are, because a lot stuck at a bottleneck stage blocks the stages
 * behind it and inflates cycle time.
 */
export interface WeeklyLot {
  readonly lotId: string;
  readonly recipeId: string;
  /** Index into the recipe's process steps. */
  readonly stepIndex: number;
  /** The flow stage the lot currently occupies (null once it has finished). */
  readonly currentNodeId: ProcessNodeId | null;
  readonly wafersPerLot: number;
  readonly priority: number;
  /** Week the lot was started. */
  readonly startWeek: number;
  /** Week the lot completed (null while in flight). */
  readonly completedWeek: number | null;
  /** Minimum minutes the lot may sit before its current stage. */
  readonly qTimeLimitMinutes: number | null;
  /** Minutes the lot has already waited at its current stage. */
  readonly waitedMinutes: number;
}

/** Where a lot stands in the flow, derived from its recipe step index. */
export function stageForStep(
  recipe: ProductRecipe,
  stepIndex: number,
): ProcessNodeSpec | null {
  const step = recipe.processSteps[stepIndex];
  if (!step) return null;
  if (step.processNodeId) {
    return PROCESS_NODE_BY_ID[step.processNodeId as ProcessNodeId] ?? null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Weekly plan
// ---------------------------------------------------------------------------

/** One planned lot release. */
export interface PlannedRelease {
  readonly lotId: string;
  readonly recipeId: string;
  readonly wafers: number;
  /** Stage the lot enters the line at (always the flow's first stage). */
  readonly entryNodeId: ProcessNodeId;
  readonly priority: number;
}

/** The plan for one week. */
export interface WeeklyPlan {
  readonly week: number;
  /** Lots the planner intends to start this week. */
  readonly releases: readonly PlannedRelease[];
  /** Wafers released this week. */
  readonly releasedWafers: number;
  /** Per-stage load in wafers, for the bottleneck analysis. */
  readonly stageLoad: Readonly<Record<ProcessNodeId, number>>;
  /** Stages whose weekly load exceeds the line's capacity. */
  readonly overloadedStages: readonly ProcessNodeId[];
  /** Total wafer-minutes of work the plan commits to. */
  readonly committedWaferMinutes: number;
}

/** Input to {@link planWeek}. */
export interface WeeklyPlanInput {
  readonly week: number;
  /** Recipes the player wants to run, with the lot count to start. */
  readonly demand: readonly RecipeDemand[];
  /** Installed tools available to run the flow. */
  readonly equipment: readonly Equipment[];
  /** Lots already in flight. */
  readonly wip: readonly WeeklyLot[];
  /** Recipes by id, used to resolve step counts and stage durations. */
  readonly recipes: ReadonlyMap<string, ProductRecipe>;
  /** Wafers per lot (default: the fab convention of 25). */
  readonly wafersPerLot?: number;
  readonly shiftHoursPerDay?: number;
}

/** A player's expression of demand for one product. */
export interface RecipeDemand {
  readonly recipeId: string;
  /** How many lots to start this week. */
  readonly lots: number;
  readonly priority?: number;
}

/**
 * Plan one week of production.
 *
 * The algorithm is deliberately simple and explainable, because a player has
 * to be able to predict what the planner will do:
 *
 *  1. Compute each installed tool's weekly lot capacity.
 *  2. Compute each stage's *offered load* — how many wafers the demand
 *     would push through it, including the WIP already upstream.
 *  3. Walk the flow in order, and cap the load at each stage by that
 *     stage's capacity. A stage that is over capacity throttles everything
 *     behind it, exactly like a real bottleneck.
 *  4. Convert the surviving per-stage loads back into lot releases.
 *
 * The result is a plan the player can accept, adjust, or reject.
 */
export function planWeek(input: WeeklyPlanInput): WeeklyPlan {
  const wafersPerLot = input.wafersPerLot ?? 25;
  requireNonNegativeInteger(input.week, 'week.week');
  requirePositiveNumber(wafersPerLot, 'week.wafersPerLot');

  // --- 1. capacity per tool class -----------------------------------------
  // Several tools of the same class share the load (two etchers share the
  // etching work), so capacity is summed per class, not per tool.
  const capacityByType = new Map<ProcessType, number>();
  for (const eq of input.equipment) {
    const cap = computeToolCapacity(eq, wafersPerLot, input.shiftHoursPerDay);
    capacityByType.set(
      eq.processType,
      (capacityByType.get(eq.processType) ?? 0) + cap.weeklyLotCapacity,
    );
  }

  // --- 2. WIP already sitting at each stage --------------------------------
  const wipAtStage = new Map<ProcessNodeId, number>();
  for (const stage of ORDERED_PROCESS_FLOW) {
    wipAtStage.set(stage.nodeId, 0);
  }
  for (const lot of input.wip) {
    if (lot.currentNodeId === null) continue;
    wipAtStage.set(
      lot.currentNodeId,
      (wipAtStage.get(lot.currentNodeId) ?? 0) + lot.wafersPerLot,
    );
  }

  // --- 3. resolve demand into a mutable tracking list ----------------------
  interface DemandTrack {
    readonly recipe: ProductRecipe;
    readonly wafers: number;
    readonly priority: number;
    taken: number;
  }
  const demand: DemandTrack[] = [];
  for (const d of input.demand) {
    const recipe = input.recipes.get(d.recipeId);
    if (!recipe) continue;
    const lots = Math.max(0, Math.floor(d.lots));
    if (lots === 0) continue;
    demand.push({
      recipe,
      wafers: lots * wafersPerLot,
      priority: d.priority ?? 0,
      taken: 0,
    });
  }

  // --- 4. bottleneck walk ---------------------------------------------------
  // A wafer entering the line this week must pass through *every* stage, so
  // the number of wafers the line can absorb is limited by the tightest
  // stage's residual capacity (capacity minus the WIP already there).
  //
  // Walking the flow in order also lets us report the true stage load and
  // flag the stages that are over capacity.
  const stageLoad = new Map<ProcessNodeId, number>();
  const overloadedStages: ProcessNodeId[] = [];
  let admitted = Number.POSITIVE_INFINITY;
  let first = true;

  for (const stage of ORDERED_PROCESS_FLOW) {
    const capLots = capacityByType.get(stage.processType) ?? 0;
    const capWafers = capLots * wafersPerLot;
    const alreadyHere = wipAtStage.get(stage.nodeId) ?? 0;

    // WIP already queued here counts against this week's throughput.
    const residual = Math.max(0, capWafers - alreadyHere);

    // The line can only move as much as the tightest stage allows.
    admitted = first ? residual : Math.min(admitted, residual);
    first = false;

    const load = alreadyHere + admitted;
    stageLoad.set(stage.nodeId, load);
    if (capWafers > 0 && load > capWafers) {
      overloadedStages.push(stage.nodeId);
    }
  }

  // Hand the admitted wafers out to demand in priority order.
  const ordered = [...demand].sort(
    (a, b) => b.priority - a.priority || b.wafers - a.wafers,
  );
  let remaining = admitted;
  for (const d of ordered) {
    const take = Math.min(d.wafers, remaining);
    d.taken = take;
    remaining -= take;
  }

  // --- 5. convert admitted wafers back into releases ------------------------
  const releases: PlannedRelease[] = [];
  const entryNodeId = ORDERED_PROCESS_FLOW[0]!.nodeId;
  let releasedWafers = 0;
  let committedWaferMinutes = 0;

  for (const d of ordered) {
    const lots = Math.floor(d.taken / wafersPerLot);
    if (lots <= 0) continue;
    for (let i = 0; i < lots; i += 1) {
      releases.push({
        lotId: `L${input.week}-${d.recipe.recipeId}-${i + 1}`,
        recipeId: d.recipe.recipeId,
        wafers: wafersPerLot,
        entryNodeId,
        priority: d.priority,
      });
    }
    releasedWafers += lots * wafersPerLot;
    committedWaferMinutes += totalCycleMinutes(d.recipe) * lots * wafersPerLot;
  }

  const stageLoadRecord = Object.fromEntries(
    ORDERED_PROCESS_FLOW.map((s) => [s.nodeId, stageLoad.get(s.nodeId) ?? 0]),
  ) as Record<ProcessNodeId, number>;

  return deepFreeze({
    week: input.week,
    releases,
    releasedWafers,
    stageLoad: stageLoadRecord,
    overloadedStages,
    committedWaferMinutes,
  });
}

/** Sum of every step duration in a recipe, in minutes. */
export function totalCycleMinutes(recipe: ProductRecipe): number {
  return recipe.processSteps.reduce((n, s) => n + s.durationMinutes, 0);
}

// ---------------------------------------------------------------------------
// Advancing the week
// ---------------------------------------------------------------------------

/** Result of advancing the fab by one week. */
export interface WeekAdvance {
  readonly week: number;
  /** The WIP after the week elapsed. */
  readonly wip: readonly WeeklyLot[];
  /** Lots that finished their recipe this week. */
  readonly completed: readonly WeeklyLot[];
  /** Lots scrapped this week (Q-Time violation). */
  readonly scrapped: readonly WeeklyLot[];
  /** Of {@link scrapped}, lots scrapped specifically for Q-Time violation. */
  readonly scrappedForQTime: number;
  /** Lots that moved on to a later stage this week. */
  readonly advanced: number;
}

/** Input to {@link advanceWeek}. */
export interface AdvanceWeekInput {
  readonly week: number;
  readonly wip: readonly WeeklyLot[];
  readonly recipes: ReadonlyMap<string, ProductRecipe>;
  /** Wafer-minutes each stage can process this week, per stage id. */
  readonly stageCapacityWaferMinutes: Readonly<Record<ProcessNodeId, number>>;
  /** Yield multiplier applied per stage pass (1.0 = nominal). */
  readonly yieldPerStage?: number;
}

/**
 * Advance the fab by one week.
 *
 * Each stage gets a slice of the week's processing capacity. WIP at a stage
 * is processed in FIFO order until the stage's capacity for the week runs
 * out; whatever moves on advances to the next stage.
 *
 * A lot that waits longer at a stage than its Q-Time allows is scrapped —
 * the weekly planner surfaces these as "late" so the player sees the cost of
 * over-committing.
 */
export function advanceWeek(input: AdvanceWeekInput): WeekAdvance {
  const recipes = input.recipes;

  const capacity = { ...input.stageCapacityWaferMinutes };
  const completed: WeeklyLot[] = [];
  const scrapped: WeeklyLot[] = [];

  // --- upfront Q-Time sweep -----------------------------------------------
  // A lot that has already overstayed its Q-Time sitting at a stage is
  // scrapped before any new processing happens this week.
  let scrappedForQTime = 0;
  const survivedWip: WeeklyLot[] = [];
  for (const lot of input.wip) {
    if (lot.qTimeLimitMinutes !== null && lot.waitedMinutes > lot.qTimeLimitMinutes) {
      scrapped.push(lot);
      scrappedForQTime += 1;
      continue;
    }
    survivedWip.push(lot);
  }

  // Group the survived WIP by the stage each lot currently occupies.
  const byStage = new Map<ProcessNodeId, WeeklyLot[]>();
  for (const stage of ORDERED_PROCESS_FLOW) {
    byStage.set(stage.nodeId, []);
  }
  for (const lot of survivedWip) {
    if (lot.currentNodeId === null) continue;
    byStage.get(lot.currentNodeId)?.push(lot);
  }

  const nextWip: WeeklyLot[] = [];
  let advanced = 0;

  for (const stage of ORDERED_PROCESS_FLOW) {
    const queue = (byStage.get(stage.nodeId) ?? []).slice().sort(
      (a, b) => a.startWeek - b.startWeek || b.priority - a.priority,
    );
    let budget = capacity[stage.nodeId] ?? 0;

    for (const lot of queue) {
      const recipe = recipes.get(lot.recipeId);
      if (!recipe) {
        scrapped.push({ ...lot, completedWeek: null });
        continue;
      }
      const step = recipe.processSteps[lot.stepIndex];
      if (!step) {
        // Past the end of the recipe — this lot is done.
        completed.push({ ...lot, currentNodeId: null, completedWeek: input.week });
        continue;
      }

      // Minutes this lot needs at this stage, scaled by the lot size.
      const lotMinutes = step.durationMinutes;
      const costWaferMinutes = lotMinutes * lot.wafersPerLot;

      if (costWaferMinutes > budget) {
        // Not enough capacity left this week: the lot waits, and its wait
        // counts against the Q-Time clock.
        const waited = lot.waitedMinutes + MINUTES_PER_WEEK;
        const qLimit = lot.qTimeLimitMinutes;
        if (qLimit !== null && waited > qLimit) {
          scrapped.push({
            ...lot,
            waitedMinutes: waited,
            completedWeek: null,
          });
          continue;
        }
        nextWip.push({ ...lot, waitedMinutes: waited });
        continue;
      }

      budget -= costWaferMinutes;

      // Move to the next step.
      const nextIndex = lot.stepIndex + 1;
      const nextStep = recipe.processSteps[nextIndex];
      if (!nextStep) {
        completed.push({
          ...lot,
          stepIndex: nextIndex,
          currentNodeId: null,
          completedWeek: input.week,
          waitedMinutes: 0,
        });
        advanced += 1;
        continue;
      }

      const nextNodeId = stageForStep(recipe, nextIndex)?.nodeId ?? null;
      const nextStage = nextNodeId ? PROCESS_NODE_BY_ID[nextNodeId] : null;
      const qLimit = nextStage?.queueTimeLimitMinutes ?? null;
      nextWip.push({
        ...lot,
        stepIndex: nextIndex,
        currentNodeId: nextNodeId,
        qTimeLimitMinutes: qLimit,
        waitedMinutes: 0,
      });
      advanced += 1;
    }
  }

  return deepFreeze({
    week: input.week,
    wip: nextWip,
    completed,
    scrapped,
    scrappedForQTime,
    advanced,
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/** A weekly summary for the player-facing dashboard. */
export interface WeekReport {
  readonly week: number;
  /** Lots started this week. */
  readonly releasedLots: number;
  /** Lots finished this week. */
  readonly completedLots: number;
  /** Lots scrapped this week. */
  readonly scrappedLots: number;
  /** Lots still in the fab. */
  readonly wipLots: number;
  /** Wafers finished this week. */
  readonly completedWafers: number;
  /** Average cycle time of completed lots, in weeks (null if none finished). */
  readonly averageCycleTimeWeeks: number | null;
  /** The stage holding the most WIP — the week's bottleneck. */
  readonly bottleneckNodeId: ProcessNodeId | null;
  /** WIP count per stage. */
  readonly wipByStage: Readonly<Record<ProcessNodeId, number>>;
  /** Lots that are overdue against their Q-Time limit. */
  readonly lateLots: number;
}

/** Build the weekly summary from a plan, the WIP and the advance result. */
export function weekReport(
  week: number,
  plan: WeeklyPlan,
  wipBefore: readonly WeeklyLot[],
  advance: WeekAdvance,
): WeekReport {
  const wipByStage = Object.fromEntries(
    ORDERED_PROCESS_FLOW.map((s) => [s.nodeId, 0]),
  ) as Record<ProcessNodeId, number>;

  let bottleneckNodeId: ProcessNodeId | null = null;
  let bottleneckCount = 0;
  for (const stage of ORDERED_PROCESS_FLOW) {
    const count = advance.wip.filter((l) => l.currentNodeId === stage.nodeId).length;
    wipByStage[stage.nodeId] = count;
    if (count > bottleneckCount) {
      bottleneckCount = count;
      bottleneckNodeId = stage.nodeId;
    }
  }

  const cycleWeeks = advance.completed.map((l) =>
    l.completedWeek === null ? 0 : Math.max(0, l.completedWeek - l.startWeek),
  );
  const averageCycleTimeWeeks =
    cycleWeeks.length > 0
      ? cycleWeeks.reduce((a, b) => a + b, 0) / cycleWeeks.length
      : null;

  const lateLots = advance.scrappedForQTime +
    advance.wip.filter(
      (l) => l.qTimeLimitMinutes !== null && l.waitedMinutes > l.qTimeLimitMinutes,
    ).length;

  return deepFreeze({
    week,
    releasedLots: plan.releases.length,
    completedLots: advance.completed.length,
    scrappedLots: advance.scrapped.length,
    wipLots: advance.wip.length,
    completedWafers: advance.completed.reduce((n, l) => n + l.wafersPerLot, 0),
    averageCycleTimeWeeks,
    bottleneckNodeId,
    wipByStage,
    lateLots,
  });
}

/**
 * Build the per-stage wafer-minute capacity for a week from installed tools.
 *
 * Each stage's capacity is the sum of its tools' weekly wafer capacity times
 * the stage's own cycle time — i.e. how many wafer-minutes of that stage the
 * line can absorb.
 */
export function stageCapacityForWeek(
  equipment: readonly Equipment[],
  recipes: ReadonlyMap<string, ProductRecipe>,
  wafersPerLot = 25,
  shiftHoursPerDay: number = DEFAULT_SHIFT_HOURS_PER_DAY,
): Record<ProcessNodeId, number> {
  const capByType = new Map<ProcessType, number>();
  for (const eq of equipment) {
    const cap = computeToolCapacity(eq, wafersPerLot, shiftHoursPerDay);
    capByType.set(
      eq.processType,
      (capByType.get(eq.processType) ?? 0) + cap.weeklyWaferCapacity,
    );
  }

  const result = {} as Record<ProcessNodeId, number>;
  for (const stage of ORDERED_PROCESS_FLOW) {
    const wafers = capByType.get(stage.processType) ?? 0;
    result[stage.nodeId] = wafers * stage.cycleTimeMinutes;
  }
  return result;
}

/**
 * The longest stage cycle time in the flow — a lower bound on how long any
 * lot must take, and therefore on the week's minimum WIP residency.
 */
export function flowBottleneckMinutes(): number {
  return ORDERED_PROCESS_FLOW.reduce((n, s) => Math.max(n, s.cycleTimeMinutes), 0);
}

/** How many weeks a lot needs at minimum to traverse the whole flow. */
export function minimumFlowWeeks(): number {
  const total = ORDERED_PROCESS_FLOW.reduce((n, s) => n + s.cycleTimeMinutes, 0);
  return Math.max(1, Math.ceil(total / MINUTES_PER_WEEK));
}
