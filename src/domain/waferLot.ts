import { LotStatus, TechnologyNode, WaferSize } from './enums.ts';
import { FAB_CONVENTIONS } from './constants.ts';
import {
  ValidationError,
  deepFreeze,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireNonNegativeInteger,
  requireOneOf,
} from './validation.ts';

/** Immutable record of one completed step for a lot. */
export interface LotStepLogEntry {
  readonly stepIndex: number;
  readonly stepId: string;
  readonly equipmentId: string;
  /** Defect density (defects/cm²) this step added to the lot. */
  readonly defectDensityAddedPerCm2: number;
  readonly durationMinutes: number;
}

/** A lot of wafers travelling through a recipe — the fab's unit of flow. */
export interface WaferLot {
  readonly lotId: string;
  readonly recipeId: string;
  readonly waferSize: WaferSize;
  readonly targetNode: TechnologyNode;
  /** Wafers in the FOUP (default 25). */
  readonly wafersPerLot: number;
  /**
   * Index of the NEXT step to execute. Runs [0, totalSteps]; when it equals the
   * recipe's step count the lot is finished.
   */
  readonly currentStepIndex: number;
  readonly status: LotStatus;
  /** Cumulative intrinsic defect density (defects/cm²) across all steps run. */
  readonly accumulatedDefectDensityPerCm2: number;
  readonly scrapReason?: string;
  readonly log: readonly LotStepLogEntry[];
}

/** Input for {@link createWaferLot}. */
export interface WaferLotInput {
  lotId: string;
  recipeId: string;
  waferSize: WaferSize;
  targetNode: TechnologyNode;
  wafersPerLot?: number;
}

/** Create a fresh lot queued in front of its first process step. */
export function createWaferLot(input: WaferLotInput): WaferLot {
  const lotId = requireNonEmptyString(input.lotId, 'lot.lotId');
  const recipeId = requireNonEmptyString(input.recipeId, 'lot.recipeId');
  const waferSize = requireOneOf(input.waferSize, 'lot.waferSize', Object.values(WaferSize));
  const targetNode = requireOneOf(input.targetNode, 'lot.targetNode', Object.values(TechnologyNode));
  const wafersPerLot = requireNonNegativeInteger(
    input.wafersPerLot ?? FAB_CONVENTIONS.WAFERS_PER_LOT,
    'lot.wafersPerLot',
  );
  if (wafersPerLot < 1) {
    throw new ValidationError('lot.wafersPerLot', 'must contain at least 1 wafer');
  }

  return deepFreeze({
    lotId,
    recipeId,
    waferSize,
    targetNode,
    wafersPerLot,
    currentStepIndex: 0,
    status: LotStatus.WAITING_NEXT_MACHINE,
    accumulatedDefectDensityPerCm2: 0,
    log: [] as LotStepLogEntry[],
  });
}

/**
 * Produce a new lot with one more completed step appended.
 *
 * Pure: does not mutate `lot`. `totalSteps` lets the transition decide whether
 * the lot has now run off the end of the recipe (→ COMPLETED).
 */
export function completeStep(
  lot: WaferLot,
  entry: LotStepLogEntry,
  totalSteps: number,
): WaferLot {
  if (lot.status === LotStatus.SCRAPPED || lot.status === LotStatus.COMPLETED) {
    throw new ValidationError('lot.status', `cannot advance a ${lot.status} lot`);
  }
  if (entry.stepIndex !== lot.currentStepIndex) {
    throw new ValidationError(
      'entry.stepIndex',
      `expected ${lot.currentStepIndex} (lot's next step), got ${entry.stepIndex}`,
    );
  }
  const added = requireNonNegativeNumber(
    entry.defectDensityAddedPerCm2,
    'entry.defectDensityAddedPerCm2',
  );
  const nextIndex = lot.currentStepIndex + 1;
  const finished = nextIndex >= totalSteps;

  return deepFreeze({
    ...lot,
    currentStepIndex: nextIndex,
    status: finished ? LotStatus.COMPLETED : LotStatus.WAITING_NEXT_MACHINE,
    accumulatedDefectDensityPerCm2: lot.accumulatedDefectDensityPerCm2 + added,
    log: [...lot.log, entry],
  });
}

/** Produce a scrapped (dead) lot. */
export function scrapLot(lot: WaferLot, reason: string): WaferLot {
  const scrapReason = requireNonEmptyString(reason, 'scrapReason');
  return deepFreeze({ ...lot, status: LotStatus.SCRAPPED, scrapReason });
}

/** True when the lot has finished every step (COMPLETED). */
export function isComplete(lot: WaferLot): boolean {
  return lot.status === LotStatus.COMPLETED;
}

/** Total cycle time the lot has spent so far, in minutes. */
export function elapsedMinutes(lot: WaferLot): number {
  return lot.log.reduce((sum, e) => sum + e.durationMinutes, 0);
}

