import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ComponentCategory,
  LithoSource,
  LotStatus,
  MaintenanceState,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import { NODE_SPECS, nodeNm, nodeWithinRange, nodesAdvancedFirst } from '../src/domain/nodeSpecs.ts';
import { waferAreaCm2, waferDiameterMm } from '../src/domain/constants.ts';
import {
  createEquipment,
  deriveMaintenanceState,
  effectiveDefectRatePerCm2,
  isOperational,
  supportsNode,
  supportsWaferSize,
  type Equipment,
} from '../src/domain/equipment.ts';
import {
  buildStandardCmosPipeline,
  countMasks,
  createProcessStep,
  createProductRecipe,
} from '../src/domain/recipe.ts';
import { ValidationError } from '../src/domain/validation.ts';
import { grossDiesPerWafer, murphyYield, poissonYield, seedsYield, computeLotYield } from '../src/domain/yield.ts';
import { createWaferLot, completeStep, scrapLot, elapsedMinutes, isComplete } from '../src/domain/waferLot.ts';
import { DispatchError, runLotStep, runLotToCompletion, validateDispatch } from '../src/domain/lotRunner.ts';

import {
  ASML_TWINSCAN_NXT_2000I,
  LAM_RESEARCH_KIYO_FX,
  TOOLSET_180NM,
  ALL_SAMPLE_EQUIPMENT,
} from '../src/samples/sampleEquipment.ts';
import { RETRO_180NM_GPU_RECIPE } from '../src/samples/sampleRecipes.ts';

// ---------------------------------------------------------------------------
// Physical constants & node specs
// ---------------------------------------------------------------------------

describe('wafer geometry constants', () => {
  it('computes the standard wafer surface areas in cm²', () => {
    // 300mm → r = 15cm → π·225 ≈ 706.858 cm²
    assert.ok(Math.abs(waferAreaCm2(WaferSize.WAFER_300MM) - 706.858) < 0.01);
    // 200mm → r = 10cm → π·100 ≈ 314.159 cm²
    assert.ok(Math.abs(waferAreaCm2(WaferSize.WAFER_200MM) - 314.159) < 0.01);
    // 150mm → r = 7.5cm → π·56.25 ≈ 176.715 cm²
    assert.ok(Math.abs(waferAreaCm2(WaferSize.WAFER_150MM) - 176.715) < 0.01);
  });

  it('maps wafer size to the correct diameter', () => {
    assert.equal(waferDiameterMm(WaferSize.WAFER_150MM), 150);
    assert.equal(waferDiameterMm(WaferSize.WAFER_200MM), 200);
    assert.equal(waferDiameterMm(WaferSize.WAFER_300MM), 300);
  });
});

describe('technology node metadata', () => {
  it('exposes a spec for every node', () => {
    for (const node of Object.values(TechnologyNode)) {
      const spec = NODE_SPECS[node];
      assert.ok(spec, `missing NODE_SPECS entry for ${node}`);
      assert.equal(spec.node, node);
      assert.ok(spec.matureDefectDensityPerCm2 > 0);
      assert.ok(spec.typicalMaskCount > 0);
    }
  });

  it('orders nodes by rank (advanced first) not by string', () => {
    const ordered = nodesAdvancedFirst(Object.values(TechnologyNode));
    assert.equal(ordered[0], TechnologyNode.NM_A10); // a10 is most advanced
    assert.equal(ordered[ordered.length - 1], TechnologyNode.NM_350);
    // Ranks strictly increase along the order.
    for (let i = 1; i < ordered.length; i += 1) {
      assert.ok(NODE_SPECS[ordered[i]!].rank > NODE_SPECS[ordered[i - 1]!].rank);
    }
  });

  it('evaluates node capability windows', () => {
    assert.equal(nodeWithinRange(TechnologyNode.NM_180, 180, 350), true);
    assert.equal(nodeWithinRange(TechnologyNode.NM_90, 180, 350), false);
    assert.equal(nodeWithinRange(TechnologyNode.NM_350, 180, 350), true);
    assert.equal(nodeWithinRange(TechnologyNode.NM_7, 7, 90), true);
    assert.equal(nodeNm(TechnologyNode.NM_28), 28);
  });
});

// ---------------------------------------------------------------------------
// Defensive validation (equipment factory)
// ---------------------------------------------------------------------------

