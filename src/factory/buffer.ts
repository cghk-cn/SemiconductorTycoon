import { LotStatus, ProcessType } from '../domain/enums.ts';
import type { ProductRecipe } from '../domain/recipe.ts';
import { scrapLot } from '../domain/waferLot.ts';
import { supportsNode, supportsWaferSize } from '../domain/equipment.ts';
import { SchedulingPolicy } from './enums.ts';
import {
  canStart,
  beginProcessing,
  effectiveDefectRatePerCm2,
  type MachineInstance,
  type QueueEntry,
} from './machine.ts';
import { selectNextEntry } from './policy.ts';
import { withDomainLot, type FactoryLot } from './lot.ts';
import type { FactoryEvent } from './events.ts';

// ---------------------------------------------------------------------------
// Q-Time (queue-time) constraints
// ---------------------------------------------------------------------------

/**
 * A queue-time constraint: after a lot finishes a step of type `after`, it
 * must start its next step (type `before`) within `maxWaitMinutes`, or it is
 * scrapped. Models real constraints like "post-clean wafers must reach
 * deposition before native oxide grows" or "photoresist queue-time specs".
 */
export interface QTimeRule {
  readonly after: ProcessType;
  readonly before: ProcessType;
  readonly maxWaitMinutes: number;
}

/** Real-world-flavored Q-Time rules enforced by the queue manager. */
export const DEFAULT_QTIME_RULES: readonly QTimeRule[] = Object.freeze([
  // Post-clean → deposition: native oxide grows if wafers sit too long.
  Object.freeze({ after: ProcessType.CLEAN, before: ProcessType.DEPOSITION, maxWaitMinutes: 30 }),
  // Post-litho → etch: developed resist has a queue-time spec before plasma.
  Object.freeze({ after: ProcessType.LITHOGRAPHY, before: ProcessType.ETCHING, maxWaitMinutes: 45 }),
]);

/** Look up the Q-Time limit (minutes) for a hop, or null if unconstrained. */
export function computeQueueLimit(
  rules: readonly QTimeRule[],
  prevType: ProcessType | null,
  nextType: ProcessType,
): number | null {
  if (prevType === null) return null;
  for (const rule of rules) {
    if (rule.after === prevType && rule.before === nextType) return rule.maxWaitMinutes;
  }
  return null;
}

/** Process type of the step a lot just finished, or null at the very start. */
export function prevProcessType(lot: FactoryLot, recipe: ProductRecipe): ProcessType | null {
  const idx = lot.domainLot.currentStepIndex - 1;
  if (idx < 0) return null;
  return recipe.processSteps[idx]?.processType ?? null;
}

// ---------------------------------------------------------------------------
// Buffers
// ---------------------------------------------------------------------------

/** Push a lot onto a machine's input buffer, stamping its Q-Time deadline. */
export function enqueueLot(
  machine: MachineInstance,
  lot: FactoryLot,
  now: number,
  limitMinutes: number | null,
): void {
  const entry: QueueEntry = {
    lot,
    enteredAt: now,
    deadlineAt: limitMinutes === null ? null : now + limitMinutes,
  };
  machine.inputQueue.push(entry);
}

/**
 * Sweep every machine's input buffer for Q-Time violations. Any lot that has
 * overstay its deadline is removed from the queue and its domain lot marked
 * SCRAPPED. Returns the scrapped (tracked) lots so the caller can record them.
 */
export function sweepQueues(
  machines: readonly MachineInstance[],
  now: number,
  emit: (e: FactoryEvent) => void,
  tick: number,
): FactoryLot[] {
  const scrappedLots: FactoryLot[] = [];
  for (const machine of machines) {
    const survivors: QueueEntry[] = [];
    for (const entry of machine.inputQueue) {
      if (entry.deadlineAt !== null && now > entry.deadlineAt) {
        const dead = scrapLot(
          entry.lot.domainLot,
          `Q-Time exceeded: waited ${(now - entry.enteredAt).toFixed(1)} min in ${machine.id} buffer`,
        );
        emit({
          tick,
          at: now,
          kind: 'lot_scrapped',
          machineId: machine.id,
          lotId: dead.lotId,
          message: `Q-Time exceeded — ${dead.lotId} scrapped in ${machine.id} input buffer`,
          data: { waitedMinutes: now - entry.enteredAt, scrapReason: dead.scrapReason },
        });
        scrappedLots.push(withDomainLot(entry.lot, dead));
      } else {
        survivors.push(entry);
      }
    }
    machine.inputQueue = survivors;
  }
  return scrappedLots;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/** Can this machine legally run this lot right now? (node + wafer + alive) */
function lotEligible(machine: MachineInstance, entry: QueueEntry): boolean {
  const lot = entry.lot.domainLot;
  if (lot.status === LotStatus.SCRAPPED || lot.status === LotStatus.COMPLETED) return false;
  return (
    supportsNode(machine.equipmentSpec, lot.targetNode) &&
    supportsWaferSize(machine.equipmentSpec, lot.waferSize)
  );
}

/**
 * Load the next lot onto an idle machine per `policy`.
 *
 * Selects via the scheduling policy (filtering ineligible lots), removes it
 * from the input buffer, and starts processing for `wafers/wph` minutes. The
 * machine's live health scales the defect rate the lot will accrue.
 */
export function dispatchMachine(
  machine: MachineInstance,
  policy: SchedulingPolicy,
  now: number,
  emit: (e: FactoryEvent) => void,
  tick: number,
): boolean {
  if (!canStart(machine)) return false;

  const chosen = selectNextEntry(machine.inputQueue, policy, (e) => lotEligible(machine, e));
  if (!chosen) return false;

  // Remove the chosen entry from the buffer (by identity).
  const idx = machine.inputQueue.indexOf(chosen);
  if (idx >= 0) machine.inputQueue.splice(idx, 1);

  const wph = machine.equipmentSpec.throughputWph;
  const wafers = chosen.lot.domainLot.wafersPerLot;
  const runMinutes = (wafers / wph) * 60;
  beginProcessing(machine, chosen.lot, runMinutes);

  emit({
    tick,
    at: now,
    kind: 'machine_dispatch',
    machineId: machine.id,
    lotId: chosen.lot.domainLot.lotId,
    message:
      `${machine.id} ← ${chosen.lot.domainLot.lotId} ` +
      `(${wafers} wafers, ${runMinutes.toFixed(1)} min, health ${machine.healthPercent.toFixed(1)}%)`,
    data: {
      runMinutes,
      queueWaitMinutes: now - chosen.enteredAt,
      healthPercent: machine.healthPercent,
      effectiveDefectRatePerCm2: effectiveDefectRatePerCm2(machine),
    },
  });
  return true;
}
