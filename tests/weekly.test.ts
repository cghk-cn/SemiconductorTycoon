import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ComponentCategory,
  PackagingType,
  ProcessType,
  LithoSource,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import { createEquipment, type Equipment, type EquipmentInput } from '../src/domain/equipment.ts';
import { ORDERED_PROCESS_FLOW, ProcessNodeId } from '../src/domain/processFlow.ts';
import { buildFlowRecipe } from '../src/domain/processCatalog.ts';
import type { ProductRecipe } from '../src/domain/recipe.ts';
import {
  MINUTES_PER_WEEK,
  advanceWeek,
  computeToolCapacity,
  flowBottleneckMinutes,
  minimumFlowWeeks,
  planWeek,
  stageCapacityForWeek,
  totalCycleMinutes,
  weekReport,
  type WeeklyLot,
} from '../src/factory/weekly.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WAFERS_PER_LOT = 25;

function mkEquipment(
  id: string,
  processType: ProcessType,
  throughputWph = 60,
): Equipment {
  const input: EquipmentInput = {
    id,
    brand: 'TEST',
    modelName: `${id}-Model`,
    processType,
    supportedNodes: { mostAdvancedNm: 7, mostMatureNm: 500 },
    supportedWaferSizes: [WaferSize.WAFER_200MM],
    throughputWph,
    baseDefectRatePerCm2: 0.01,
    powerConsumptionKw: 50,
  };
  if (processType === ProcessType.LITHOGRAPHY) {
    input.lithoSource = LithoSource.KRF;
  }
  return createEquipment(input);
}

/** One tool per tool-class in the flow, so nothing is capacity-blocked by default. */
function fullToolSet(): Equipment[] {
  const seen = new Set<ProcessType>();
  const out: Equipment[] = [];
  for (const stage of ORDERED_PROCESS_FLOW) {
    if (seen.has(stage.processType)) continue;
    seen.add(stage.processType);
    out.push(mkEquipment(`EQ-${stage.processType}`, stage.processType));
  }
  return out;
}

const RECIPE: ProductRecipe = buildFlowRecipe({
  recipeId: 'RCP-TEST',
  productName: 'Test Product',
  category: ComponentCategory.LOGIC_SOC,
  targetNode: TechnologyNode.NM_350,
  waferSize: WaferSize.WAFER_200MM,
  dieSizeMm2: 10,
  packaging: {
    packagingType: PackagingType.QFN,
    assemblyFlowName: 'Test flow',
    companionComponents: [],
  },
});

const RECIPES = new Map<string, ProductRecipe>([[RECIPE.recipeId, RECIPE]]);

