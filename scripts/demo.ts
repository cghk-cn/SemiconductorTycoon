/**
 * Semiconductor Tycoon — Step 1 domain-model demo.
 *
 * Runs a 25-wafer lot of the "Retro 180nm Discrete GPU" end-to-end through the
 * generated FEOL/BEOL pipeline using the 180nm-era toolset, then applies the
 * gross-die geometry + Murphy's yield model to report net good dies.
 *
 * Run: node scripts/demo.ts
 */

import { LotStatus } from '../src/domain/enums.ts';
import { runLotToCompletion, type DispatchFn } from '../src/domain/lotRunner.ts';
import { createWaferLot, elapsedMinutes } from '../src/domain/waferLot.ts';
import { computeLotYield } from '../src/domain/yield.ts';
import { TOOLSET_180NM, ASML_TWINSCAN_NXT_2000I, LAM_RESEARCH_KIYO_FX } from '../src/samples/sampleEquipment.ts';
import { RETRO_180NM_GPU_RECIPE as RECIPE } from '../src/samples/sampleRecipes.ts';

const rule = (ch = '─', n = 74): string => ch.repeat(n);

console.log(rule('═'));
console.log(' SEMICONDUCTOR TYCOON — Step 1: Core Domain Models demo');
console.log(rule('═'));

// --- 1. Recipe overview ------------------------------------------------------
console.log(`\n▶ Recipe: ${RECIPE.productName}  [${RECIPE.recipeId}]`);
console.log(`  target node      : ${RECIPE.targetNode}`);
console.log(`  wafer size       : ${RECIPE.waferSize} (Ø200mm)`);
console.log(`  die size         : ${RECIPE.dieSizeMm2} mm²`);
console.log(`  mask count       : ${RECIPE.maskCount}`);
console.log(`  process steps    : ${RECIPE.processSteps.length}`);
console.log(`  materials        : ${RECIPE.materials.length} consumables`);
console.log(`  packaging        : ${RECIPE.packaging.packagingType}`);
for (const c of RECIPE.packaging.companionComponents) {
  console.log(`    - requires >= ${c.minQuantityPerUnit} ${c.category} per package`);
}

// --- 2. Run the lot through the fab ------------------------------------------
console.log('\n▶ Dispatch plan: every step routed by process type to the 180nm toolset');
const dispatch: DispatchFn = (_idx, step, _lot) => {
  const tool = TOOLSET_180NM[step.processType];
  if (!tool) {
    throw new Error(`No tool available for process type ${step.processType}`);
  }
  return tool;
};

let lot = createWaferLot({
  lotId: 'LOT-180GPU-0001',
  recipeId: RECIPE.recipeId,
  waferSize: RECIPE.waferSize,
  targetNode: RECIPE.targetNode,
});
console.log(`  lot ${lot.lotId}: ${lot.wafersPerLot} wafers queued at step 0 of ${RECIPE.processSteps.length}\n`);

console.log('  #   stepId        process        machine                          cum D0 (def/cm²)');
console.log(`  ${rule()}`);
lot = runLotToCompletion(lot, RECIPE, dispatch);

// Re-walk the log to print each completed step with running defect density.
let runningD0 = 0;
for (const [i, entry] of lot.log.entries()) {
  runningD0 += entry.defectDensityAddedPerCm2;
  const tool = TOOLSET_180NM[RECIPE.processSteps[entry.stepIndex]?.processType ?? ''];
  console.log(
    `  ${String(i + 1).padStart(2)}  ${entry.stepId.padEnd(13)} ` +
      `${(RECIPE.processSteps[entry.stepIndex]?.processType ?? '?').padEnd(14)} ` +
      `${(tool ? `${tool.brand} ${tool.modelName}` : entry.equipmentId).padEnd(30)} ` +
      `${runningD0.toFixed(4)}`,
  );
}

console.log(`  ${rule()}`);
console.log(`  status            : ${lot.status}`);
console.log(`  steps completed   : ${lot.currentStepIndex}/${RECIPE.processSteps.length}`);
console.log(`  accumulated D0    : ${lot.accumulatedDefectDensityPerCm2.toFixed(4)} defects/cm²`);
console.log(`  total cycle time  : ${(elapsedMinutes(lot) / 60).toFixed(1)} h (${(elapsedMinutes(lot) / 60 / 24).toFixed(1)} days)`);

if (lot.status !== LotStatus.COMPLETED) {
  throw new Error(`Lot did not complete: ${lot.status} ${lot.scrapReason ?? ''}`);
}

// --- 3. Compute yield --------------------------------------------------------
const y = computeLotYield({
  waferSize: RECIPE.waferSize,
  dieSizeMm2: RECIPE.dieSizeMm2,
  defectDensityPerCm2: lot.accumulatedDefectDensityPerCm2,
  wafersPerLot: lot.wafersPerLot,
});

console.log('\n▶ Final yield (GDW geometry + Murphy model)');
console.log(`  die area            : ${y.dieAreaMm2.toFixed(1)} mm² (${y.dieAreaCm2.toFixed(3)} cm²)`);
console.log(`  gross dies / wafer  : ${y.grossDiesPerWafer}`);
console.log(`  gross dies / lot    : ${y.totalGrossDies} (${lot.wafersPerLot} wafers)`);
console.log(`  defect density D0   : ${y.defectDensityPerCm2.toFixed(4)} defects/cm²`);
console.log(`  Murphy yield        : ${(y.yieldFraction * 100).toFixed(1)}%`);
console.log(`  good dies / wafer   : ~${y.expectedGoodDiesPerWafer.toFixed(1)}`);
console.log(`  NET GOOD DIES (lot) : ${y.netGoodDies}`);
console.log(`  scrapped dice       : ${y.totalGrossDies - y.netGoodDies}`);

// --- 4. Flagship showroom machines ------------------------------------------
console.log('\n▶ Flagship advanced-node machines (future recipes)');
for (const m of [ASML_TWINSCAN_NXT_2000I, LAM_RESEARCH_KIYO_FX]) {
  console.log(
    `  ${m.brand} ${m.modelName}: ${m.processType}, ` +
      `${m.supportedNodes.mostAdvancedNm}–${m.supportedNodes.mostMatureNm}nm, ` +
      `${m.throughputWph} wph, ${m.powerConsumptionKw} kW, health ${m.maintenance.healthPercent}%`,
  );
}
console.log(`\n${rule('═')}\n`);
