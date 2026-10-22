import type { WaferLot } from '../domain/waferLot.ts';

/**
 * A lot as the *factory* tracks it: the immutable domain lot plus the
 * scheduling metadata the simulator needs but the domain does not model.
 *
 * - `domainLot` is the Step 1 {@link WaferLot} (status, step index, defects).
 * - `priority` drives the URGENT_FIRST policy (higher = more urgent).
 * - `releaseAt` is the sim-time the lot was released to the fab (for metrics).
 *
 * Buffer residence time is tracked on the {@link QueueEntry}, not here, so a
 * lot that is *processing* (not queued) carries no stale timestamp.
 */
export interface FactoryLot {
  readonly domainLot: WaferLot;
  readonly priority: number;
  readonly releaseAt: number;
}

/** Wrap a domain lot with scheduling metadata. */
export function makeFactoryLot(domainLot: WaferLot, priority = 0, releaseAt = 0): FactoryLot {
  return Object.freeze({ domainLot, priority, releaseAt });
}

/** Replace the domain lot inside a tracked lot (after a step completes). */
export function withDomainLot(tracked: FactoryLot, domainLot: WaferLot): FactoryLot {
  return Object.freeze({ ...tracked, domainLot });
}