function baseEquipmentInput() {
  return {
    id: 'EQ-TEST-001',
    brand: 'ASML',
    modelName: 'Test Scanner',
    processType: ProcessType.LITHOGRAPHY,
    supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
    supportedWaferSizes: [WaferSize.WAFER_200MM],
    throughputWph: 100,
    baseDefectRatePerCm2: 0.005,
    powerConsumptionKw: 50,
  };
}

describe('createEquipment validation', () => {
  it('builds a valid, frozen equipment record', () => {
    const eq = createEquipment({ ...baseEquipmentInput(), lithoSource: 'KRF' });
    assert.equal(eq.brand, 'ASML');
    assert.equal(eq.maintenance.state, MaintenanceState.IDLE);
    assert.ok(Object.isFrozen(eq));
    assert.equal(eq.maintenance.healthPercent, 100); // default fresh
  });

  it('rejects an empty id', () => {
    assert.throws(() => createEquipment({ ...baseEquipmentInput(), id: '   ' }), ValidationError);
  });

  it('rejects non-positive throughput / power', () => {
    assert.throws(
      () => createEquipment({ ...baseEquipmentInput(), lithoSource: 'KRF', throughputWph: 0 }),
      ValidationError,
    );
    assert.throws(
      () => createEquipment({ ...baseEquipmentInput(), lithoSource: 'KRF', powerConsumptionKw: -5 }),
      ValidationError,
    );
  });

  it('rejects an inverted node window', () => {
    assert.throws(
      () =>
        createEquipment({
          ...baseEquipmentInput(),
          lithoSource: 'KRF',
          supportedNodes: { mostAdvancedNm: 350, mostMatureNm: 180 },
        }),
      ValidationError,
    );
  });

  it('rejects LITHOGRAPHY equipment without a light source', () => {
    assert.throws(() => createEquipment(baseEquipmentInput()), /lithoSource/);
  });

  it('rejects out-of-range maintenance telemetry', () => {
    assert.throws(
      () =>
        createEquipment({
          ...baseEquipmentInput(),
          lithoSource: 'KRF',
          maintenance: { healthPercent: 140 },
        }),
      ValidationError,
    );
  });

  it('rejects an unknown process type / wafer size', () => {
    assert.throws(
      () => createEquipment({ ...baseEquipmentInput(), processType: 'BOGUS' as unknown as ProcessType }),
      ValidationError,
    );
    assert.throws(
      () =>
        createEquipment({
          ...baseEquipmentInput(),
          lithoSource: 'KRF',
          supportedWaferSizes: ['WAFER_450MM' as unknown as WaferSize],
        }),
      ValidationError,
    );
  });
});

describe('equipment capability & maintenance', () => {
  it('supportsNode / supportsWaferSize gate correctly', () => {
    assert.equal(supportsNode(ASML_TWINSCAN_NXT_2000I, TechnologyNode.NM_7), true);
    assert.equal(supportsNode(ASML_TWINSCAN_NXT_2000I, TechnologyNode.NM_180), false);
    assert.equal(supportsWaferSize(ASML_TWINSCAN_NXT_2000I, WaferSize.WAFER_300MM), true);
    assert.equal(supportsWaferSize(ASML_TWINSCAN_NXT_2000I, WaferSize.WAFER_200MM), false);
  });

  it('derives maintenance state from thresholds', () => {
    assert.equal(deriveMaintenanceState(90, 10), MaintenanceState.IDLE);
    assert.equal(deriveMaintenanceState(15, 20), MaintenanceState.NEEDS_PM); // low health
    assert.equal(deriveMaintenanceState(90, 85), MaintenanceState.NEEDS_PM); // high wear
    assert.equal(deriveMaintenanceState(3, 5), MaintenanceState.BROKEN);
  });

  it('isOperational reflects broken/maintenance states', () => {
    const broken = createEquipment({
      ...baseEquipmentInput(),
      lithoSource: 'KRF',
      maintenance: { healthPercent: 3, wearPercent: 10 },
    });
    assert.equal(broken.maintenance.state, MaintenanceState.BROKEN);
    assert.equal(isOperational(broken), false);
    assert.equal(isOperational(ASML_TWINSCAN_NXT_2000I), true);
  });

  it('wear scales the effective defect rate (poorer health ⇒ more defects)', () => {
    const fresh = effectiveDefectRatePerCm2(ASML_TWINSCAN_NXT_2000I); // health 96 → ×1.04
    const worn: Equipment = {
      ...ASML_TWINSCAN_NXT_2000I,
      maintenance: { ...ASML_TWINSCAN_NXT_2000I.maintenance, healthPercent: 50 },
    };
    const wornRate = effectiveDefectRatePerCm2(worn); // ×1.50
    assert.ok(Math.abs(fresh - ASML_TWINSCAN_NXT_2000I.baseDefectRatePerCm2 * 1.04) < 1e-9);
    assert.ok(Math.abs(wornRate - ASML_TWINSCAN_NXT_2000I.baseDefectRatePerCm2 * 1.5) < 1e-9);
    assert.ok(wornRate > fresh);
  });
});

