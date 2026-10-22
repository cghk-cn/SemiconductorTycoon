/**
 * Semiconductor Tycoon — Step 2 integration simulation.
 *
 * Builds a small pilot fab with exactly two tools (1 ASML DUV KrF scanner + 1
 * Lam Research dry etcher), releases one 25-wafer 180nm GPU lot, and advances
 * the factory 100 ticks. The event log shows the lot queueing, dispatching,
 * processing, handing off between machines, and decaying machine health — until
 * the litho→etch core process completes. A forced fault + repair then
 * demonstrates the maintenance loop.
 *
 * Run: node scripts/factorySim.ts
 */

import {
  ComponentCategory,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import {
  createProcessStep,
  createProductRecipe,
  type MaterialRequirement,
} from '../src/domain/recipe.ts';
import { createWaferLot } from '../src/domain/waferLot.ts';
import { computeLotYield } from '../src/domain/yield.ts';
import { ASML_PAS5500_550, LAM_TCP_9400 } from '../src/samples/sampleEquipment.ts';
import {
  createCleanroomZone,
  createFactory,
  createMachineInstance,
  dispatchRepairAction,
  factoryTick,
  forceBreakdownAction,
  releaseLot,
  SchedulingPolicy,
  type Factory,
  type FactoryEvent,
} from '../src/factory/index.ts';

const rule = (ch = '═', n = 72): string => ch.repeat(n);

// ---------------------------------------------------------------------------
// A focused 180nm GPU litho→etch core recipe (matches the 2-tool pilot line)
// ---------------------------------------------------------------------------

const GPU_MATERIALS: MaterialRequirement[] = [
  {
    materialId: 'WAFER_SI_200',
    name: '200mm P-type CZ Silicon Wafer',
    category: MaterialCategory.WAFER_SUBSTRATE,
    quantityPerWafer: 1,
    unit: 'pcs',
  },
  {
    materialId: 'PHOTORESIST_KRF',
    name: 'KrF 248nm Positive Photoresist',
    category: MaterialCategory.PHOTORESIST,
    quantityPerWafer: 12,
    unit: 'ml',
  },
  {
    materialId: 'MASK_RETICLE',
    name: 'Quartz Photomask Reticle (poly gate)',
    category: MaterialCategory.PHOTO_MASK,
    quantityPerWafer: 0.04,
    unit: 'set',
  },
];

const GPU_LITHO_ETCH_RECIPE = createProductRecipe({
  recipeId: 'RCP-180NM-GPU-LITHO-ETCH',
  productName: 'Retro 180nm GPU — Litho/Etch Core',
  category: ComponentCategory.GPU,
  targetNode: TechnologyNode.NM_180,
  waferSize: WaferSize.WAFER_200MM,
  dieSizeMm2: 140,
  materials: GPU_MATERIALS,
  processSteps: [
    createProcessStep({
      stepId: 'FE_POLY_LITHO',
      name: 'Poly Gate Patterning (KrF)',
      processType: ProcessType.LITHOGRAPHY,
      maskIndex: 1,
      durationMinutes: 9.1,
      stepDefectDensityPerCm2: 0.004,
      consumesMaterialIds: ['PHOTORESIST_KRF', 'MASK_RETICLE'],
    }),
    createProcessStep({
      stepId: 'FE_POLY_ETCH',
      name: 'Polysilicon Gate Etch',
      processType: ProcessType.ETCHING,
      durationMinutes: 33.3,
      stepDefectDensityPerCm2: 0.005,
    }),
  ],
  packaging: {
    packagingType: PackagingType.BGA,
    assemblyFlowName: '200mm OSAT — Die Attach → Wire Bond → Molding → BGA → Final Test',
    companionComponents: [{ category: ComponentCategory.MLCC, minQuantityPerUnit: 6 }],
  },
});

// ---------------------------------------------------------------------------
// Build the pilot fab
// ---------------------------------------------------------------------------

const lithoBay = createCleanroomZone({
  zoneId: 'ZONE-LITHO',
  name: 'ISO Class 3 Litho Bay',
  isoClass: 3,
  ambientDefectRatePerCm2: 0.003,
  temperatureC: 22,
  relativeHumidityPercent: 45,
  vibrationScore: 3,
});

const etchBay = createCleanroomZone({
  zoneId: 'ZONE-ETCH',
  name: 'ISO Class 5 Etch Bay',
  isoClass: 5,
  ambientDefectRatePerCm2: 0.005,
  temperatureC: 23,
  relativeHumidityPercent: 48,
  vibrationScore: 8,
});

const litho = createMachineInstance({
  id: 'MC-LITHO-01',
  equipmentSpec: ASML_PAS5500_550,
  zoneId: lithoBay.zoneId,
});

const etcher = createMachineInstance({
  id: 'MC-ETCH-01',
  equipmentSpec: LAM_TCP_9400,
  zoneId: etchBay.zoneId,
  healthPercent: 88,
  wearPercent: 22,
});

// Stream every factory event live to stdout.
function printEvent(e: FactoryEvent): void {
  const t = `t=${String(e.at).padStart(5, ' ')}m`;
  const tick = `#${String(e.tick).padStart(3, ' ')}`;
  const tag = e.kind.toUpperCase().padEnd(16);
  console.log(`  ${tick} ${t} ${tag} ${e.message}`);
}

const factory: Factory = createFactory({
  machines: [litho, etcher],
  zones: [lithoBay, etchBay],
  recipes: [GPU_LITHO_ETCH_RECIPE],
  options: {
    policy: SchedulingPolicy.FIFO,
    tickMinutes: 1,
    // Accelerated so health decay is visible within a short demo run.
    wearPerMinute: 0.5,
    breakdownProbabilityPerTick: 0, // deterministic; a fault is injected below
    breakdownHealthThresholdPercent: 8,
    rngSeed: 42,
    logger: printEvent,
  },
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log(rule());
console.log(' SEMICONDUCTOR TYCOON — Step 2: Factory Simulation Engine');
console.log(rule());
console.log(` Fab        : ${factory.machines.length} machines, ${factory.zones.size} cleanroom zones`);
for (const m of factory.machines) {
  const spec = m.equipmentSpec;
  console.log(
    `   - ${m.id}: ${spec.brand} ${spec.modelName} (${spec.processType}, ${spec.throughputWph} wph, install health ${m.healthPercent.toFixed(0)}%)`,
  );
}
console.log(` Recipe     : ${GPU_LITHO_ETCH_RECIPE.productName} [${GPU_LITHO_ETCH_RECIPE.recipeId}]`);
console.log(`   steps     : ${GPU_LITHO_ETCH_RECIPE.processSteps.map((s) => s.processType).join(' → ')}`);
console.log(' Lot        : LOT-GPU-0001 (25 wafers, 180nm GPU, BGA + 6× MLCC)');
console.log(` Tick       : 1 minute × 100 ticks, policy ${factory.policy}, wear ${factory.wearPerMinute}/min\n`);

const lot = createWaferLot({
  lotId: 'LOT-GPU-0001',
  recipeId: GPU_LITHO_ETCH_RECIPE.recipeId,
  waferSize: GPU_LITHO_ETCH_RECIPE.waferSize,
  targetNode: GPU_LITHO_ETCH_RECIPE.targetNode,
});
releaseLot(factory, lot, /* priority */ 10);

console.log('\n▶ 100-tick run (event stream + 10-tick heartbeats)');
for (let t = 1; t <= 100; t += 1) {
  factoryTick(factory);

  // Player actions: inject a fault on the idle etcher, then repair it.
  if (t === 55) forceBreakdownAction(factory, 'MC-ETCH-01');
  if (t === 70) dispatchRepairAction(factory, 'MC-ETCH-01', 100, 250_000);

  if (t % 10 === 0) {
    const done = factory.completed[0];
    console.log(
      `  ... heartbeat t=${t}  litho=${litho.state.padEnd(10)} (health ${litho.healthPercent.toFixed(1)}%)  ` +
        `etch=${etcher.state.padEnd(10)} (health ${etcher.healthPercent.toFixed(1)}%)  ` +
        `lot=${done ? 'COMPLETED' : 'in-flight'}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n▶ Result');
const completed = factory.completed[0];
if (completed) {
  const d0 = completed.domainLot.accumulatedDefectDensityPerCm2;
  const y = computeLotYield({
    waferSize: GPU_LITHO_ETCH_RECIPE.waferSize,
    dieSizeMm2: GPU_LITHO_ETCH_RECIPE.dieSizeMm2,
    defectDensityPerCm2: d0,
    wafersPerLot: completed.domainLot.wafersPerLot,
  });
  console.log(`  lot ${completed.domainLot.lotId}: ${completed.domainLot.status}`);
  console.log(
    `    steps completed   : ${completed.domainLot.currentStepIndex}/${GPU_LITHO_ETCH_RECIPE.processSteps.length}`,
  );
  console.log(`    accumulated D0    : ${d0.toFixed(4)} defects/cm²`);
  console.log(
    `    Murphy yield      : ${(y.yieldFraction * 100).toFixed(1)}%  →  ${y.netGoodDies} net good dies / ${y.totalGrossDies} gross`,
  );
} else {
  console.log('  lot did NOT complete within 100 ticks');
}

console.log('\n▶ Machine end-state');
for (const m of factory.machines) {
  console.log(
    `  ${m.id}: ${m.state.padEnd(10)} health ${m.healthPercent.toFixed(1)}%  wear ${m.wearPercent.toFixed(1)}%  ` +
      `hours-since-PM ${m.hoursSinceLastPm.toFixed(2)}`,
  );
}

console.log('\n▶ Event tally');
const tally = new Map<string, number>();
for (const e of factory.events) tally.set(e.kind, (tally.get(e.kind) ?? 0) + 1);
for (const [kind, count] of [...tally.entries()].sort()) {
  console.log(`  ${kind.padEnd(16)} ${count}`);
}
console.log(`\n  completed lots: ${factory.completed.length}   scrapped lots: ${factory.scrapped.length}`);
console.log(rule());


