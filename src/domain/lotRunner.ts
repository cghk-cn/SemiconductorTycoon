import { LotStatus } from './enums.ts';
import {
  effectiveDefectRatePerCm2,
  isOperational,
  supportsNode,
  supportsWaferSize,
  type Equipment,
} from './equipment.ts';
import type { ProductRecipe } from './recipe.ts';
import { completeStep, type LotStepLogEntry, type WaferLot } from './waferLot.ts';

/** Raised when a lot is sent to an incompatible or unavailable machine. */
export class DispatchError extends Error {
  constructor(message: string) {
    super(`[DispatchError] ${message}`);
    this.name = 'DispatchError';
  }
}

/**
 * Assert that `equipment` can legally process `lot` at its current step.
 *
 * Checks process-type match, technology-node support, wafer-size support, and
 * that the machine is operationally up. Throws {@link DispatchError} otherwise.
 */
export function validateDispatch(
  lot: WaferLot,
  recipe: ProductRecipe,
  stepIndex: number,
  equipment: Equipment,
): void {
  const step = recipe.processSteps[stepIndex];
  if (step === undefined) {
    throw new DispatchError(`step index ${stepIndex} is out of range for recipe ${recipe.recipeId}`);
  }
  if (equipment.processType !== step.processType) {
    throw new DispatchError(
      `step '${step.stepId}' needs ${step.processType}, but ${equipment.id} is ${equipment.processType}`,
    );
  }
  if (!supportsNode(equipment, recipe.targetNode)) {
    throw new DispatchError(
      `${equipment.id} supports ${equipment.supportedNodes.mostAdvancedNm}–${equipment.supportedNodes.mostMatureNm}nm, ` +
        `but ${recipe.recipeId} targets ${recipe.targetNode}`,
    );
  }
  if (!supportsWaferSize(equipment, lot.waferSize)) {
    throw new DispatchError(
      `${equipment.id} does not handle ${lot.waferSize}, required by lot ${lot.lotId}`,
    );
  }
  if (!isOperational(equipment)) {
    throw new DispatchError(`${equipment.id} is ${equipment.maintenance.state} and cannot run`);
  }
}

/**
 * Run the lot's current step on `equipment` and return the next lot state.
 *
 * Pure: returns a new {@link WaferLot}. The defect contribution is
 * `step.stepDefectDensityPerCm2` (intrinsic) + the machine's effective rate
 * (base × wear penalty), so worn tools measurably hurt yield.
 */
export function runLotStep(
  lot: WaferLot,
  recipe: ProductRecipe,
  equipment: Equipment,
): WaferLot {
  if (lot.status === LotStatus.COMPLETED || lot.status === LotStatus.SCRAPPED) {
    throw new DispatchError(`lot ${lot.lotId} is ${lot.status} and cannot be advanced`);
  }
  const stepIndex = lot.currentStepIndex;
  validateDispatch(lot, recipe, stepIndex, equipment);
  const step = recipe.processSteps[stepIndex]!;

  const defectAdded = step.stepDefectDensityPerCm2 + effectiveDefectRatePerCm2(equipment);
  const entry: LotStepLogEntry = {
    stepIndex,
    stepId: step.stepId,
    equipmentId: equipment.id,
    defectDensityAddedPerCm2: defectAdded,
    durationMinutes: step.durationMinutes,
  };
  return completeStep(lot, entry, recipe.processSteps.length);
}

/** A dispatch decision: which machine handles a given step. */
export type DispatchFn = (stepIndex: number, step: ProductRecipe['processSteps'][number], lot: WaferLot) => Equipment;

/**
 * Run a lot through every remaining step, pulling the machine for each step
 * from `dispatch`. Throws the first {@link DispatchError} on an illegal
 * assignment. Returns the final (COMPLETED) lot.
 */
export function runLotToCompletion(
  lot: WaferLot,
  recipe: ProductRecipe,
  dispatch: DispatchFn,
): WaferLot {
  let current = lot;
  while (current.status !== LotStatus.COMPLETED) {
    if (current.status === LotStatus.SCRAPPED) {
      throw new DispatchError(`lot ${current.lotId} was scrapped mid-run`);
    }
    const idx = current.currentStepIndex;
    const step = recipe.processSteps[idx]!;
    const equipment = dispatch(idx, step, current);
    current = runLotStep(current, recipe, equipment);
  }
  return current;
}