// ---------------------------------------------------------------------------
// Yield engine
// ---------------------------------------------------------------------------

describe('gross dies per wafer (GDW) geometry', () => {
  it('matches a hand-computed 200mm / 10×10mm case', () => {
    // Deff = 200 − 2·3 = 194; A = 100 mm²
    // areaTerm = π·97²/100 = 295.593; edgeTerm = π·194/√200 = 43.096
    // N = floor(295.593 − 43.096) = 252
    assert.equal(grossDiesPerWafer(200, 10, 10, 3), 252);
  });

  it('yields more dies for smaller dies and larger wafers', () => {
    const small = grossDiesPerWafer(300, 5, 5, 3);
    const big = grossDiesPerWafer(300, 15, 15, 3);
    const smallWafer = grossDiesPerWafer(200, 5, 5, 3);
    assert.ok(small > big);
    assert.ok(small > smallWafer);
    assert.ok(small > 0);
  });

  it('rejects an edge exclusion too large for the wafer', () => {
    assert.throws(() => grossDiesPerWafer(200, 10, 10, 120), ValidationError);
  });
});

describe('yield models', () => {
  it('Murphy: Y→1 as D₀·A→0 and Y→0 as D₀·A grows', () => {
    assert.equal(murphyYield(0, 1.2), 1);
    // At x = D₀·A = 120, Y ≈ (1/120)² ≈ 7e-5.
    assert.ok(murphyYield(100, 1.2) < 0.0001);
  });

  it('Murphy matches a known analytic value', () => {
    // D₀ = 0.5, A = 1.0 → x = 0.5 → ((1−e^-0.5)/0.5)² = 0.6193
    assert.ok(Math.abs(murphyYield(0.5, 1.0) - 0.6193) < 1e-3);
  });

  it('Murphy is monotonically decreasing in defect density', () => {
    let prev = 1;
    for (const d of [0.1, 0.2, 0.4, 0.8, 1.6, 3.2]) {
      const y = murphyYield(d, 1.4);
      assert.ok(y < prev, `Y(${d}) = ${y} should be < ${prev}`);
      prev = y;
    }
  });

  it('Poisson and Seeds bracket the same limits', () => {
    assert.equal(poissonYield(0, 1.2), 1);
    assert.equal(seedsYield(0, 1.2), 1);
    // At x = D₀·A = 4: Poisson = e⁻⁴ = 0.018, Seeds = e⁻² = 0.135 → Seeds more optimistic.
    assert.ok(seedsYield(4, 1) > poissonYield(4, 1));
    // They coincide exactly at x = 1 (both e⁻¹).
    assert.ok(Math.abs(seedsYield(1, 1) - poissonYield(1, 1)) < 1e-12);
  });

  it('computeLotYield ties GDW × Murphy together', () => {
    const r = computeLotYield({
      waferSize: WaferSize.WAFER_200MM,
      dieWidthMm: 10,
      dieHeightMm: 10,
      defectDensityPerCm2: 0.5,
      wafersPerLot: 25,
    });
    assert.equal(r.grossDiesPerWafer, 252);
    assert.equal(r.totalGrossDies, 252 * 25);
    // A = 1.0 cm², D₀ = 0.5 → Y = 0.6193 → 156.06/wafer → floor(3901.5) = 3901
    assert.ok(Math.abs(r.yieldFraction - 0.6193) < 1e-3);
    assert.equal(r.netGoodDies, Math.floor(252 * 0.6193 * 25));
    assert.ok(r.netGoodDies <= r.totalGrossDies);
  });

  it('computeLotYield supports a square die from area only', () => {
    const r = computeLotYield({
      waferSize: WaferSize.WAFER_300MM,
      dieSizeMm2: 100,
      defectDensityPerCm2: 0.3,
      wafersPerLot: 25,
    });
    assert.ok(Math.abs(r.dieAreaCm2 - 1.0) < 1e-9);
    assert.ok(r.grossDiesPerWafer > 0);
  });

  it('computeLotYield requires a die footprint', () => {
    assert.throws(
      () => computeLotYield({ waferSize: WaferSize.WAFER_300MM, defectDensityPerCm2: 0.3, wafersPerLot: 25 }),
      ValidationError,
    );
  });
});

