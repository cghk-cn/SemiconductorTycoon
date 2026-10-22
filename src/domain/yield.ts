import { WaferSize } from './enums.ts';
import { FAB_CONVENTIONS, waferDiameterMm } from './constants.ts';
import { ValidationError, requireNonNegativeNumber, requirePositiveNumber } from './validation.ts';

const MM2_PER_CM2 = 100;

// ---------------------------------------------------------------------------
// Gross dies per wafer (GDW)
// ---------------------------------------------------------------------------

/**
 * Standard circular-wafer die-count approximation.
 *
 *   N = π·(Deff/2)² / A_die  −  π·Deff / √(2·A_die)
 *
 * The first term is the full effective wafer area divided by die area; the
 * second subtracts partial dies lost around the curved edge (a well-known
 * closed-form approximation). `Deff` already has the edge-exclusion band
 * removed so no die is placed in the unusable wafer rim.
 *
 * All inputs in mm. Returns whole, placeable dies.
 */
export function grossDiesPerWafer(
  waferDiameter: number,
  dieWidth: number,
  dieHeight: number,
  edgeExclusionMm: number = FAB_CONVENTIONS.DEFAULT_EDGE_EXCLUSION_MM,
): number {
  requirePositiveNumber(waferDiameter, 'grossDiesPerWafer.waferDiameter');
  requirePositiveNumber(dieWidth, 'grossDiesPerWafer.dieWidth');
  requirePositiveNumber(dieHeight, 'grossDiesPerWafer.dieHeight');
  const dieArea = dieWidth * dieHeight; // mm²
  const effectiveDiameter = waferDiameter - 2 * edgeExclusionMm;
  if (effectiveDiameter <= 0) {
    throw new ValidationError(
      'edgeExclusionMm',
      `edge exclusion too large for a ${waferDiameter}mm wafer`,
    );
  }
  const areaTerm = (Math.PI * (effectiveDiameter / 2) ** 2) / dieArea;
  const edgeTerm = (Math.PI * effectiveDiameter) / Math.sqrt(2 * dieArea);
  return Math.max(0, Math.floor(areaTerm - edgeTerm));
}

// ---------------------------------------------------------------------------
// Yield models
// ---------------------------------------------------------------------------

/**
 * Murphy's yield model (the game's default).
 *
 *   Y = [ (1 − e^(−D₀·A)) / (D₀·A) ]²
 *
 * D₀ is defect density (defects/cm²) and A is die area (cm²). Unlike the naive
 * Poisson model it integrates over a triangular defect distribution across the
 * wafer, giving a gentler, more realistic curve. Y → 1 as D₀·A → 0 and Y → 0
 * as D₀·A → ∞.
 */
export function murphyYield(defectDensityPerCm2: number, dieAreaCm2: number): number {
  const d0 = requireNonNegativeNumber(defectDensityPerCm2, 'murphyYield.defectDensityPerCm2');
  requirePositiveNumber(dieAreaCm2, 'murphyYield.dieAreaCm2');
  const x = d0 * dieAreaCm2;
  if (x === 0) return 1;
  const ratio = (1 - Math.exp(-x)) / x;
  return ratio * ratio;
}

/** Poisson yield model: Y = e^(−D₀·A). Kept for future difficulty tuning. */
export function poissonYield(defectDensityPerCm2: number, dieAreaCm2: number): number {
  const d0 = requireNonNegativeNumber(defectDensityPerCm2, 'poissonYield.defectDensityPerCm2');
  requirePositiveNumber(dieAreaCm2, 'poissonYield.dieAreaCm2');
  return Math.exp(-d0 * dieAreaCm2);
}

/** Seeds yield model: Y = e^(−√(D₀·A)). Optimistic vs. Murphy. */
export function seedsYield(defectDensityPerCm2: number, dieAreaCm2: number): number {
  const d0 = requireNonNegativeNumber(defectDensityPerCm2, 'seedsYield.defectDensityPerCm2');
  requirePositiveNumber(dieAreaCm2, 'seedsYield.dieAreaCm2');
  return Math.exp(-Math.sqrt(d0 * dieAreaCm2));
}

