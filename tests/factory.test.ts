import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ComponentCategory,
  LithoSource,
  LotStatus,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import { createEquipment, type Equipment } from '../src/domain/equipment.ts';
import { createProcessStep, createProductRecipe, type ProductRecipe } from '../src/domain/recipe.ts';
import { createWaferLot } from '../src/domain/waferLot.ts';
import {
  ambientRateForIsoClass,
  computeQueueLimit,
  createCleanroomZone,
  createFactory,
  createMachineInstance,
  effectiveDefectRatePerCm2,
  factoryTick,
  forceBreakdownAction,
  dispatchRepairAction,
  isSettled,
  MachineState,
  makeFactoryLot,
  rankQueue,
  releaseLot,
  runFactory,
  selectNextEntry,
  SchedulingPolicy,
  sweepQueues,
  type CleanroomZone,
  type Factory,
  type FactoryOptions,
  type MachineInstance,
  type QueueEntry,
} from '../src/factory/index.ts';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A very fast test tool (1500 wph → a 25-wafer lot takes exactly 1 minute). */
function fastEquipment(processType: ProcessType, id: string): Equipment {
  return createEquipment({
    id,
    brand: 'TestCo',
    modelName: `Fast ${processType}`,
    processType,
    ...(processType === ProcessType.LITHOGRAPHY ? { lithoSource: LithoSource.KRF } : {}),
    supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 180 },
    supportedWaferSizes: [WaferSize.WAFER_200MM],
    throughputWph: 1500,
    baseDefectRatePerCm2: 0.005,
    powerConsumptionKw: 50,
  });
}

/** A minimal 2-step 180nm recipe (litho → etch) for routing tests. */
function twoStepRecipe(recipeId = 'RCP-TEST'): ProductRecipe {
  return createProductRecipe({
    recipeId,
    productName: 'Test Die',
    category: ComponentCategory.GPU,
    targetNode: TechnologyNode.NM_180,
    waferSize: WaferSize.WAFER_200MM,
    dieSizeMm2: 100,
    materials: [
      {
        materialId: 'WAFER',
        name: 'Wafer',
        category: MaterialCategory.WAFER_SUBSTRATE,
        quantityPerWafer: 1,
        unit: 'pcs',
      },
    ],
    processSteps: [
      createProcessStep({
        stepId: 'L1',
        name: 'Litho',
        processType: ProcessType.LITHOGRAPHY,
        maskIndex: 1,
        durationMinutes: 1,
        stepDefectDensityPerCm2: 0.001,
      }),
      createProcessStep({
        stepId: 'E1',
        name: 'Etch',
        processType: ProcessType.ETCHING,
        durationMinutes: 1,
        stepDefectDensityPerCm2: 0.002,
      }),
    ],
    packaging: {
      packagingType: PackagingType.BGA,
      assemblyFlowName: 'test',
      companionComponents: [],
    },
  });
}

/** Stand up a 2-machine fab (fast litho + fast etch) with a 2-step recipe. */
function makeFab(
  options: Partial<FactoryOptions> = {},
  zones?: CleanroomZone[],
): { f: Factory; litho: MachineInstance; etch: MachineInstance; recipe: ProductRecipe } {
  const litho = createMachineInstance({
    id: 'L',
    equipmentSpec: fastEquipment(ProcessType.LITHOGRAPHY, 'L'),
    zoneId: 'Z',
  });
  const etch = createMachineInstance({
    id: 'E',
    equipmentSpec: fastEquipment(ProcessType.ETCHING, 'E'),
    zoneId: 'Z',
  });
  const recipe = twoStepRecipe();
  const f = createFactory({
    machines: [litho, etch],
    recipes: [recipe],
    ...(zones ? { zones } : {}),
    options: { wearPerMinute: 0, breakdownProbabilityPerTick: 0, ...options },
  });
  return { f, litho, etch, recipe };
}

/** A slow tool (30 wph → a 25-wafer lot takes 50 minutes) for long-running lots. */
function slowEquipment(processType: ProcessType, id: string): Equipment {
  return {
    ...fastEquipment(processType, id),
    throughputWph: 30,
  };
}