// ---------------------------------------------------------------------------
// Recipe pipeline
// ---------------------------------------------------------------------------

function minimalRecipeInput() {
  return {
    recipeId: 'RCP-TEST',
    productName: 'Test Die',
    category: ComponentCategory.CPU,
    targetNode: TechnologyNode.NM_180,
    waferSize: WaferSize.WAFER_200MM,
    dieSizeMm2: 50,
    materials: [
      {
        materialId: 'M1',
        name: 'Test Material',
        category: MaterialCategory.WAFER_SUBSTRATE,
        quantityPerWafer: 1,
        unit: 'pcs',
      },
    ],
    processSteps: [
      createProcessStep({
        stepId: 'S1',
        name: 'Litho',
        processType: ProcessType.LITHOGRAPHY,
        maskIndex: 1,
        durationMinutes: 10,
        stepDefectDensityPerCm2: 0.01,
        consumesMaterialIds: ['M1'],
      }),
    ],
    packaging: {
      packagingType: PackagingType.BGA,
      assemblyFlowName: 'Test Flow',
      companionComponents: [],
    },
  };
}

describe('CMOS pipeline builder', () => {
  it('unrolls metal/via loops into a flat step list with sequential masks', () => {
    const steps = buildStandardCmosPipeline({ metalLayerCount: 6 });
    assert.equal(countMasks(steps), 16); // 2 well + gate + contact + 6 metal + 5 via + pad
    // Mask indices are sequential 1..16.
    const maskIndices = steps.filter((s) => s.maskIndex !== undefined).map((s) => s.maskIndex);
    assert.deepEqual(maskIndices, Array.from({ length: 16 }, (_, i) => i + 1));
    // Step ids are unique.
    assert.equal(new Set(steps.map((s) => s.stepId)).size, steps.length);
  });

  it('honours includeWellModule=false by dropping 2 masks and the well steps', () => {
    const withoutWell = buildStandardCmosPipeline({ metalLayerCount: 6, includeWellModule: false });
    assert.equal(countMasks(withoutWell), 14);
  });

  it('rejects an out-of-range metal layer count', () => {
    assert.throws(() => buildStandardCmosPipeline({ metalLayerCount: 0 }), ValidationError);
    assert.throws(() => buildStandardCmosPipeline({ metalLayerCount: 13 }), ValidationError);
  });
});

describe('createProductRecipe validation', () => {
  it('accepts a well-formed recipe and derives mask count', () => {
    const r = createProductRecipe(minimalRecipeInput());
    assert.equal(r.maskCount, 1);
    assert.ok(Object.isFrozen(r));
  });

  it('rejects a step that consumes an unknown material', () => {
    const input = minimalRecipeInput();
    input.processSteps = [
      {
        stepId: 'S1',
        name: 'Litho',
        processType: ProcessType.LITHOGRAPHY,
        maskIndex: 1,
        durationMinutes: 10,
        stepDefectDensityPerCm2: 0.01,
        consumesMaterialIds: ['GHOST'],
      },
    ];
    assert.throws(() => createProductRecipe(input), /unknown material/);
  });

  it('rejects a wafer size that is untypical for the node', () => {
    const input = { ...minimalRecipeInput(), waferSize: WaferSize.WAFER_300MM }; // 180nm never ran on 300mm
    assert.throws(() => createProductRecipe(input), ValidationError);
  });

  it('rejects duplicate material ids', () => {
    const input = minimalRecipeInput();
    input.materials.push({ ...input.materials[0]! });
    assert.throws(() => createProductRecipe(input), /unique/);
  });

  it('rejects a pipeline with no lithography', () => {
    const input = minimalRecipeInput();
    input.processSteps = [
      {
        stepId: 'S1',
        name: 'Deposit',
        processType: ProcessType.DEPOSITION,
        durationMinutes: 10,
        stepDefectDensityPerCm2: 0.01,
        consumesMaterialIds: [],
      },
    ];
    assert.throws(() => createProductRecipe(input), /LITHOGRAPHY/);
  });
});

