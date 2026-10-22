import {
  LithoSource,
  MaintenanceState,
  ProcessType,
  WaferSize,
  TechnologyNode,
} from './enums.ts';
import { FAB_CONVENTIONS } from './constants.ts';
import { nodeWithinRange } from './nodeSpecs.ts';
import {
  ValidationError,
  requireInRange,
  requireNonEmptyArray,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireOneOf,
  requirePositiveNumber,
  deepFreeze,
} from './validation.ts';

/** A technology capability window expressed by feature size (nm). */
export interface NodeRange {
  /** Smallest (most advanced) feature size the tool can handle, in nm. */
  mostAdvancedNm: number;
  /** Largest (most mature) feature size the tool can handle, in nm. */
  mostMatureNm: number;
}

/** Maintenance / health telemetry for a machine. */
export interface MaintenanceStatus {
  /** 0–100: how healthy the tool is right now (100 = factory fresh). */
  healthPercent: number;
  /** 0–100: cumulative wear since last overhaul (0 = new). */
  wearPercent: number;
  /** Process hours accrued since the last preventive maintenance. */
  hoursSinceLastPm: number;
  /** Derived lifecycle state. */
  state: MaintenanceState;
}

/** A piece of fab equipment. Immutable after creation. */
export interface Equipment {
  readonly id: string;
  readonly brand: string; // real-world vendor (ASML, Lam Research, ...)
  readonly modelName: string;
  readonly processType: ProcessType;
  readonly supportedNodes: NodeRange;
  readonly supportedWaferSizes: readonly WaferSize[];
  /** Wafers processed per hour (gross line rate). */
  readonly throughputWph: number;
  /** Base defect density introduced per wafer pass, in defects/cm². */
  readonly baseDefectRatePerCm2: number;
  readonly powerConsumptionKw: number;
  readonly maintenance: MaintenanceStatus;
  /** Only meaningful for LITHOGRAPHY tools; the exposure light source. */
  readonly lithoSource?: LithoSource;
  /** Acquisition cost in USD (economy seed). */
  readonly priceUsd?: number;
}

/** Caller-supplied input for {@link createEquipment}. */
export interface EquipmentInput {
  id: string;
  brand: string;
  modelName: string;
  processType: ProcessType;
  supportedNodes: NodeRange;
  supportedWaferSizes: WaferSize[];
  throughputWph: number;
  baseDefectRatePerCm2: number;
  powerConsumptionKw: number;
  maintenance?: Partial<MaintenanceStatus>;
  lithoSource?: LithoSource;
  priceUsd?: number;
}

/** Compute the derived maintenance state from raw health/wear telemetry. */
export function deriveMaintenanceState(
  healthPercent: number,
  wearPercent: number,
): MaintenanceState {
  if (healthPercent < FAB_CONVENTIONS.BROKEN_HEALTH_THRESHOLD_PERCENT) return MaintenanceState.BROKEN;
  if (healthPercent < FAB_CONVENTIONS.MAINTENANCE_HEALTH_THRESHOLD_PERCENT) return MaintenanceState.NEEDS_PM;
  if (wearPercent >= FAB_CONVENTIONS.MAINTENANCE_WEAR_THRESHOLD_PERCENT) return MaintenanceState.NEEDS_PM;
  return MaintenanceState.IDLE;
}

/**
 * Validate raw input and build an immutable {@link Equipment}.
 *
 * Throws {@link ValidationError} on any malformed field. Defensive by design:
 * this is the single gate through which all equipment enters the simulation.
 */
