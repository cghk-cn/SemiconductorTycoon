import {
  ComponentCategory,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from './enums.ts';
import { NODE_SPECS } from './nodeSpecs.ts';
import {
  ValidationError,
  deepFreeze,
  requireNonEmptyArray,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireOneOf,
  requirePositiveNumber,
} from './validation.ts';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** A consumable input consumed by one or more recipe steps. */
export interface MaterialRequirement {
  readonly materialId: string;
  readonly name: string;
  readonly category: MaterialCategory;
  /** Amount consumed per wafer. */
  readonly quantityPerWafer: number;
  readonly unit: string; // e.g. 'ml', 'g', 'pcs', 'slm'
}

// ---------------------------------------------------------------------------
// Process steps
// ---------------------------------------------------------------------------

/** One station in the wafer's journey through the fab. */
export interface ProcessStep {
  readonly stepId: string;
  readonly name: string;
  readonly processType: ProcessType;
  /** Mask/layer ordinal — populated for LITHOGRAPHY steps (1-based). */
  readonly maskIndex?: number;
  /** Processing time for the whole lot at this station, in minutes. */
  readonly durationMinutes: number;
  /**
   * Intrinsic defect density this step adds to the wafer, in defects/cm².
   * Equipment wear adds on top of this via the lot runner.
   */
  readonly stepDefectDensityPerCm2: number;
  /** materialIds consumed at this step (must exist in recipe.materials). */
  readonly consumesMaterialIds: readonly string[];
  /**
   * The 15-stage process-flow node this step implements.
   *
   * Optional for backwards compatibility with hand-authored recipes; every
   * recipe produced by `buildFlowRecipe` sets it, which lets the router and
   * the fab-floor UI trace a lot's position in the canonical flow.
   */
  readonly processNodeId?: string;
}

// ---------------------------------------------------------------------------
// Packaging
// ---------------------------------------------------------------------------

/** A companion component that must accompany the finished die in a package. */
export interface CompanionComponent {
  readonly category: ComponentCategory;
  /** Minimum units of this companion required per packaged unit. */
  readonly minQuantityPerUnit: number;
}

/** Back-end assembly requirements. */
export interface PackagingSpec {
  readonly packagingType: PackagingType;
  /** Human label for the assembly house / flow. */
  readonly assemblyFlowName: string;
  /** Companion components (e.g. MLCC decoupling caps) required per package. */
  readonly companionComponents: readonly CompanionComponent[];
}

// ---------------------------------------------------------------------------
// Product recipe
// ---------------------------------------------------------------------------

/** A complete, buildable product definition. */
export interface ProductRecipe {
  readonly recipeId: string;
  readonly productName: string;
  readonly category: ComponentCategory;
  readonly targetNode: TechnologyNode;
  readonly waferSize: WaferSize;
  /** Area of a single good裸晶 in mm². Drives GDW and Murphy yield. */
  readonly dieSizeMm2: number;
  /** Total lithography masks implied by the pipeline (computed). */
  readonly maskCount: number;
  readonly materials: readonly MaterialRequirement[];
  readonly processSteps: readonly ProcessStep[];
  readonly packaging: PackagingSpec;
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/** Validate and build a single immutable {@link ProcessStep}. */
export function createProcessStep(input: {
  stepId: string;
  name: string;
  processType: ProcessType;
  maskIndex?: number;
  durationMinutes: number;
  stepDefectDensityPerCm2: number;
  consumesMaterialIds?: string[];
  processNodeId?: string;
}): ProcessStep {
  const stepId = requireNonEmptyString(input.stepId, 'processStep.stepId');
  const name = requireNonEmptyString(input.name, 'processStep.name');
  const processType = requireOneOf(input.processType, 'processStep.processType', Object.values(ProcessType));
  const durationMinutes = requirePositiveNumber(input.durationMinutes, 'processStep.durationMinutes');
  const stepDefect = requireNonNegativeNumber(
    input.stepDefectDensityPerCm2,
    'processStep.stepDefectDensityPerCm2',
  );

  if (processType === ProcessType.LITHOGRAPHY) {
    requirePositiveNumber(input.maskIndex, 'processStep.maskIndex (required for LITHOGRAPHY)');
  } else if (input.maskIndex !== undefined) {
    requirePositiveNumber(input.maskIndex, 'processStep.maskIndex');
  }

  const consumesMaterialIds = (input.consumesMaterialIds ?? []).map((id, i) =>
    requireNonEmptyString(id, `processStep.consumesMaterialIds[${i}]`),
  );

  const step: ProcessStep = {
    stepId,
    name,
    processType,
    ...(input.maskIndex !== undefined ? { maskIndex: input.maskIndex } : {}),
    durationMinutes,
    stepDefectDensityPerCm2: stepDefect,
    consumesMaterialIds,
    ...(input.processNodeId !== undefined
      ? { processNodeId: requireNonEmptyString(input.processNodeId, 'processStep.processNodeId') }
      : {}),
  };
  return deepFreeze(step);
}

/** Count how many LITHOGRAPHY steps a pipeline contains (= mask count). */
export function countMasks(steps: readonly ProcessStep[]): number {
  return steps.filter((s) => s.processType === ProcessType.LITHOGRAPHY).length;
}

/** Caller input for {@link createProductRecipe}. */
export interface ProductRecipeInput {
  recipeId: string;
  productName: string;
  category: ComponentCategory;
  targetNode: TechnologyNode;
  waferSize: WaferSize;
  dieSizeMm2: number;
  materials: MaterialRequirement[];
  processSteps: ProcessStep[];
  packaging: PackagingSpec;
}

/**
 * Validate and build an immutable {@link ProductRecipe}.
 *
 * Cross-checks that every `consumesMaterialIds` reference exists in
 * `materials`, that the wafer size is realistic for the target node, and that
 * the packaging section is well-formed. `maskCount` is derived, never trusted.
 */
export function createProductRecipe(input: ProductRecipeInput): ProductRecipe {
  const recipeId = requireNonEmptyString(input.recipeId, 'recipe.recipeId');
  const productName = requireNonEmptyString(input.productName, 'recipe.productName');
  const category = requireOneOf(input.category, 'recipe.category', Object.values(ComponentCategory));
  const targetNode = requireOneOf(input.targetNode, 'recipe.targetNode', Object.values(TechnologyNode));
  const waferSize = requireOneOf(input.waferSize, 'recipe.waferSize', Object.values(WaferSize));
  const dieSizeMm2 = requirePositiveNumber(input.dieSizeMm2, 'recipe.dieSizeMm2');

  // Wafer size must be one the node realistically uses (soft historical guard).
  const nodeSpec = NODE_SPECS[targetNode];
  if (!nodeSpec.typicalWaferSizes.includes(waferSize)) {
    throw new ValidationError(
      'recipe.waferSize',
      `${waferSize} is not a typical wafer size for ${targetNode} (expected one of ${nodeSpec.typicalWaferSizes.join(', ')})`,
    );
  }

  // --- materials ---
  const materials = requireNonEmptyArray<MaterialRequirement>(input.materials, 'recipe.materials').map(
    (mat, i) => {
      const materialId = requireNonEmptyString(mat.materialId, `recipe.materials[${i}].materialId`);
      const name = requireNonEmptyString(mat.name, `recipe.materials[${i}].name`);
      const matCategory = requireOneOf(
        mat.category,
        `recipe.materials[${i}].category`,
        Object.values(MaterialCategory),
      );
      const quantityPerWafer = requirePositiveNumber(
        mat.quantityPerWafer,
        `recipe.materials[${i}].quantityPerWafer`,
      );
      const unit = requireNonEmptyString(mat.unit, `recipe.materials[${i}].unit`);
      return deepFreeze({ materialId, name, category: matCategory, quantityPerWafer, unit });
    },
  );
  const materialIds = new Set(materials.map((m) => m.materialId));
  if (materialIds.size !== materials.length) {
    throw new ValidationError('recipe.materials', 'materialId values must be unique');
  }

  // --- process steps ---
  const processSteps = requireNonEmptyArray<ProcessStep>(input.processSteps, 'recipe.processSteps');
  const seenStepIds = new Set<string>();
  for (const [i, step] of processSteps.entries()) {
    if (seenStepIds.has(step.stepId)) {
      throw new ValidationError('recipe.processSteps', `duplicate stepId '${step.stepId}' at index ${i}`);
    }
    seenStepIds.add(step.stepId);
    for (const matId of step.consumesMaterialIds) {
      if (!materialIds.has(matId)) {
        throw new ValidationError(
          'recipe.processSteps',
          `step '${step.stepId}' consumes unknown material '${matId}'`,
        );
      }
    }
  }

  const maskCount = countMasks(processSteps);
  if (maskCount === 0) {
    throw new ValidationError('recipe.processSteps', 'pipeline must contain at least one LITHOGRAPHY step');
  }

  // --- packaging ---
  const pkg = input.packaging;
  const packagingType = requireOneOf(pkg.packagingType, 'recipe.packaging.packagingType', Object.values(PackagingType));
  const assemblyFlowName = requireNonEmptyString(pkg.assemblyFlowName, 'recipe.packaging.assemblyFlowName');
  const companionComponents = (pkg.companionComponents ?? []).map((c, i) => {
    const compCategory = requireOneOf(
      c.category,
      `recipe.packaging.companionComponents[${i}].category`,
      Object.values(ComponentCategory),
    );
    const minQuantityPerUnit = requirePositiveNumber(
      c.minQuantityPerUnit,
      `recipe.packaging.companionComponents[${i}].minQuantityPerUnit`,
    );
    return deepFreeze({ category: compCategory, minQuantityPerUnit });
  });

  return deepFreeze({
    recipeId,
    productName,
    category,
    targetNode,
    waferSize,
    dieSizeMm2,
    maskCount,
    materials,
    processSteps,
    packaging: deepFreeze({ packagingType, assemblyFlowName, companionComponents }),
  });
}

// ---------------------------------------------------------------------------
// Pipeline builder
// ---------------------------------------------------------------------------

/** Tunables for {@link buildStandardCmosPipeline}. */
export interface CmosPipelineConfig {
  /** Number of metal interconnect levels (drives the repeated mask loop). */
  metalLayerCount: number;
  /** Emit the well/field-oxidation front module (default true). */
  includeWellModule?: boolean;
  /** Emit the gate-oxide / poly / source-drain module (default true). */
  includeGateModule?: boolean;
  /** Intrinsic defects/cm² contributed by each generated step (default 0.005). */
  baseDefectPerStep?: number;
  /** Cycle-time multiplier (default 1.0). Larger dies → slower lots. */
  cycleTimeScale?: number;
}

/** Nominal per-step cycle times in minutes, scaled by die size. */
const NOMINAL_STEP_MINUTES: Readonly<Record<ProcessType, number>> = Object.freeze({
  LITHOGRAPHY: 45,
  DEPOSITION: 40,
  ETCHING: 35,
  ION_IMPLANT: 30,
  THERMAL: 60,
  CMP: 25,
  CLEAN: 15,
  INSPECTION: 20,
  PACKAGING: 50,
  PASSIVE_SINTERING: 30,
});

/**
 * Generate a realistic front-end-of-line (FEOL) + back-end-of-line (BEOL)
 * CMOS pipeline for a planar device.
 *
 * The BEOL metal stack is the "repeated loop" from the design brief: each
 * metal level unrolls DEPOSITION → LITHOGRAPHY → ETCH, followed by a
 * dielectric/via module (inter-layer dielectric, via mask, via fill, CMP) that
 * is skipped on the top metal. Mask count is therefore derived from the
 * structure: 2 (well) + 1 (gate) + 1 (contact) + metalLayers + (metalLayers − 1)
 * vias + 1 (pad) = 2·metalLayers + 4.
 *
 * Returns a flat, ordered `ProcessStep[]` with sequential mask indices.
 */
export function buildStandardCmosPipeline(config: CmosPipelineConfig): ProcessStep[] {
  const metalLayerCount = Math.trunc(config.metalLayerCount);
  if (!Number.isFinite(metalLayerCount) || metalLayerCount < 1 || metalLayerCount > 12) {
    throw new ValidationError('pipeline.metalLayerCount', 'must be an integer between 1 and 12');
  }
  const includeWell = config.includeWellModule ?? true;
  const includeGate = config.includeGateModule ?? true;
  const defect = config.baseDefectPerStep ?? 0.005;
  const scale = config.cycleTimeScale ?? 1.0;

  const steps: ProcessStep[] = [];
  let maskIndex = 0;
  let seq = 0;

  const mk = (
    name: string,
    processType: ProcessType,
    opts: { mask?: boolean; materials?: string[] } = {},
  ): void => {
    seq += 1;
    const base = NOMINAL_STEP_MINUTES[processType];
    const step: Parameters<typeof createProcessStep>[0] = {
      stepId: `S${String(seq).padStart(2, '0')}_${processType}`,
      name,
      processType,
      durationMinutes: Math.round(base * scale),
      stepDefectDensityPerCm2: defect,
      consumesMaterialIds: opts.materials ?? [],
    };
    if (opts.mask) {
      maskIndex += 1;
      step.maskIndex = maskIndex;
    }
    steps.push(createProcessStep(step));
  };

  // 1. Well / field module (well implants are photoresist-masked → 2 masks)
  if (includeWell) {
    mk('Screen/Field Oxidation (LOCOS)', ProcessType.THERMAL);
    mk('N-Well Patterning', ProcessType.LITHOGRAPHY, {
      mask: true,
      materials: ['PHOTORESIST_I_LINE', 'MASK_RETICLE'],
    });
    mk('N-Well Implant', ProcessType.ION_IMPLANT, { materials: ['IMPLANT_N_PLUS'] });
    mk('P-Well Patterning', ProcessType.LITHOGRAPHY, {
      mask: true,
      materials: ['PHOTORESIST_I_LINE', 'MASK_RETICLE'],
    });
    mk('P-Well Implant', ProcessType.ION_IMPLANT, { materials: ['IMPLANT_P_PLUS'] });
    mk('Well Drive-In Anneal', ProcessType.THERMAL);
    mk('Post-Well Implant Resist Strip & Clean', ProcessType.CLEAN);
  }

  // 2. Gate module (single poly mask)
  if (includeGate) {
    mk('Gate Oxide Growth', ProcessType.THERMAL);
    mk('Polysilicon Deposition', ProcessType.DEPOSITION, { materials: ['POLY_SI'] });
    mk('Gate / Poly Patterning', ProcessType.LITHOGRAPHY, {
      mask: true,
      materials: ['PHOTORESIST_KRF', 'MASK_RETICLE'],
    });
    mk('Poly Gate Etch', ProcessType.ETCHING);
    mk('Source/Drain N+ Implant', ProcessType.ION_IMPLANT, { materials: ['IMPLANT_N_PLUS'] });
    mk('Source/Drain P+ Implant', ProcessType.ION_IMPLANT, { materials: ['IMPLANT_P_PLUS'] });
    mk('S/D Activation Anneal', ProcessType.THERMAL);
    mk('Post-S/D Resist Strip & Clean', ProcessType.CLEAN);
  }

  // 3. Contact module
  mk('ILD (BPSG) Deposition', ProcessType.DEPOSITION, { materials: ['CVD_BPSG'] });
  mk('Contact Patterning', ProcessType.LITHOGRAPHY, {
    mask: true,
    materials: ['PHOTORESIST_KRF', 'MASK_RETICLE'],
  });
  mk('Contact Via Etch', ProcessType.ETCHING);
  mk('Tungsten Contact Plug Fill', ProcessType.DEPOSITION, { materials: ['CVD_TUNGSTEN'] });
  mk('Tungsten CMP', ProcessType.CMP, { materials: ['CMP_SLURRY'] });
  mk('Post-Contact Clean', ProcessType.CLEAN);

  // 4. Metal stack (repeated loop)
  for (let m = 1; m <= metalLayerCount; m += 1) {
    mk(`Metal ${m} Deposition`, ProcessType.DEPOSITION, { materials: ['TARGET_ALUMINUM'] });
    mk(`Metal ${m} Patterning`, ProcessType.LITHOGRAPHY, {
      mask: true,
      materials: ['PHOTORESIST_I_LINE', 'MASK_RETICLE'],
    });
    mk(`Metal ${m} Etch`, ProcessType.ETCHING);
    if (m < metalLayerCount) {
      mk(`IMD ${m} Deposition`, ProcessType.DEPOSITION, { materials: ['CVD_BPSG'] });
      mk(`Via ${m} Patterning`, ProcessType.LITHOGRAPHY, {
        mask: true,
        materials: ['PHOTORESIST_I_LINE', 'MASK_RETICLE'],
      });
      mk(`Via ${m} Fill & CMP`, ProcessType.CMP, { materials: ['CMP_SLURRY'] });
    }
  }

  // 5. Passivation / pad module
  mk('Post-Metal-Stack Clean', ProcessType.CLEAN);
  mk('Passivation Nitride Deposition', ProcessType.DEPOSITION, { materials: ['CVD_BPSG'] });
  mk('Pad Opening Patterning', ProcessType.LITHOGRAPHY, {
    mask: true,
    materials: ['PHOTORESIST_I_LINE', 'MASK_RETICLE'],
  });
  mk('Final Inspection', ProcessType.INSPECTION);

  return steps;
}