// ---------------------------------------------------------------------------
// Aggregate lot yield
// ---------------------------------------------------------------------------

/** Everything a finished lot needs to price and pack its output. */
export interface LotYieldResult {
  readonly waferSize: WaferSize;
  readonly dieAreaMm2: number;
  readonly dieAreaCm2: number;
  /** Gross (placeable) dies on one wafer. */
  readonly grossDiesPerWafer: number;
  /** Gross dies across the whole lot. */
  readonly totalGrossDies: number;
  /** Final defect density (defects/cm²) used as the yield input. */
  readonly defectDensityPerCm2: number;
  /** Fraction of dies that pass (Murphy), 0..1. */
  readonly yieldFraction: number;
  /** Expected good dies per wafer (fractional). */
  readonly expectedGoodDiesPerWafer: number;
  /** Net good dies for the whole lot, floored to whole dice. */
  readonly netGoodDies: number;
}

/** Input for {@link computeLotYield}. */
export interface LotYieldInput {
  waferSize: WaferSize;
  /** Die footprint. Give both dimensions; if omitted, `dieSizeMm2` is treated
   *  as a square die. */
  dieWidthMm?: number;
  dieHeightMm?: number;
  dieSizeMm2?: number;
  /** Accumulated intrinsic defect density (defects/cm²) from the lot's steps. */
  defectDensityPerCm2: number;
  wafersPerLot: number;
  edgeExclusionMm?: number;
}

/**
 * Compute the final output of a completed lot: how many good dies it yields.
 *
 * Combines the GDW geometry with Murphy's yield model. `defectDensityPerCm2`
 * is the lot's accumulated intrinsic density; callers layer any extra machine
 * defect contributions onto it before calling.
 */
export function computeLotYield(input: LotYieldInput): LotYieldResult {
  const diameter = waferDiameterMm(input.waferSize);
  const edge = input.edgeExclusionMm ?? FAB_CONVENTIONS.DEFAULT_EDGE_EXCLUSION_MM;

  // Resolve die footprint (square fallback from area).
  let dieWidthMm: number;
  let dieHeightMm: number;
  if (input.dieWidthMm !== undefined && input.dieHeightMm !== undefined) {
    dieWidthMm = requirePositiveNumber(input.dieWidthMm, 'computeLotYield.dieWidthMm');
    dieHeightMm = requirePositiveNumber(input.dieHeightMm, 'computeLotYield.dieHeightMm');
  } else if (input.dieSizeMm2 !== undefined) {
    const side = Math.sqrt(requirePositiveNumber(input.dieSizeMm2, 'computeLotYield.dieSizeMm2'));
    dieWidthMm = side;
    dieHeightMm = side;
  } else {
    throw new ValidationError('die footprint', 'provide dieWidthMm+dieHeightMm, or dieSizeMm2');
  }

  const dieAreaMm2 = dieWidthMm * dieHeightMm;
  const dieAreaCm2 = dieAreaMm2 / MM2_PER_CM2;
  const gdw = grossDiesPerWafer(diameter, dieWidthMm, dieHeightMm, edge);
  const wafersPerLot = requirePositiveNumber(input.wafersPerLot, 'computeLotYield.wafersPerLot');
  const totalGrossDies = gdw * wafersPerLot;

  const d0 = requireNonNegativeNumber(input.defectDensityPerCm2, 'computeLotYield.defectDensityPerCm2');
  const yieldFraction = murphyYield(d0, dieAreaCm2);
  const expectedGoodDiesPerWafer = gdw * yieldFraction;
  const netGoodDies = Math.floor(expectedGoodDiesPerWafer * wafersPerLot);

  return Object.freeze({
    waferSize: input.waferSize,
    dieAreaMm2,
    dieAreaCm2,
    grossDiesPerWafer: gdw,
    totalGrossDies,
    defectDensityPerCm2: d0,
    yieldFraction,
    expectedGoodDiesPerWafer,
    netGoodDies,
  });
}

