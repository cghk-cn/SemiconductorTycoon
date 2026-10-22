import { LotStatus, ProcessType } from '../domain/enums.ts';
import type { ProductRecipe } from '../domain/recipe.ts';
import { completeStep, scrapLot, type LotStepLogEntry, type WaferLot } from '../domain/waferLot.ts';
import {
  accrueRuntime,
  dispatchRepair as machineDispatchRepair,
  effectiveDefectRatePerCm2,
  endProcessing,
  forceBreakdown as machineForceBreakdown,
  type MachineInstance,
} from './machine.ts';
import { MachineState, SchedulingPolicy } from './enums.ts';
import { createCleanroomZone, type CleanroomZone } from './zone.ts';
import {
  DEFAULT_QTIME_RULES,
  computeQueueLimit,
  dispatchMachine,
  enqueueLot,
  sweepQueues,
  type QTimeRule,
} from './buffer.ts';
import { makeFactoryLot, withDomainLot, type FactoryLot } from './lot.ts';
import type { FactoryEvent, FactoryEventKind, EventLogger } from './events.ts';
import { ValidationError } from '../domain/validation.ts';

// ---------------------------------------------------------------------------
// Factory container
// ---------------------------------------------------------------------------

/** Tunable simulation knobs (all optional; sensible defaults provided). */
export interface FactoryOptions {
  /** Default lot-selection policy for every machine (player can change live). */
  policy?: SchedulingPolicy;
  /** Q-Time constraint set; defaults to {@link DEFAULT_QTIME_RULES}. */
  qtimeRules?: QTimeRule[];
  /** Minutes represented by one `factoryTick()` (default 1). */
  tickMinutes?: number;
  /** Health/wear points lost per minute of processing (default 0.02). */
  wearPerMinute?: number;
  /** Per-tick probability of a random fault, scaled by poor health (default 0). */
  breakdownProbabilityPerTick?: number;
  /** Health at or below which a machine hard-fails (default 8). */
  breakdownHealthThresholdPercent?: number;
  /** Seed for the deterministic fault RNG (default 42). */
  rngSeed?: number;
  /** Optional live event sink (also always recorded on `factory.events`). */
  logger?: EventLogger;
}

/** Everything needed to stand up a fab. */
export interface FactoryConfig {
  machines: MachineInstance[];
  zones?: CleanroomZone[];
  recipes?: ProductRecipe[];
  options?: FactoryOptions;
}

/** A running fab: live machines, routing, lots, and the event log. */
export interface Factory {
  now: number;
  tickCount: number;
  readonly machines: MachineInstance[];
  readonly machineById: Map<string, MachineInstance>;
  /** processType → the machine that runs it (routing table). */
  readonly routing: Map<ProcessType, MachineInstance>;
  readonly recipes: Map<string, ProductRecipe>;
  readonly zones: Map<string, CleanroomZone>;
  readonly released: FactoryLot[];
  readonly completed: FactoryLot[];
  readonly scrapped: FactoryLot[];
  policy: SchedulingPolicy;
  readonly qtimeRules: QTimeRule[];
  readonly rng: () => number;
  readonly events: FactoryEvent[];
  readonly logger: EventLogger | null;
  readonly tickMinutes: number;
  readonly wearPerMinute: number;
  readonly breakdownProbabilityPerTick: number;
  readonly breakdownHealthThresholdPercent: number;
}

/** Deterministic PRNG (mulberry32) so fault sequences are reproducible. */
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

/** Record an event on the factory log and forward it to the live logger. */
function append(f: Factory, event: FactoryEvent): void {
  f.events.push(event);
  f.logger?.(event);
}

/** Build a tick/time-stamped event from a kind + message + optional fields. */
function log(
  f: Factory,
  kind: FactoryEventKind,
  message: string,
  extra: Partial<FactoryEvent> = {},
): void {
  append(f, { tick: f.tickCount, at: f.now, kind, message, ...extra });
}

/**
 * Stand up a fab from installed machines + registered recipes + zones.
 *
 * Routing is built from each machine's process type (one machine per process
 * type); any zone referenced by a machine but not supplied is auto-created as a
 * default ISO-5 bay. Throws on duplicate machine ids.
 */
