/**
 * Factory-simulation enumerations (Step 2).
 *
 * These describe the *runtime* state of a machine on the fab floor and the
 * player-facing scheduling policies. They are intentionally separate from the
 * domain `MaintenanceState` (Step 1), which is derived from static telemetry;
 * `MachineState` is the live state advanced by `factoryTick`.
 *
 * Like Step 1, these are const-objects + union types (not TS `enum`) so the
 * code stays erasable and runs natively on Node with no build step.
 */

/** Live operational state of a machine instance on the fab floor. */
export const MachineState = {
  /** Installed, powered, and waiting for a lot. */
  IDLE: 'IDLE',
  /** Actively processing a lot; `progressTimer` is counting down. */
  PROCESSING: 'PROCESSING',
  /** Hard-down (health hit zero or a random fault). Needs a repair crew. */
  DOWN: 'DOWN',
  /** Pulled for scheduled preventive maintenance / swap. */
  MAINTENANCE: 'MAINTENANCE',
} as const;
export type MachineState = (typeof MachineState)[keyof typeof MachineState];

/**
 * Lot-selection policy a dispatcher applies to a machine's input buffer.
 * This is the player's primary scheduling decision lever.
 */
export const SchedulingPolicy = {
  /** First in, first out — the default, order-preserving policy. */
  FIFO: 'FIFO',
  /** Shortest remaining processing time first — maximizes throughput. */
  SHORTEST_JOB_FIRST: 'SHORTEST_JOB_FIRST',
  /** Highest-urgency product first — honors expedites / VIP orders. */
  URGENT_FIRST: 'URGENT_FIRST',
} as const;
export type SchedulingPolicy = (typeof SchedulingPolicy)[keyof typeof SchedulingPolicy];
