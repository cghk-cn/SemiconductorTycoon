/**
 * Structured events emitted by the factory simulation.
 *
 * The engine is I/O-free: every meaningful state change is appended to the
 * factory's event log and handed to an optional logger callback. This keeps the
 * core testable while letting a UI or CLI (the integration script) render a
 * live feed.
 */
export type FactoryEventKind =
  | 'tick'
  | 'lot_released'
  | 'lot_queued'
  | 'machine_dispatch'
  | 'step_completed'
  | 'lot_routed'
  | 'lot_completed'
  | 'lot_scrapped'
  | 'machine_down'
  | 'machine_repaired'
  | 'machine_pm_start'
  | 'machine_pm_end'
  | 'note';

export interface FactoryEvent {
  /** Tick index this event occurred on (1-based; 0 = pre-tick release). */
  readonly tick: number;
  /** Absolute simulation time in minutes. */
  readonly at: number;
  readonly kind: FactoryEventKind;
  readonly machineId?: string;
  readonly lotId?: string;
  readonly message: string;
  readonly data?: Record<string, unknown>;
}

/** Callback used to surface events to the outside world. */
export type EventLogger = (event: FactoryEvent) => void;