export function createFactory(config: FactoryConfig): Factory {
  const opts = config.options ?? {};
  const machineById = new Map<string, MachineInstance>();
  for (const m of config.machines) {
    if (machineById.has(m.id)) {
      throw new ValidationError('factory.machines', `duplicate machine id '${m.id}'`);
    }
    machineById.set(m.id, m);
  }
  const routing = new Map<ProcessType, MachineInstance>();
  for (const m of config.machines) {
    routing.set(m.equipmentSpec.processType, m); // last wins: one tool per process type
  }
  const recipes = new Map<string, ProductRecipe>();
  for (const r of config.recipes ?? []) recipes.set(r.recipeId, r);

  const zones = new Map<string, CleanroomZone>();
  for (const z of config.zones ?? []) zones.set(z.zoneId, z);
  for (const m of config.machines) {
    if (!zones.has(m.zoneId)) {
      zones.set(
        m.zoneId,
        createCleanroomZone({ zoneId: m.zoneId, name: m.zoneId, isoClass: 5, ambientDefectRatePerCm2: 0.002 }),
      );
    }
  }

  return {
    now: 0,
    tickCount: 0,
    machines: [...config.machines],
    machineById,
    routing,
    recipes,
    zones,
    released: [],
    completed: [],
    scrapped: [],
    policy: opts.policy ?? SchedulingPolicy.FIFO,
    qtimeRules: opts.qtimeRules ?? [...DEFAULT_QTIME_RULES],
    rng: makeRng(opts.rngSeed ?? 42),
    events: [],
    logger: opts.logger ?? null,
    tickMinutes: opts.tickMinutes ?? 1,
    wearPerMinute: opts.wearPerMinute ?? 0.02,
    breakdownProbabilityPerTick: opts.breakdownProbabilityPerTick ?? 0,
    breakdownHealthThresholdPercent: opts.breakdownHealthThresholdPercent ?? 8,
  };
}

// ---------------------------------------------------------------------------
// Releasing lots
// ---------------------------------------------------------------------------

/** Release a lot into the fab: queue it in front of its first process step. */
export function releaseLot(f: Factory, domainLot: WaferLot, priority = 0): void {
  const recipe = f.recipes.get(domainLot.recipeId);
  if (!recipe) {
    throw new ValidationError('factory.releaseLot', `unknown recipe '${domainLot.recipeId}'`);
  }
  const tracked = makeFactoryLot(domainLot, priority, f.now);
  f.released.push(tracked);

  const firstStep = recipe.processSteps[domainLot.currentStepIndex];
  const machine = firstStep ? f.routing.get(firstStep.processType) : undefined;
  if (!firstStep || !machine) {
    throw new ValidationError(
      'factory.releaseLot',
      `no machine routed for first step of ${domainLot.recipeId}`,
    );
  }
  // No predecessor on the first hop, so no Q-Time limit applies.
  enqueueLot(machine, tracked, f.now, null);
  log(f, 'lot_released', `${domainLot.lotId} released → ${machine.id} (step ${firstStep.stepId})`, {
    lotId: domainLot.lotId,
    machineId: machine.id,
  });
}

// ---------------------------------------------------------------------------
// Completion & routing
// ---------------------------------------------------------------------------