function release(f: Factory, recipe: ProductRecipe, lotId: string, wafers = 25, priority = 0): void {
  const lot = createWaferLot({
    lotId,
    recipeId: recipe.recipeId,
    waferSize: recipe.waferSize,
    targetNode: recipe.targetNode,
    wafersPerLot: wafers,
  });
  releaseLot(f, lot, priority);
}

function mkEntry(lotId: string, wafers: number, priority: number, enteredAt: number): QueueEntry {
  const domainLot = createWaferLot({
    lotId,
    recipeId: 'R',
    waferSize: WaferSize.WAFER_200MM,
    targetNode: TechnologyNode.NM_180,
    wafersPerLot: wafers,
  });
  return { lot: makeFactoryLot(domainLot, priority, enteredAt), enteredAt, deadlineAt: null };
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

describe('cleanroom zones', () => {
  it('validates and freezes a zone', () => {
    const z = createCleanroomZone({ zoneId: 'Z1', name: 'Bay', isoClass: 3, ambientDefectRatePerCm2: 0.002 });
    assert.equal(z.isoClass, 3);
    assert.ok(Object.isFrozen(z));
  });

  it('rejects an out-of-range ISO class', () => {
    assert.throws(() =>
      createCleanroomZone({ zoneId: 'Z', name: 'x', isoClass: 12, ambientDefectRatePerCm2: 0 }),
    );
  });

  it('suggests a dirtier ambient rate for higher ISO classes', () => {
    assert.ok(ambientRateForIsoClass(5) > ambientRateForIsoClass(3));
    assert.ok(ambientRateForIsoClass(1) > 0);
  });
});

// ---------------------------------------------------------------------------
// Machine instances
// ---------------------------------------------------------------------------

describe('machine instances', () => {
  it('defaults health from the equipment spec install telemetry', () => {
    const m = createMachineInstance({
      id: 'M',
      equipmentSpec: fastEquipment(ProcessType.ETCHING, 'M'),
      zoneId: 'Z',
    });
    assert.equal(m.state, MachineState.IDLE);
    assert.equal(m.healthPercent, 100);
    assert.equal(m.currentLot, null);
  });

  it('scales effective defect rate by live health (worse health ⇒ more defects)', () => {
    const m = createMachineInstance({
      id: 'M',
      equipmentSpec: fastEquipment(ProcessType.ETCHING, 'M'),
      zoneId: 'Z',
      healthPercent: 100,
    });
    const healthy = effectiveDefectRatePerCm2(m);
    m.healthPercent = 0;
    const sick = effectiveDefectRatePerCm2(m);
    assert.ok(Math.abs(healthy - 0.005) < 1e-9); // ×(1 + 0/100)
    assert.ok(Math.abs(sick - 0.01) < 1e-9); // ×(1 + 100/100)
    assert.ok(sick > healthy);
  });
});

// ---------------------------------------------------------------------------
// Scheduling policies
// ---------------------------------------------------------------------------

describe('scheduling policies', () => {
  it('FIFO picks the earliest-entered lot', () => {
    const a = mkEntry('A', 25, 0, 0);
    const b = mkEntry('B', 10, 0, 1);
    const c = mkEntry('C', 40, 0, 2);
    assert.equal(selectNextEntry([a, b, c], SchedulingPolicy.FIFO), a);
  });

  it('SHORTEST_JOB_FIRST picks the smallest lot', () => {
    const a = mkEntry('A', 25, 0, 0);
    const b = mkEntry('B', 10, 0, 1);
    const c = mkEntry('C', 40, 0, 2);
    assert.equal(selectNextEntry([a, b, c], SchedulingPolicy.SHORTEST_JOB_FIRST), b);
  });

  it('URGENT_FIRST picks the highest priority, then FIFO on ties', () => {
    const a = mkEntry('A', 25, 0, 0);
    const hi = mkEntry('HI', 25, 100, 3);
    const lo = mkEntry('LO', 5, 10, 1);
    assert.equal(selectNextEntry([a, hi, lo], SchedulingPolicy.URGENT_FIRST), hi);
    const hi2 = mkEntry('HI2', 25, 100, 4);
    assert.equal(selectNextEntry([hi, hi2], SchedulingPolicy.URGENT_FIRST), hi);
  });

  it('rankQueue returns a full deterministic order', () => {
    const a = mkEntry('A', 25, 0, 0);
    const b = mkEntry('B', 10, 0, 1);
    const c = mkEntry('C', 40, 0, 2);
    const ranked = rankQueue([c, a, b], SchedulingPolicy.SHORTEST_JOB_FIRST);
    assert.deepEqual(ranked.map((e) => e.lot.domainLot.lotId), ['B', 'A', 'C']);
  });
});

// ---------------------------------------------------------------------------
// Q-Time
// ---------------------------------------------------------------------------

describe('Q-Time constraints', () => {
  it('computes a hop limit only when a rule matches', () => {
    const rules = [{ after: ProcessType.LITHOGRAPHY, before: ProcessType.ETCHING, maxWaitMinutes: 45 }];
    assert.equal(computeQueueLimit(rules, ProcessType.LITHOGRAPHY, ProcessType.ETCHING), 45);
    assert.equal(computeQueueLimit(rules, ProcessType.CLEAN, ProcessType.ETCHING), null);
    assert.equal(computeQueueLimit(rules, null, ProcessType.ETCHING), null);
  });

  it('scraps a lot that over-stays a buffer past its deadline', () => {
    const { f, etch } = makeFab();
    const domainLot = createWaferLot({
      lotId: 'X',
      recipeId: 'RCP-TEST',
      waferSize: WaferSize.WAFER_200MM,
      targetNode: TechnologyNode.NM_180,
    });
    etch.inputQueue = [{ lot: makeFactoryLot(domainLot, 0, 0), enteredAt: 0, deadlineAt: 5 }];
    const scrapped = sweepQueues(f.machines, /* now */ 6, () => {}, 1);
    assert.equal(scrapped.length, 1);
    assert.equal(scrapped[0]!.domainLot.status, LotStatus.SCRAPPED);
    assert.equal(etch.inputQueue.length, 0);
  });
});

// ---------------------------------------------------------------------------
// The tick loop & end-to-end flow
// ---------------------------------------------------------------------------

describe('factory tick loop', () => {
  it('routes a lot litho→etch and completes it in 3 ticks', () => {
    const { f, recipe } = makeFab();
    release(f, recipe, 'A');
    runFactory(f, 3);
    assert.equal(f.completed.length, 1);
    const done = f.completed[0]!.domainLot;
    assert.equal(done.status, LotStatus.COMPLETED);
    assert.equal(done.currentStepIndex, 2);
    // Handoff actually used both machines in order.
    assert.equal(done.log[0]!.equipmentId, 'L');
    assert.equal(done.log[1]!.equipmentId, 'E');
  });

  it('accrues intrinsic + machine + ambient defects each step', () => {
    const { f, recipe } = makeFab();
    release(f, recipe, 'A');
    runFactory(f, 3);
    const d0 = f.completed[0]!.domainLot.accumulatedDefectDensityPerCm2;
    // L1: 0.001 intrinsic + 0.005 machine(health100) + 0.002 ambient = 0.008
    // E1: 0.002 + 0.005 + 0.002 = 0.009  →  total 0.017
    assert.ok(Math.abs(d0 - 0.017) < 1e-9, `expected 0.017, got ${d0}`);
  });

  it('adds the cleanroom ambient defect rate of the machine zone', () => {
    // Two fabs differing ONLY in the ambient rate of their zone.
    const dirty = createCleanroomZone({
      zoneId: 'Z',
      name: 'Dirty Bay',
      isoClass: 5,
      ambientDefectRatePerCm2: 0.010,
    });
    const clean = createCleanroomZone({
      zoneId: 'Z',
      name: 'Clean Bay',
      isoClass: 3,
      ambientDefectRatePerCm2: 0.0,
    });

    const dirtyFab = makeFab({}, [dirty]);
    const cleanFab = makeFab({}, [clean]);
    release(dirtyFab.f, dirtyFab.recipe, 'A');
    release(cleanFab.f, cleanFab.recipe, 'A');
    runFactory(dirtyFab.f, 3);
    runFactory(cleanFab.f, 3);

    const dirtyD0 = dirtyFab.f.completed[0]!.domainLot.accumulatedDefectDensityPerCm2;
    const cleanD0 = cleanFab.f.completed[0]!.domainLot.accumulatedDefectDensityPerCm2;
    // 2 steps × 0.010 ambient = 0.020 difference.
    assert.ok(Math.abs(dirtyD0 - cleanD0 - 0.02) < 1e-9, `delta was ${dirtyD0 - cleanD0}`);
    // Intrinsic + machine alone: (0.001+0.005) + (0.002+0.005) = 0.013
    assert.ok(Math.abs(cleanD0 - 0.013) < 1e-9, `expected 0.013, got ${cleanD0}`);
  });

  it('decays machine health while processing', () => {
    const { f, litho, recipe } = makeFab({ wearPerMinute: 5 });
    const before = litho.healthPercent;
    release(f, recipe, 'A');
    runFactory(f, 2); // litho runs its 1-minute step here
    assert.ok(litho.healthPercent < before, `health ${before} → ${litho.healthPercent}`);
  });
});

describe('Q-Time enforcement end-to-end', () => {
  it('scraps a lot stuck behind a down etcher past its Q-Time', () => {
    const { f, etch, recipe } = makeFab({
      qtimeRules: [{ after: ProcessType.LITHOGRAPHY, before: ProcessType.ETCHING, maxWaitMinutes: 3 }],
    });
    etch.state = MachineState.DOWN; // block the etcher so the lot waits
    release(f, recipe, 'A');
    runFactory(f, 8);
    assert.equal(f.scrapped.length, 1);
    const dead = f.scrapped[0]!.domainLot;
    assert.equal(dead.status, LotStatus.SCRAPPED);
    assert.match(dead.scrapReason ?? '', /Q-Time/);
    assert.equal(f.completed.length, 0);
  });
});

describe('breakdowns & repair', () => {
  it('hard-fails a machine whose health falls to the floor, then repairs it', () => {
    const { f, etch } = makeFab();
    etch.healthPercent = 5; // at/below the default 8% breakdown threshold
    factoryTick(f);
    assert.equal(etch.state, MachineState.DOWN);
    dispatchRepairAction(f, 'E', 100, 10_000);
    assert.equal(etch.state, MachineState.IDLE);
    assert.equal(etch.healthPercent, 100);
    const kinds = f.events.map((e) => e.kind);
    assert.ok(kinds.includes('machine_down'));
    assert.ok(kinds.includes('machine_repaired'));
  });

  it('forceBreakdownAction brings a machine down on demand', () => {
    const { f, litho } = makeFab();
    forceBreakdownAction(f, 'L');
    assert.equal(litho.state, MachineState.DOWN);
  });

  it('scraps the lot that was mid-process when the machine dies', () => {
    // Slow tools so the lot is still in the chamber when the fault hits.
    const litho = createMachineInstance({
      id: 'L',
      equipmentSpec: slowEquipment(ProcessType.LITHOGRAPHY, 'L'),
      zoneId: 'Z',
    });
    const etch = createMachineInstance({
      id: 'E',
      equipmentSpec: slowEquipment(ProcessType.ETCHING, 'E'),
      zoneId: 'Z',
    });
    const recipe = twoStepRecipe();
    const f = createFactory({
      machines: [litho, etch],
      recipes: [recipe],
      options: { wearPerMinute: 0, breakdownProbabilityPerTick: 0 },
    });
    release(f, recipe, 'A');
    runFactory(f, 1); // dispatch onto litho; 50-minute step still running
    assert.equal(litho.state, MachineState.PROCESSING);
    assert.ok(litho.currentLot);

    forceBreakdownAction(f, 'L');
    assert.equal(litho.state, MachineState.DOWN);
    assert.equal(litho.currentLot, null); // chamber lost
    assert.equal(f.scrapped.length, 1);
    const dead = f.scrapped[0]!.domainLot;
    assert.equal(dead.status, LotStatus.SCRAPPED);
    assert.match(dead.scrapReason ?? '', /failed mid-process/);
    assert.equal(f.completed.length, 0);
  });
});

describe('routing & terminal lot accounting', () => {
  it('accounts every released lot as either completed or scrapped', () => {
    const { f, etch, recipe } = makeFab();
    release(f, recipe, 'LOT-1');
    release(f, recipe, 'LOT-2');
    // The etcher is down, so both lots queue up in its input buffer and
    // eventually die there on the 45-minute Q-Time.
    etch.state = MachineState.DOWN;
    runFactory(f, 60);
    assert.equal(f.released.length, 2);
    assert.equal(f.completed.length, 0);
    assert.equal(f.scrapped.length, 2);
    assert.equal(f.completed.length + f.scrapped.length, f.released.length);
    assert.ok(isSettled(f));
  });

  it('settles a lot that runs through the whole flow', () => {
    const { f, recipe } = makeFab();
    release(f, recipe, 'LOT-1');
    runFactory(f, 5);
    assert.equal(f.completed.length, 1);
    assert.equal(f.scrapped.length, 0);
    assert.ok(isSettled(f));
  });

  it('routes each lot to the machine that owns its next step', () => {
    const { f, etch, recipe } = makeFab();
    release(f, recipe, 'A');
    runFactory(f, 1);
    // The lot's first step is lithography → the litho tool.
    assert.equal(f.routing.get(ProcessType.LITHOGRAPHY)?.id, 'L');
    assert.equal(f.routing.get(ProcessType.ETCHING)?.id, 'E');
    // Tick 1 dispatches onto the litho tool.
    assert.equal(f.machines[0]!.currentLot?.domainLot.lotId, 'A');
    // Tick 2 completes the litho step and hands the lot to the etcher.
    runFactory(f, 1);
    assert.equal(etch.currentLot?.domainLot.lotId, 'A');
    const log = etch.currentLot!.domainLot.log;
    assert.equal(log.length, 1);
    assert.equal(log[0]!.equipmentId, 'L');
    assert.equal(log[0]!.stepId, 'L1');
  });

  it('rejects a duplicate machine id', () => {
    const m = createMachineInstance({
      id: 'DUP',
      equipmentSpec: fastEquipment(ProcessType.ETCHING, 'DUP'),
      zoneId: 'Z',
    });
    const m2 = createMachineInstance({
      id: 'DUP',
      equipmentSpec: fastEquipment(ProcessType.ETCHING, 'DUP2'),
      zoneId: 'Z',
    });
    assert.throws(() => createFactory({ machines: [m, m2] }));
  });
});

describe('policy end-to-end dispatch order', () => {
  it('FIFO dispatches the earlier lot first', () => {
    const { f, litho, recipe } = makeFab({ policy: SchedulingPolicy.FIFO });
    release(f, recipe, 'A', 25);
    release(f, recipe, 'B', 10);
    factoryTick(f);
    assert.equal(litho.currentLot?.domainLot.lotId, 'A');
  });

  it('SHORTEST_JOB_FIRST dispatches the smaller lot first', () => {
    const { f, litho, recipe } = makeFab({ policy: SchedulingPolicy.SHORTEST_JOB_FIRST });
    release(f, recipe, 'A', 25);
    release(f, recipe, 'B', 10);
    factoryTick(f);
    assert.equal(litho.currentLot?.domainLot.lotId, 'B');
  });

  it('URGENT_FIRST dispatches the highest-priority lot first', () => {
    const { f, litho, recipe } = makeFab({ policy: SchedulingPolicy.URGENT_FIRST });
    release(f, recipe, 'A', 25, /* priority */ 0);
    release(f, recipe, 'VIP', 25, /* priority */ 100);
    factoryTick(f);
    assert.equal(litho.currentLot?.domainLot.lotId, 'VIP');
  });
});


