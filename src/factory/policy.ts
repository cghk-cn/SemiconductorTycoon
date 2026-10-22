import { SchedulingPolicy } from './enums.ts';
import type { QueueEntry } from './machine.ts';

/** Predicate telling the dispatcher whether a queued lot can run here. */
export type EligibilityFn = (entry: QueueEntry) => boolean;

/**
 * Choose the next lot to load from a machine's input buffer under `policy`.
 *
 * Pure: sorts a copy, never mutates the queue. Ties fall back to FIFO
 * (`enteredAt`) so all policies are stable and deterministic. `isEligible`
 * filters out lots this machine cannot legally run (wrong process type / node /
 * wafer size) *before* ranking, so an incompatible head-of-line lot never
 * starves the machine.
 */
export function selectNextEntry(
  queue: readonly QueueEntry[],
  policy: SchedulingPolicy,
  isEligible: EligibilityFn = () => true,
): QueueEntry | null {
  const candidates = queue.filter(isEligible);
  if (candidates.length === 0) return null;

  const sorted = [...candidates];
  switch (policy) {
    case SchedulingPolicy.SHORTEST_JOB_FIRST:
      // Smaller lot (fewer wafers) ⇒ shorter run on a fixed-WPH tool.
      sorted.sort(
        (a, b) =>
          a.lot.domainLot.wafersPerLot - b.lot.domainLot.wafersPerLot || a.enteredAt - b.enteredAt,
      );
      break;
    case SchedulingPolicy.URGENT_FIRST:
      sorted.sort((a, b) => b.lot.priority - a.lot.priority || a.enteredAt - b.enteredAt);
      break;
    case SchedulingPolicy.FIFO:
    default:
      sorted.sort((a, b) => a.enteredAt - b.enteredAt);
      break;
  }
  return sorted[0] ?? null;
}

/** Full ranked order of a queue under `policy` (for UI / debugging). */
export function rankQueue(
  queue: readonly QueueEntry[],
  policy: SchedulingPolicy,
  isEligible: EligibilityFn = () => true,
): QueueEntry[] {
  const candidates = queue.filter(isEligible);
  const sorted = [...candidates];
  if (policy === SchedulingPolicy.SHORTEST_JOB_FIRST) {
    sorted.sort(
      (a, b) => a.lot.domainLot.wafersPerLot - b.lot.domainLot.wafersPerLot || a.enteredAt - b.enteredAt,
    );
  } else if (policy === SchedulingPolicy.URGENT_FIRST) {
    sorted.sort((a, b) => b.lot.priority - a.lot.priority || a.enteredAt - b.enteredAt);
  } else {
    sorted.sort((a, b) => a.enteredAt - b.enteredAt);
  }
  return sorted;
}