/** Finish the current step on a machine and route the lot onward. */
function handleCompletion(f: Factory, machine: MachineInstance): void {
  const tracked = machine.currentLot;
  if (!tracked) return;
  const domainLot = tracked.domainLot;
  const recipe = f.recipes.get(domainLot.recipeId);
  if (!recipe) {
    throw new ValidationError('factory', `lot ${domainLot.lotId} references unknown recipe`);
  }
  const stepIndex = domainLot.currentStepIndex;
  const step = recipe.processSteps[stepIndex];
  if (!step) {
    throw new ValidationError('factory', `step index ${stepIndex} out of range for ${recipe.recipeId}`);
  }

  // Defects for this pass: intrinsic + machine (health-scaled) + zone ambient.
  const zone = f.zones.get(machine.zoneId);
  const ambient = zone?.ambientDefectRatePerCm2 ?? 0;
  const defectAdded =
    step.stepDefectDensityPerCm2 + effectiveDefectRatePerCm2(machine) + ambient;

  const entry: LotStepLogEntry = {
    stepIndex,
    stepId: step.stepId,
    equipmentId: machine.id,
    defectDensityAddedPerCm2: defectAdded,
    durationMinutes: step.durationMinutes,
  };
  const nextDomain = completeStep(domainLot, entry, recipe.processSteps.length);
  endProcessing(machine);

  log(
    f,
    'step_completed',
    `${machine.id} completed ${step.stepId} for ${domainLot.lotId} (+${defectAdded.toFixed(4)} def/cm², D0=${nextDomain.accumulatedDefectDensityPerCm2.toFixed(4)})`,
    {
      machineId: machine.id,
      lotId: domainLot.lotId,
      data: {
        stepId: step.stepId,
        defectAdded,
        accumulatedD0: nextDomain.accumulatedDefectDensityPerCm2,
        healthPercent: machine.healthPercent,
      },
    },
  );

  routeLot(f, withDomainLot(tracked, nextDomain), machine, recipe);
}

/** Send a just-advanced lot to its next machine, the output bin, or WIP-out. */
function routeLot(
  f: Factory,
  tracked: FactoryLot,
  fromMachine: MachineInstance,
  recipe: ProductRecipe,
): void {
  const domainLot = tracked.domainLot;

  if (domainLot.status === LotStatus.COMPLETED) {
    f.completed.push(tracked);
    log(f, 'lot_completed', `${domainLot.lotId} COMPLETED (D0=${domainLot.accumulatedDefectDensityPerCm2.toFixed(4)})`, {
      lotId: domainLot.lotId,
      data: {
        accumulatedD0: domainLot.accumulatedDefectDensityPerCm2,
        steps: domainLot.currentStepIndex,
      },
    });
    return;
  }

  const nextStep = recipe.processSteps[domainLot.currentStepIndex];
  const nextMachine = nextStep ? f.routing.get(nextStep.processType) : undefined;
  if (!nextStep || !nextMachine) {
    // No downstream tool for this process type — park it in the source output.
    fromMachine.outputBuffer.push(tracked);
    log(
      f,
      'note',
      `${domainLot.lotId} parked in ${fromMachine.id} output (no route for ${nextStep?.processType ?? 'end'})`,
      { lotId: domainLot.lotId, machineId: fromMachine.id },
    );
    return;
  }

  const prevType = recipe.processSteps[domainLot.currentStepIndex - 1]?.processType ?? null;
  const limit = computeQueueLimit(f.qtimeRules, prevType, nextStep.processType);
  enqueueLot(nextMachine, tracked, f.now, limit);
  log(
    f,
    'lot_routed',
    `${domainLot.lotId} → ${nextMachine.id} queue (step ${nextStep.stepId}${limit === null ? '' : `, Q-Time ${limit} min`})`,
    { lotId: domainLot.lotId, machineId: nextMachine.id, data: { qTimeLimitMinutes: limit } },
  );
}

// ---------------------------------------------------------------------------
// Breakdowns & maintenance
// ---------------------------------------------------------------------------

/** Bring a machine down; scrap any lot that was mid-process (lost chamber). */
function handleBreakdown(f: Factory, machine: MachineInstance): void {
  const lost = machine.currentLot;
  machineForceBreakdown(machine);
  if (lost) {
    const dead = scrapLot(lost.domainLot, `Machine ${machine.id} failed mid-process`);
    f.scrapped.push(withDomainLot(lost, dead));
    log(f, 'lot_scrapped', `${dead.lotId} scrapped — ${machine.id} failed mid-process`, {
      lotId: dead.lotId,
      machineId: machine.id,
    });
  }
  log(f, 'machine_down', `${machine.id} DOWN (health ${machine.healthPercent.toFixed(1)}%)`, {
    machineId: machine.id,
    data: { healthPercent: machine.healthPercent },
  });
}

// ---------------------------------------------------------------------------
// The tick loop
// ---------------------------------------------------------------------------

