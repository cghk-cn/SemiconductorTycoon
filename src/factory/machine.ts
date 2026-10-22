import { MachineState } from './enums.ts';
import type { FactoryLot } from './lot.ts';
import type { Equipment } from '../domain/equipment.ts';
import { effectiveDefectRatePerCm2 as specDefectRatePerCm2 } from '../domain/equipment.ts';
import { requireNonEmptyString, requirePositiveNumber, requireInRange } from '../domain/validation.ts';

/** One lot waiting in a machine's input buffer, with its queue-entry time. */
export interface QueueEntry {
  readonly lot: FactoryLot;
  /** Sim-time the lot entered this buffer (drives Q-Time checks). */
  readonly enteredAt: number;
  /**
   * Absolute sim-time by which this lot must leave the buffer, or be scrapped
   * (the Q-Time limit). `null` when no constraint applies to this hop.
   */
  readonly deadlineAt: number | null;
}

/** Optional preventive-maintenance window a player can schedule. */
export interface MaintenanceSchedule {
  /** Sim-time the machine is pulled for PM. */
  readonly startAt: number;
  /** Sim-time the machine returns to service. */
  readonly endAt: number;
  /** Health (%) restored to on completion. */
  readonly restoreHealthPercent: number;
  readonly costUsd: number;
}

/**
 * A concrete machine installed on the fab floor.
 *
 * Wraps the immutable Step 1 {@link Equipment} spec with *mutable* runtime
 * state advanced by `factoryTick`: process progress, health/wear, and the
 * input/output buffers. Health is authoritative here (the spec's telemetry is
 * only the install-day snapshot).
 */
export interface MachineInstance {
  readonly id: string;
  readonly equipmentSpec: Equipment;
  readonly zoneId: string;
  state: MachineState;
  /** The lot currently on the tool (null when idle / down / in PM). */
  currentLot: FactoryLot | null;
  /** Remaining processing time (minutes) for the current step; 0 when idle. */
  progressTimer: number;
  /** Total run time (minutes) the current step will take (for % reporting). */
  totalRunMinutes: number;
  /** Live health 0–100 (authoritative; drives defect rate & breakdowns). */
  healthPercent: number;
  /** Live wear 0–100 (monotonic; reset on overhaul). */
  wearPercent: number;
  /** Process hours accrued since last PM. */
  hoursSinceLastPm: number;
  /** FOUPs waiting to load onto this tool (dispatched by the policy). */
  inputQueue: QueueEntry[];
  /** Finished lots parked here awaiting pickup / routing downstream. */
  outputBuffer: FactoryLot[];
  maintenanceSchedule: MaintenanceSchedule | null;
}

/** Caller input for {@link createMachineInstance}. */
export interface MachineInstanceInput {
  id: string;
  equipmentSpec: Equipment;
  zoneId: string;
  /** Optional overrides for the install-day telemetry (else taken from spec). */
  healthPercent?: number;
  wearPercent?: number;
  hoursSinceLastPm?: number;
}

/**
 * Install a machine. Health/wear default to the equipment spec's install-day
 * telemetry so a used machine starts life already worn.
 */
export function createMachineInstance(input: MachineInstanceInput): MachineInstance {
  const id = requireNonEmptyString(input.id, 'machine.id');
  const zoneId = requireNonEmptyString(input.zoneId, 'machine.zoneId');
  const spec = input.equipmentSpec;
  const healthPercent = requireInRange(
    input.healthPercent ?? spec.maintenance.healthPercent,
    'machine.healthPercent',
    0,
    100,
  );
  const wearPercent = requireInRange(
    input.wearPercent ?? spec.maintenance.wearPercent,
    'machine.wearPercent',
    0,
    100,
  );
  const hoursSinceLastPm = requirePositiveNumber(
    input.hoursSinceLastPm ?? Math.max(spec.maintenance.hoursSinceLastPm, 0.0001),
    'machine.hoursSinceLastPm',
  );

  return {
    id,
    equipmentSpec: spec,
    zoneId,
    state: MachineState.IDLE,
    currentLot: null,
    progressTimer: 0,
    totalRunMinutes: 0,
    healthPercent,
    wearPercent,
    hoursSinceLastPm,
    inputQueue: [],
    outputBuffer: [],
    maintenanceSchedule: null,
  };
}