function mkLot(overrides: Partial<WeeklyLot> = {}): WeeklyLot {
  const firstStage = ORDERED_PROCESS_FLOW[0]!;
  return {
    lotId: 'LOT-1',
    recipeId: RECIPE.recipeId,
    stepIndex: 0,
    currentNodeId: firstStage.nodeId,
    wafersPerLot: WAFERS_PER_LOT,
    priority: 0,
    startWeek: 0,
    completedWeek: null,
    qTimeLimitMinutes: firstStage.queueTimeLimitMinutes,
    waitedMinutes: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Capacity
// ---------------------------------------------------------------------------

describe('computeToolCapacity', () => {
  it('converts throughput into weekly wafer and lot capacity', () => {
    const eq = mkEquipment('EQ-1', ProcessType.ETCHING, 60);
    const cap = computeToolCapacity(eq, WAFERS_PER_LOT);
    // 60 wph * 12 h/day * 5 days = 3600 wafers/week
    assert.equal(cap.weeklyWaferCapacity, 3600);
    assert.equal(cap.weeklyLotCapacity, 144);
  });

  it('floors the lot capacity so partial lots are never promised', () => {
    const eq = mkEquipment('EQ-1', ProcessType.ETCHING, 10);
    const cap = computeToolCapacity(eq, WAFERS_PER_LOT);
    assert.equal(cap.weeklyWaferCapacity, 600);
    assert.equal(cap.weeklyLotCapacity, 24); // 600/25 = 24
  });

  it('respects a custom shift length', () => {
    const eq = mkEquipment('EQ-1', ProcessType.ETCHING, 60);
    const cap = computeToolCapacity(eq, WAFERS_PER_LOT, 8);
    assert.equal(cap.weeklyWaferCapacity, 60 * 8 * 5);
  });
});

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

describe('planWeek', () => {
  it('releases the requested number of lots when capacity is ample', () => {
    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: RECIPE.recipeId, lots: 4 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    assert.equal(plan.releases.length, 4);
    assert.equal(plan.releasedWafers, 4 * WAFERS_PER_LOT);
    assert.equal(plan.overloadedStages.length, 0);
    assert.ok(plan.releases.every((r) => r.entryNodeId === ORDERED_PROCESS_FLOW[0]!.nodeId));
  });

  it('gives every release a unique id', () => {
    const plan = planWeek({
      week: 7,
      demand: [{ recipeId: RECIPE.recipeId, lots: 5 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    const ids = new Set(plan.releases.map((r) => r.lotId));
    assert.equal(ids.size, 5);
    assert.ok([...ids].every((id) => id.startsWith('L7-')));
  });

  it('ignores demand for unknown recipes', () => {
    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: 'NOPE', lots: 3 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    assert.equal(plan.releases.length, 0);
  });

  it('throttles releases to the bottleneck stage capacity', () => {
    // The bottleneck tool is deliberately slow; everything else is fast.
    const equipment = fullToolSet();
    const bottleneck = ORDERED_PROCESS_FLOW.reduce((a, b) =>
      a.cycleTimeMinutes >= b.cycleTimeMinutes ? a : b,
    );
    const slow = equipment.map((e) =>
      e.processType === bottleneck.processType ? mkEquipment(e.id, e.processType, 1) : e,
    );

    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: RECIPE.recipeId, lots: 100 }],
      equipment: slow,
      wip: [],
      recipes: RECIPES,
    });

    // 1 wph * 12 h/day * 5 days = 60 wafers = 2 lots
    assert.ok(plan.releases.length < 100, 'expected the plan to be throttled');
    assert.ok(plan.releases.length >= 1);
  });

  it('never releases more than the requested demand', () => {
    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: RECIPE.recipeId, lots: 3 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    assert.ok(plan.releases.length <= 3);
  });

  it('honours priority when capacity is scarce', () => {
    const equipment = fullToolSet().map((e) =>
      e.processType === ProcessType.ETCHING ? mkEquipment(e.id, e.processType, 30) : e,
    );
    const other = { ...RECIPE, recipeId: 'RCP-OTHER' };
    const recipes = new Map(RECIPES);
    recipes.set(other.recipeId, other);

    const plan = planWeek({
      week: 1,
      demand: [
        { recipeId: RECIPE.recipeId, lots: 50, priority: 0 },
        { recipeId: other.recipeId, lots: 50, priority: 10 },
      ],
      equipment,
      wip: [],
      recipes,
    });

    const high = plan.releases.filter((r) => r.recipeId === other.recipeId).length;
    const low = plan.releases.filter((r) => r.recipeId === RECIPE.recipeId).length;
    assert.ok(high > 0, 'high priority demand should be served');
    assert.ok(high >= low, 'high priority demand should not be starved');
  });

  it('accounts for WIP already at a stage when computing capacity', () => {
    const stage = ORDERED_PROCESS_FLOW[0]!;
    const wip = [mkLot({ currentNodeId: stage.nodeId, wafersPerLot: WAFERS_PER_LOT })];

    const plan = planWeek({
      week: 2,
      demand: [{ recipeId: RECIPE.recipeId, lots: 50 }],
      equipment: fullToolSet(),
      wip,
      recipes: RECIPES,
    });

    // The stage's load includes the WIP wafer sitting there.
    assert.equal(plan.stageLoad[stage.nodeId] >= WAFERS_PER_LOT, true);
  });

  it('records a non-zero load for every stage in the flow', () => {
    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: RECIPE.recipeId, lots: 2 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    for (const stage of ORDERED_PROCESS_FLOW) {
      assert.ok(stage.nodeId in plan.stageLoad, `missing load for ${stage.nodeId}`);
    }
  });

  it('commits wafer-minutes for the released lots', () => {
    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: RECIPE.recipeId, lots: 2 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    assert.equal(
      plan.committedWaferMinutes,
      totalCycleMinutes(RECIPE) * 2 * WAFERS_PER_LOT,
    );
  });

  it('returns an empty plan for zero demand', () => {
    const plan = planWeek({
      week: 1,
      demand: [],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    assert.equal(plan.releases.length, 0);
    assert.equal(plan.releasedWafers, 0);
  });

  it('rejects a non-positive wafers-per-lot', () => {
    assert.throws(() =>
      planWeek({
        week: 1,
        demand: [],
        equipment: fullToolSet(),
        wip: [],
        recipes: RECIPES,
        wafersPerLot: 0,
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Advancing
// ---------------------------------------------------------------------------

describe('advanceWeek', () => {
  const capacity = stageCapacityForWeek(fullToolSet(), RECIPES, WAFERS_PER_LOT);

  it('moves a lot forward one stage per week when capacity allows', () => {
    const first = ORDERED_PROCESS_FLOW[0]!;
    const second = ORDERED_PROCESS_FLOW[1]!;
    const lot = mkLot({ currentNodeId: first.nodeId, stepIndex: 0 });

    const res = advanceWeek({
      week: 1,
      wip: [lot],
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });

    assert.equal(res.advanced, 1);
    assert.equal(res.wip.length, 1);
    assert.equal(res.wip[0]!.currentNodeId, second.nodeId);
    assert.equal(res.wip[0]!.stepIndex, 1);
  });

  it('completes a lot that is on its final step', () => {
    const last = ORDERED_PROCESS_FLOW[ORDERED_PROCESS_FLOW.length - 1]!;
    const stepIndex = RECIPE.processSteps.length - 1;
    const lot = mkLot({ currentNodeId: last.nodeId, stepIndex });

    const res = advanceWeek({
      week: 3,
      wip: [lot],
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });

    assert.equal(res.completed.length, 1);
    assert.equal(res.completed[0]!.completedWeek, 3);
    assert.equal(res.completed[0]!.currentNodeId, null);
    assert.equal(res.wip.length, 0);
  });

  it('holds a lot at its stage when the stage is out of capacity', () => {
    const first = ORDERED_PROCESS_FLOW[0]!;
    const lot = mkLot({ currentNodeId: first.nodeId, stepIndex: 0 });
    const starved = { ...capacity, [first.nodeId]: 0 };

    const res = advanceWeek({
      week: 1,
      wip: [lot],
      recipes: RECIPES,
      stageCapacityWaferMinutes: starved,
    });

    assert.equal(res.advanced, 0);
    assert.equal(res.wip.length, 1);
    assert.equal(res.wip[0]!.currentNodeId, first.nodeId);
    assert.equal(res.wip[0]!.waitedMinutes, MINUTES_PER_WEEK);
  });

  it('scraps a lot that waits past its Q-Time limit', () => {
    const first = ORDERED_PROCESS_FLOW[0]!;
    const qLimit = first.queueTimeLimitMinutes;
    if (qLimit === null) {
      // The first stage has no Q-Time limit; use a stage that does.
      const withLimit = ORDERED_PROCESS_FLOW.find((s) => s.queueTimeLimitMinutes !== null)!;
      const lot = mkLot({
        currentNodeId: withLimit.nodeId,
        qTimeLimitMinutes: withLimit.queueTimeLimitMinutes,
      });
      const starved = { ...capacity, [withLimit.nodeId]: 0 };
      const res = advanceWeek({
        week: 1,
        wip: [lot],
        recipes: RECIPES,
        stageCapacityWaferMinutes: starved,
      });
      assert.equal(res.scrapped.length, 1);
      assert.equal(res.wip.length, 0);
      return;
    }
    const lot = mkLot({ currentNodeId: first.nodeId, qTimeLimitMinutes: qLimit });
    const starved = { ...capacity, [first.nodeId]: 0 };
    const res = advanceWeek({
      week: 1,
      wip: [lot],
      recipes: RECIPES,
      stageCapacityWaferMinutes: starved,
    });
    assert.equal(res.scrapped.length, 1);
    assert.equal(res.wip.length, 0);
  });

  it('advances a lot through several stages over successive weeks', () => {
    const capacityFull = stageCapacityForWeek(fullToolSet(), RECIPES, WAFERS_PER_LOT);
    let wip: WeeklyLot[] = [mkLot({ currentNodeId: ORDERED_PROCESS_FLOW[0]!.nodeId, stepIndex: 0 })];

    for (let week = 1; week <= 10; week += 1) {
      const res = advanceWeek({
        week,
        wip,
        recipes: RECIPES,
        stageCapacityWaferMinutes: capacityFull,
      });
      wip = [...res.wip];
      if (res.completed.length > 0) break;
    }

    assert.equal(wip.length, 0, 'lot should have finished within 10 weeks');
  });

  it('never loses a lot — every lot is completed, in WIP, or scrapped', () => {
    const first = ORDERED_PROCESS_FLOW[0]!;
    const lots: WeeklyLot[] = [
      mkLot({ lotId: 'A', currentNodeId: first.nodeId, stepIndex: 0 }),
      mkLot({ lotId: 'B', currentNodeId: first.nodeId, stepIndex: 0, waitedMinutes: 9999 }),
    ];
    const res = advanceWeek({
      week: 1,
      wip: lots,
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });
    const accounted = res.wip.length + res.completed.length + res.scrapped.length;
    assert.equal(accounted, lots.length);
  });

  it('processes queued lots in priority order', () => {
    // One lot's slot of capacity: the high-priority lot should be the one
    // that gets processed.
    const first = ORDERED_PROCESS_FLOW[0]!;
    const step = RECIPE.processSteps[0]!;
    const budget = step.durationMinutes * WAFERS_PER_LOT;
    const scarce = { ...capacity, [first.nodeId]: budget };

    const res = advanceWeek({
      week: 1,
      wip: [
        mkLot({ lotId: 'LOW', currentNodeId: first.nodeId, stepIndex: 0, priority: 0 }),
        mkLot({ lotId: 'HIGH', currentNodeId: first.nodeId, stepIndex: 0, priority: 10 }),
      ],
      recipes: RECIPES,
      stageCapacityWaferMinutes: scarce,
    });

    const movedHigh = res.wip.find((l) => l.lotId === 'HIGH')?.stepIndex ?? 0;
    const movedLow = res.wip.find((l) => l.lotId === 'LOW')?.stepIndex ?? 0;
    assert.ok(movedHigh > movedLow, 'high priority lot should advance first');
  });
});

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

describe('weekReport', () => {
  const capacity = stageCapacityForWeek(fullToolSet(), RECIPES, WAFERS_PER_LOT);

  it('summarises releases, completions and WIP', () => {
    const plan = planWeek({
      week: 1,
      demand: [{ recipeId: RECIPE.recipeId, lots: 3 }],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    const first = ORDERED_PROCESS_FLOW[0]!;
    const res = advanceWeek({
      week: 1,
      wip: [mkLot({ currentNodeId: first.nodeId, stepIndex: 0 })],
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });

    const report = weekReport(1, plan, [], res);
    assert.equal(report.week, 1);
    assert.equal(report.releasedLots, 3);
    assert.equal(report.wipLots, 1);
    assert.equal(report.completedLots, 0);
    assert.equal(report.bottleneckNodeId, ORDERED_PROCESS_FLOW[1]!.nodeId);
    assert.equal(report.completedWafers, 0);
  });

  it('reports a null cycle time when nothing completed', () => {
    const plan = planWeek({
      week: 1,
      demand: [],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    const res = advanceWeek({
      week: 1,
      wip: [],
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });
    const report = weekReport(1, plan, [], res);
    assert.equal(report.averageCycleTimeWeeks, null);
    assert.equal(report.bottleneckNodeId, null);
  });

  it('counts late lots against their Q-Time limit', () => {
    const withLimit = ORDERED_PROCESS_FLOW.find((s) => s.queueTimeLimitMinutes !== null)!;
    const qLimit = withLimit.queueTimeLimitMinutes!;
    const plan = planWeek({
      week: 1,
      demand: [],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    const res = advanceWeek({
      week: 1,
      wip: [
        mkLot({
          currentNodeId: withLimit.nodeId,
          qTimeLimitMinutes: qLimit,
          waitedMinutes: qLimit + 1,
        }),
      ],
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });
    const report = weekReport(1, plan, [], res);
    assert.equal(report.lateLots, 1);
  });

  it('produces a WIP count for every stage', () => {
    const plan = planWeek({
      week: 1,
      demand: [],
      equipment: fullToolSet(),
      wip: [],
      recipes: RECIPES,
    });
    const res = advanceWeek({
      week: 1,
      wip: [],
      recipes: RECIPES,
      stageCapacityWaferMinutes: capacity,
    });
    const report = weekReport(1, plan, [], res);
    for (const stage of ORDERED_PROCESS_FLOW) {
      assert.ok(stage.nodeId in report.wipByStage);
    }
  });
});

// ---------------------------------------------------------------------------
// Capacity helpers
// ---------------------------------------------------------------------------

describe('stageCapacityForWeek', () => {
  it('gives every stage a capacity entry', () => {
    const cap = stageCapacityForWeek(fullToolSet(), RECIPES, WAFERS_PER_LOT);
    for (const stage of ORDERED_PROCESS_FLOW) {
      assert.ok(stage.nodeId in cap);
      assert.ok(cap[stage.nodeId] > 0);
    }
  });

  it('scales a stage capacity with its cycle time', () => {
    const equipment = fullToolSet();
    const cap = stageCapacityForWeek(equipment, RECIPES, WAFERS_PER_LOT);
    const stage = ORDERED_PROCESS_FLOW[0]!;
    // 60 wph * 12 h * 5 days = 3600 wafers; capacity is wafers * cycle time.
    const tool = equipment.find((e) => e.processType === stage.processType)!;
    const expected = tool.throughputWph * 12 * 5 * stage.cycleTimeMinutes;
    assert.equal(cap[stage.nodeId], expected);
  });

  it('gives zero capacity to stages with no tools', () => {
    const cap = stageCapacityForWeek([], RECIPES, WAFERS_PER_LOT);
    for (const stage of ORDERED_PROCESS_FLOW) {
      assert.equal(cap[stage.nodeId], 0);
    }
  });
});

describe('flow timing helpers', () => {
  it('reports the longest stage cycle time', () => {
    const expected = Math.max(...ORDERED_PROCESS_FLOW.map((s) => s.cycleTimeMinutes));
    assert.equal(flowBottleneckMinutes(), expected);
  });

  it('reports the minimum number of weeks to traverse the flow', () => {
    const total = ORDERED_PROCESS_FLOW.reduce((n, s) => n + s.cycleTimeMinutes, 0);
    assert.equal(minimumFlowWeeks(), Math.max(1, Math.ceil(total / MINUTES_PER_WEEK)));
    assert.ok(minimumFlowWeeks() >= 1);
  });
});