/**
 * Advance the fab by `deltaTime` minutes (default = one configured tick).
 *
 * Phases, in order:
 *  A. Processing machines tick down; finished steps accrue defects and route.
 *     (Runtime wear is applied per tick, so health falls while a lot runs.)
 *  B. Breakdowns: hard-fail at health ≤ threshold, plus seeded random faults
 *     whose probability rises as health drops. A mid-process lot is lost.
 *  C. Preventive-maintenance windows that have elapsed return to service.
 *  D. Idle machines dispatch their next lot per the scheduling policy.
 *
 * Mutates the factory in place; returns the events emitted this tick.
 */
export function factoryTick(f: Factory, deltaTime = f.tickMinutes): FactoryEvent[] {
  const startLen = f.events.length;
  f.now += deltaTime;
  f.tickCount += 1;

  const emit = (e: FactoryEvent): void => append(f, e);

  // Phase A — progress + completion.
  for (const machine of f.machines) {
    if (machine.state !== MachineState.PROCESSING) continue;
    machine.progressTimer -= deltaTime;
    accrueRuntime(machine, deltaTime, f.wearPerMinute);
    if (machine.progressTimer <= 0) {
      handleCompletion(f, machine);
    }
  }

  // Phase B — breakdowns (health floor + seeded random faults).
  for (const machine of f.machines) {
    if (machine.state !== MachineState.PROCESSING && machine.state !== MachineState.IDLE) continue;
    const healthCritical = machine.healthPercent <= f.breakdownHealthThresholdPercent;
    const severity = 1 + (100 - machine.healthPercent) / 50;
    const randomFault = f.rng() < f.breakdownProbabilityPerTick * severity;
    if (healthCritical || randomFault) {
      handleBreakdown(f, machine);
    }
  }

  // Phase C — preventive maintenance windows.
  for (const machine of f.machines) {
    const schedule = machine.maintenanceSchedule;
    if (machine.state === MachineState.MAINTENANCE && schedule && f.now >= schedule.endAt) {
      machine.healthPercent = schedule.restoreHealthPercent;
      machine.wearPercent = 0;
      machine.hoursSinceLastPm = 0;
      machine.maintenanceSchedule = null;
      machine.state = MachineState.IDLE;
      log(f, 'machine_pm_end', `${machine.id} PM complete — back to service at ${machine.healthPercent.toFixed(0)}%`, {
        machineId: machine.id,
      });
    }
  }

  // Phase D — dispatch idle machines.
  for (const machine of f.machines) {
    dispatchMachine(machine, f.policy, f.now, emit, f.tickCount);
    // Q-Time sweep is applied to buffers each tick.
  }

  // Q-Time sweep across all buffers.
  const scrappedLots = sweepQueues(f.machines, f.now, emit, f.tickCount);
  f.scrapped.push(...scrappedLots);

  return f.events.slice(startLen);
}

// ---------------------------------------------------------------------------
// Player actions & convenience
// ---------------------------------------------------------------------------

/** Player action: force a machine down (e.g. a serious fault event). */
export function forceBreakdownAction(f: Factory, machineId: string): void {
  const machine = f.machineById.get(machineId);
  if (!machine) throw new ValidationError('factory', `unknown machine '${machineId}'`);
  handleBreakdown(f, machine);
}

/** Player action: dispatch a repair crew to a DOWN machine. */
export function dispatchRepairAction(
  f: Factory,
  machineId: string,
  restoreHealthPercent = 100,
  costUsd = 0,
): void {
  const machine = f.machineById.get(machineId);
  if (!machine) throw new ValidationError('factory', `unknown machine '${machineId}'`);
  machineDispatchRepair(machine, restoreHealthPercent, costUsd);
  log(
    f,
    'machine_repaired',
    `${machineId} repaired → health ${restoreHealthPercent.toFixed(0)}% (cost $${costUsd.toLocaleString()})`,
    { machineId, data: { healthPercent: restoreHealthPercent, costUsd } },
  );
}

/** Run the fab forward `n` ticks, returning all events emitted. */
export function runFactory(f: Factory, n: number): FactoryEvent[] {
  const all: FactoryEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    all.push(...factoryTick(f));
  }
  return all;
}

/** Convenience: is every released lot in a terminal state (done or scrapped)? */
export function isSettled(f: Factory): boolean {
  return f.released.length > 0 && f.completed.length + f.scrapped.length === f.released.length;
}