describe('sample: Retro 180nm Discrete GPU recipe', () => {
  it('is internally consistent', () => {
    const r = RETRO_180NM_GPU_RECIPE;
    assert.equal(r.maskCount, 16);
    assert.equal(r.processSteps.length, 58);
    // Every consumed material exists.
    const ids = new Set(r.materials.map((m) => m.materialId));
    for (const step of r.processSteps) {
      for (const matId of step.consumesMaterialIds) {
        assert.ok(ids.has(matId), `step ${step.stepId} references unknown material ${matId}`);
      }
    }
    // Packaging requires MLCC decoupling caps.
    const mlcc = r.packaging.companionComponents.find((c) => c.category === ComponentCategory.MLCC);
    assert.ok(mlcc && mlcc.minQuantityPerUnit >= 6);
    assert.equal(r.waferSize, WaferSize.WAFER_200MM);
    assert.equal(r.targetNode, TechnologyNode.NM_180);
  });
});

// ---------------------------------------------------------------------------
// Wafer lot tracking
// ---------------------------------------------------------------------------

function freshLot() {
  return createWaferLot({
    lotId: 'LOT-TEST',
    recipeId: RETRO_180NM_GPU_RECIPE.recipeId,
    waferSize: WaferSize.WAFER_200MM,
    targetNode: TechnologyNode.NM_180,
  });
}

describe('wafer lot tracking', () => {
  it('starts queued at step 0 with zero defects', () => {
    const lot = freshLot();
    assert.equal(lot.status, LotStatus.WAITING_NEXT_MACHINE);
    assert.equal(lot.currentStepIndex, 0);
    assert.equal(lot.accumulatedDefectDensityPerCm2, 0);
    assert.equal(lot.wafersPerLot, 25);
    assert.equal(lot.log.length, 0);
  });

  it('rejects an empty lot', () => {
    assert.throws(
      () =>
        createWaferLot({
          lotId: 'X',
          recipeId: 'R',
          waferSize: WaferSize.WAFER_200MM,
          targetNode: TechnologyNode.NM_180,
          wafersPerLot: 0,
        }),
      ValidationError,
    );
  });

  it('completeStep advances, accumulates defects, and completes at the end', () => {
    let lot = freshLot();
    const total = RETRO_180NM_GPU_RECIPE.processSteps.length;
    lot = completeStep(
      lot,
      { stepIndex: 0, stepId: 'S1', equipmentId: 'EQ', defectDensityAddedPerCm2: 0.01, durationMinutes: 30 },
      total,
    );
    assert.equal(lot.currentStepIndex, 1);
    assert.equal(lot.status, LotStatus.WAITING_NEXT_MACHINE);
    assert.ok(Math.abs(lot.accumulatedDefectDensityPerCm2 - 0.01) < 1e-9);

    for (let i = 1; i < total; i += 1) {
      lot = completeStep(
        lot,
        { stepIndex: i, stepId: `S${i}`, equipmentId: 'EQ', defectDensityAddedPerCm2: 0, durationMinutes: 1 },
        total,
      );
    }
    assert.equal(lot.currentStepIndex, total);
    assert.equal(lot.status, LotStatus.COMPLETED);
    assert.equal(isComplete(lot), true);
    assert.equal(lot.log.length, total);
    assert.ok(elapsedMinutes(lot) >= total - 1);
  });

  it('rejects completing a step out of order', () => {
    assert.throws(
      () =>
        completeStep(
          freshLot(),
          { stepIndex: 5, stepId: 'X', equipmentId: 'EQ', defectDensityAddedPerCm2: 0, durationMinutes: 1 },
          58,
        ),
      ValidationError,
    );
  });

  it('scrapLot kills the lot', () => {
    const lot = scrapLot(freshLot(), 'chamber explosion');
    assert.equal(lot.status, LotStatus.SCRAPPED);
    assert.equal(lot.scrapReason, 'chamber explosion');
  });
});