export function createEquipment(input: EquipmentInput): Equipment {
  const id = requireNonEmptyString(input.id, 'equipment.id');
  // Brands are intentionally lenient: unknown vendors are allowed (modding /
  // white-label tools); only non-emptiness is enforced here. Use
  // `isKnownBrand` (constants.ts) wherever strict brand gating is wanted.
  const brand = requireNonEmptyString(input.brand, 'equipment.brand');
  const modelName = requireNonEmptyString(input.modelName, 'equipment.modelName');
  const processType = requireOneOf(
    input.processType,
    'equipment.processType',
    Object.values(ProcessType),
  );

  // --- supported node window ---
  const nodes = input.supportedNodes;
  const mostAdvancedNm = requirePositiveNumber(nodes?.mostAdvancedNm, 'equipment.supportedNodes.mostAdvancedNm');
  const mostMatureNm = requirePositiveNumber(nodes?.mostMatureNm, 'equipment.supportedNodes.mostMatureNm');
  if (mostAdvancedNm > mostMatureNm) {
    throw new ValidationError(
      'equipment.supportedNodes',
      `mostAdvancedNm (${mostAdvancedNm}) must be <= mostMatureNm (${mostMatureNm})`,
    );
  }

  // --- supported wafer sizes ---
  const waferSizes = requireNonEmptyArray<WaferSize>(
    input.supportedWaferSizes,
    'equipment.supportedWaferSizes',
  ).map((s, i) => requireOneOf(s, `equipment.supportedWaferSizes[${i}]`, Object.values(WaferSize)));

  const throughputWph = requirePositiveNumber(input.throughputWph, 'equipment.throughputWph');
  const baseDefectRate = requireNonNegativeNumber(input.baseDefectRatePerCm2, 'equipment.baseDefectRatePerCm2');
  const powerKw = requirePositiveNumber(input.powerConsumptionKw, 'equipment.powerConsumptionKw');

  // --- maintenance (optional; defaults to factory-fresh) ---
  const m = input.maintenance ?? {};
  const healthPercent = requireInRange(m.healthPercent ?? 100, 'equipment.maintenance.healthPercent', 0, 100);
  const wearPercent = requireInRange(m.wearPercent ?? 0, 'equipment.maintenance.wearPercent', 0, 100);
  const hoursSinceLastPm = requireNonNegativeNumber(m.hoursSinceLastPm ?? 0, 'equipment.maintenance.hoursSinceLastPm');
  const maintenance: MaintenanceStatus = {
    healthPercent,
    wearPercent,
    hoursSinceLastPm,
    state: deriveMaintenanceState(healthPercent, wearPercent),
  };

  // --- litho-only fields ---
  const lithoSource =
    input.lithoSource === undefined
      ? undefined
      : requireOneOf(input.lithoSource, 'equipment.lithoSource', Object.values(LithoSource));
  if (processType === ProcessType.LITHOGRAPHY && lithoSource === undefined) {
    throw new Error('[ValidationError] equipment.lithoSource: required for LITHOGRAPHY equipment');
  }

  const priceUsd =
    input.priceUsd === undefined ? undefined : requirePositiveNumber(input.priceUsd, 'equipment.priceUsd');

  const equipment: Equipment = {
    id,
    brand,
    modelName,
    processType,
    supportedNodes: { mostAdvancedNm, mostMatureNm },
    supportedWaferSizes: waferSizes,
    throughputWph,
    baseDefectRatePerCm2: baseDefectRate,
    powerConsumptionKw: powerKw,
    maintenance,
    ...(lithoSource !== undefined ? { lithoSource } : {}),
    ...(priceUsd !== undefined ? { priceUsd } : {}),
  };
  return deepFreeze(equipment);
}

/** Does this tool's node window cover `node`? */
export function supportsNode(equipment: Equipment, node: TechnologyNode): boolean {
  return nodeWithinRange(node, equipment.supportedNodes.mostAdvancedNm, equipment.supportedNodes.mostMatureNm);
}

/** Does this tool handle the given wafer size? */
export function supportsWaferSize(equipment: Equipment, size: WaferSize): boolean {
  return equipment.supportedWaferSizes.includes(size);
}

/** Is the tool available to run (not down for maintenance/broken)? */
export function isOperational(equipment: Equipment): boolean {
  return (
    equipment.maintenance.state !== MaintenanceState.BROKEN &&
    equipment.maintenance.state !== MaintenanceState.MAINTENANCE
  );
}

/**
 * Effective per-pass defect rate after wear penalty.
 *
 * A worn tool (low health) leaks extra defects: we scale the base rate by a
 * wear multiplier in [1, 2], doubling at zero health. This gives maintenance
 * real yield consequences without new state on the equipment record.
 */
export function effectiveDefectRatePerCm2(equipment: Equipment): number {
  const wearMultiplier = 1 + (100 - equipment.maintenance.healthPercent) / 100;
  return equipment.baseDefectRatePerCm2 * wearMultiplier;
}