/**
 * Effective per-pass defect rate for a machine *right now*, scaled by live
 * health. Poorer health leaks more defects (doubling at zero health), mirroring
 * the Step 1 spec-based helper but using the machine's current health.
 */
export function effectiveDefectRatePerCm2(machine: MachineInstance): number {
  const asSpec: Equipment = {
    ...machine.equipmentSpec,
    maintenance: {
      ...machine.equipmentSpec.maintenance,
      healthPercent: machine.healthPercent,
      wearPercent: machine.wearPercent,
    },
  };
  return specDefectRatePerCm2(asSpec);
}

/**
 * Accrue runtime: apply wear for `minutes` of processing, drop health, and add
 * to hours-since-PM. Pure mutation of the live machine record.
 */
export function accrueRuntime(machine: MachineInstance, minutes: number, wearPerMinute: number): void {
  if (minutes <= 0) return;
  machine.wearPercent = Math.min(100, machine.wearPercent + wearPerMinute * minutes);
  machine.hoursSinceLastPm += minutes / 60;
  // Health decays proportionally to wear accrued; floor at 0 (breakdown is
  // handled separately by the tick so it can be logged/insured).
  machine.healthPercent = Math.max(0, machine.healthPercent - wearPerMinute * minutes);
}

/** True when the machine is free to load a lot (IDLE with a free chamber). */
export function canStart(machine: MachineInstance): boolean {
  return machine.state === MachineState.IDLE && machine.currentLot === null;
}

/** Mark the machine as actively processing `lot` for `runMinutes`. */
export function beginProcessing(machine: MachineInstance, lot: FactoryLot, runMinutes: number): void {
  machine.state = MachineState.PROCESSING;
  machine.currentLot = lot;
  machine.totalRunMinutes = runMinutes;
  machine.progressTimer = runMinutes;
}

/** Clear the chamber after a step finishes (machine returns to IDLE). */
export function endProcessing(machine: MachineInstance): void {
  machine.state = MachineState.IDLE;
  machine.currentLot = null;
  machine.progressTimer = 0;
  machine.totalRunMinutes = 0;
}

/** Force a hard-down (used by fault injection & the health<=0 rule). */
export function forceBreakdown(machine: MachineInstance): void {
  machine.state = MachineState.DOWN;
  machine.currentLot = null;
  machine.progressTimer = 0;
}

/**
 * Dispatch a repair crew: bring a DOWN machine back to a given health setpoint
 * at a cost. This is the player's manual recovery action.
 */
export function dispatchRepair(
  machine: MachineInstance,
  restoreHealthPercent: number,
  costUsd: number,
): void {
  machine.healthPercent = requireInRange(restoreHealthPercent, 'repair.restoreHealthPercent', 0, 100);
  machine.wearPercent = Math.max(0, 100 - machine.healthPercent);
  machine.hoursSinceLastPm = 0;
  machine.state = MachineState.IDLE;
  void costUsd; // cost is charged by the caller's economy ledger
}

/** Pull a machine into a scheduled PM window. */
export function scheduleMaintenance(machine: MachineInstance, schedule: MaintenanceSchedule): void {
  machine.maintenanceSchedule = Object.freeze({ ...schedule });
  machine.state = MachineState.MAINTENANCE;
  machine.currentLot = null;
}

/** Complete a PM window: restore health, clear wear, return to service. */
export function completeMaintenance(machine: MachineInstance): void {
  const schedule = machine.maintenanceSchedule;
  if (schedule) {
    machine.healthPercent = schedule.restoreHealthPercent;
  }
  machine.wearPercent = 0;
  machine.hoursSinceLastPm = 0;
  machine.maintenanceSchedule = null;
  machine.state = MachineState.IDLE;
}