// ---------------------------------------------------------------------------
// Lot runner (dispatch + defect accumulation)
// ---------------------------------------------------------------------------

describe('lot runner', () => {
  it('runs a full 180nm GPU lot to COMPLETED via the toolset', () => {
    const recipe = RETRO_180NM_GPU_RECIPE;
    const done = runLotToCompletion(freshLot(), recipe, (_i, step) => {
      const tool = TOOLSET_180NM[step.processType];
      if (!tool) throw new Error(`no tool for ${step.processType}`);
      return tool;
    });
    assert.equal(done.status, LotStatus.COMPLETED);
    assert.equal(done.currentStepIndex, recipe.processSteps.length);
    assert.equal(done.log.length, recipe.processSteps.length);
    assert.ok(done.accumulatedDefectDensityPerCm2 > 0.1);
    for (const entry of done.log) {
      const step = recipe.processSteps[entry.stepIndex]!;
      assert.equal(TOOLSET_180NM[step.processType]?.id, entry.equipmentId);
    }
  });

  it('adds intrinsic + machine (wear-scaled) defects per step', () => {
    const recipe = RETRO_180NM_GPU_RECIPE;
    const tool = TOOLSET_180NM[ProcessType.THERMAL]!;
    const next = runLotStep(freshLot(), recipe, tool);
    const expected = recipe.processSteps[0]!.stepDefectDensityPerCm2 + effectiveDefectRatePerCm2(tool);
    assert.ok(Math.abs(next.accumulatedDefectDensityPerCm2 - expected) < 1e-12);
  });

  it('rejects dispatching by wrong process type', () => {
    const etcher = TOOLSET_180NM[ProcessType.ETCHING]!;
    assert.throws(() => runLotStep(freshLot(), RETRO_180NM_GPU_RECIPE, etcher), DispatchError);
  });

  it('rejects an advanced-node scanner for a 180nm lot', () => {
    const recipe = RETRO_180NM_GPU_RECIPE;
    const idx = recipe.processSteps.findIndex((s) => s.processType === ProcessType.LITHOGRAPHY);
    // Process type matches, but node window (7–90nm) excludes 180nm.
    assert.throws(() => validateDispatch(freshLot(), recipe, idx, ASML_TWINSCAN_NXT_2000I), DispatchError);
  });

  it('rejects an inoperable (broken) machine', () => {
    const base = TOOLSET_180NM[ProcessType.THERMAL]!;
    const broken: Equipment = {
      ...base,
      maintenance: { ...base.maintenance, healthPercent: 2, state: MaintenanceState.BROKEN },
    };
    assert.throws(() => validateDispatch(freshLot(), RETRO_180NM_GPU_RECIPE, 0, broken), DispatchError);
  });

  it('cannot advance a COMPLETED lot', () => {
    const recipe = RETRO_180NM_GPU_RECIPE;
    const done = runLotToCompletion(freshLot(), recipe, (_i, step) => TOOLSET_180NM[step.processType]!);
    assert.throws(() => runLotStep(done, recipe, TOOLSET_180NM[ProcessType.THERMAL]!), DispatchError);
  });

  it('toolset covers every process type the recipe uses', () => {
    const usedTypes = new Set(RETRO_180NM_GPU_RECIPE.processSteps.map((s) => s.processType));
    for (const t of usedTypes) {
      assert.ok(TOOLSET_180NM[t], `toolset missing a machine for ${t}`);
    }
    assert.ok(ALL_SAMPLE_EQUIPMENT.length >= usedTypes.size);
  });

  it('flagship machines are advanced-node showroom pieces', () => {
    assert.equal(ASML_TWINSCAN_NXT_2000I.lithoSource, LithoSource.ARF_IMMERSION);
    assert.ok(LAM_RESEARCH_KIYO_FX.supportedNodes.mostAdvancedNm <= 7);
    for (const eq of ALL_SAMPLE_EQUIPMENT) {
      assert.ok(Object.isFrozen(eq));
      assert.ok(eq.throughputWph > 0 && eq.powerConsumptionKw > 0);
    }
  });
});





