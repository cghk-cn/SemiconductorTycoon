/**
 * Semiconductor Tycoon — Step 3 integration simulation: the economy.
 *
 * Builds a small 180nm GPU fab, takes a five-lot order from a Tier-1 client
 * through the whole economic loop, and prints a delivery + financial report:
 *
 *   1. The market quotes a contract (dynamic price from the live cycle).
 *   2. The player accepts it and commits the tool base (CapEX).
 *   3. Five 25-wafer 180nm GPU lots are produced through the Step 2 factory.
 *   4. Materials, backend and per-day power/OpEX flow into the ledger.
 *   5. The lots are delivered and the contract is settled: revenue, penalties,
 *      shipment grade and the client's reputation all move.
 *
 * Run: node scripts/economySim.ts
 */

import {
  ComponentCategory,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import { createProcessStep, createProductRecipe, type MaterialRequirement } from '../src/domain/recipe.ts';
import { createWaferLot } from '../src/domain/waferLot.ts';
import { computeLotYield, type LotYieldResult } from '../src/domain/yield.ts';
import { ASML_PAS5500_550, LAM_TCP_9400 } from '../src/samples/sampleEquipment.ts';
import {
  createCleanroomZone,
  createFactory,
  createMachineInstance,
  factoryTick,
  releaseLot,
  SchedulingPolicy,
  type Factory,
} from '../src/factory/index.ts';
import {
  ClientTier,
  ContractBoard,
  FinancialSystem,
  MarketEnvironment,
  SettlementEngine,
  ClientBook,
  createClient,
  generateContract,
  priceContract,
  type Contract,
  type DemandTemplate,
  type LotDelivery,
  type MaterialCostInput,
  type MaterialCostResult,
} from '../src/economy/index.ts';

// ---------------------------------------------------------------------------
// The product: a 180nm GPU on a KrF litho -> plasma-etch core recipe
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
    name: 'Quartz Photomask Reticle (poly gate, amortised)',
    category: MaterialCategory.PHOTO_MASK,
    quantityPerWafer: 0.04,
    unit: 'set',
  },
  {
    materialId: 'POLY_SI',
    name: 'Undoped Polysilicon (SiH4 CVD)',
    category: MaterialCategory.CVD_PRECURSOR,
    quantityPerWafer: 0.6,
    unit: 'g',
  },
  {
    materialId: 'TARGET_ALUMINUM',
    name: 'Al-Cu Sputtering Target (99.999%)',
    category: MaterialCategory.TARGET_METAL,
    quantityPerWafer: 1.1,
    unit: 'g',
  },
];

/** Unit prices the fab pays per unit of material (USD). */
const MATERIAL_PRICES: Record<string, number> = {
  WAFER_SI_200: 88,
  PHOTORESIST_KRF: 0.92,
  MASK_RETICLE: 1_450,
  POLY_SI: 7.4,
  TARGET_ALUMINUM: 5.1,
};

const GPU_RECIPE = createProductRecipe({
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

/** The five-lot order the client places. */
const LOT_COUNT = 5;
const WAFERS_PER_LOT = 25;
const DIE_SIZE_MM2 = 140;

/** Backend (assembly / test / freight) cost per good die, USD. */
const BACKEND_USD_PER_DIE = 0.42;

/** Upper bound on factory ticks (1 minute each) — the fab cannot run forever. */
const MAX_TICKS = 2_000;

// ---------------------------------------------------------------------------
// Scenario constants
// ---------------------------------------------------------------------------

/** Deterministic settlement seed — every run must produce identical output. */
const SETTLEMENT_SEED = 4242;

/** Market / demand description used to seed the deterministic market environment. */
const MARKET_SCENARIO = {
  baseDiePriceUsd: { '180nm': 1.6 } as Partial<Record<TechnologyNode, number>>,
  demandIndex: 1.05,
  capacityIndex: 0.98,
  customerSatisfaction: 0.9,
};

/** The buyer: a Tier-1 consumer GPU vendor. */
const CLIENT_SPEC = {
  id: 'CL-GPU-001',
  name: 'Northwind Silicon (GPU Division)',
  tier: ClientTier.TIER1,
  defaultPaymentDays: 30,
  defaultCreditLimitUsd: 2_500_000,
  defaultLoyalty: 0.72,
  defaultSatisfaction: 0.78,
};

/** Contract shape: five 25-wafer lots of the 180nm GPU product. */
const CONTRACT_SPEC = {
  contractId: 'CTR-2026-0001',
  productRecipeId: GPU_RECIPE.recipeId,
  productName: GPU_RECIPE.productName,
  waferSize: WaferSize.WAFER_200MM,
  targetNode: TechnologyNode.NM_180,
  lotCount: LOT_COUNT,
  wafersPerLot: WAFERS_PER_LOT,
  dieSizeMm2: DIE_SIZE_MM2,
  desiredDeliveryDate: '2026-03-30',
  customerNotes:
    'Five-lot pilot ramp of the 180nm GPU for the console co-design. Tight schedule, hard quality gate.',
  terms: {
    paymentTermsDays: 30,
    penaltyRatePerDay: 0.012,
    maxPenaltyCap: 0.15,
    lateBonusRate: 0.008,
    minQualityGrade: 'A' as const,
  },
};

// ---------------------------------------------------------------------------
// Build the fab: two cleanroom bays, one KrF litho scanner, one plasma etcher
// ---------------------------------------------------------------------------

const LITHO_BAY = createCleanroomZone({
  zoneId: 'ZONE-LITHO',
  name: 'ISO Class 3 Litho Bay',
  isoClass: 3,
  ambientDefectRatePerCm2: 0.003,
  temperatureC: 22,
  relativeHumidityPercent: 45,
  vibrationScore: 3,
});

const ETCH_BAY = createCleanroomZone({
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
  zoneId: LITHO_BAY.zoneId,
});

const etcher = createMachineInstance({
  id: 'MC-ETCH-01',
  equipmentSpec: LAM_TCP_9400,
  zoneId: ETCH_BAY.zoneId,
});

const factory: Factory = createFactory({
  machines: [litho, etcher],
  zones: [LITHO_BAY, ETCH_BAY],
  recipes: [GPU_RECIPE],
  options: {
    policy: SchedulingPolicy.FIFO,
    tickMinutes: 1,
    wearPerMinute: 0.02,
    breakdownProbabilityPerTick: 0, // deterministic: no random faults
    breakdownHealthThresholdPercent: 8,
    rngSeed: 42,
    // No Q-time constraints for this deterministic delivery run; every lot
    // must complete so the five-lot contract can be fulfilled.
    qtimeRules: [],
  },
});

// ---------------------------------------------------------------------------
// Economy wiring: financials, market, client, contract board
// ---------------------------------------------------------------------------

const financials = new FinancialSystem({
  startingCashUsd: 50_000_000,
  usdPerKwh: 0.08,
  facilityOpexUsdPerDay: 120_000,
  laborUsdPerDay: 4_500,
});

const market = new MarketEnvironment({
  seed: SETTLEMENT_SEED,
  baseDiePriceUsd: MARKET_SCENARIO.baseDiePriceUsd,
});

const client = createClient(CLIENT_SPEC);
const clientBook = new ClientBook([client]);
const board = new ContractBoard();

// Capitalise the tool base as CapEX on day 0.
const lithoPowerDrawFactor = (ASML_PAS5500_550.powerConsumptionKw * 24) / 2_880;
const etchPowerDrawFactor = (LAM_TCP_9400.powerConsumptionKw * 24) / 2_880;
financials.capitalise({
  id: 'EQ-LITHO-01',
  name: 'ASML PAS 5500/550 KrF Scanner',
  costUsd: ASML_PAS5500_550.priceUsd!,
  acquiredDay: 0,
  powerDrawFactor: lithoPowerDrawFactor,
  staffingFactor: 1,
});
financials.capitalise({
  id: 'EQ-ETCH-01',
  name: 'Lam Research TCP 9400',
  costUsd: LAM_TCP_9400.priceUsd!,
  acquiredDay: 0,
  powerDrawFactor: etchPowerDrawFactor,
  staffingFactor: 1,
});

// Price and issue the contract, then accept it and start production.
const template: DemandTemplate = {
  componentCategory: ComponentCategory.GPU,
  targetNode: TechnologyNode.NM_180,
  wafersPerLot: WAFERS_PER_LOT,
  lotCount: LOT_COUNT,
  leadTimeDays: 10,
  minAcceptableYield: 0.60,
  maxDefectDensityPerCm2: 0.5,
  qualityWeight: 0.5,
};

const contract = generateContract({
  market,
  client,
  template,
  dieSizeMm2: DIE_SIZE_MM2,
  waferSize: WaferSize.WAFER_200MM,
  issuedDay: market.currentDay,
  contractId: CONTRACT_SPEC.contractId,
});
const quote = priceContract(market, client, contract.demand);
board.offer(contract);
board.accept(contract.id);
board.startProduction(contract.id);

const reputationBefore = clientBook.reputationOf(client.id);

// ---------------------------------------------------------------------------
// Release the five lots and run the factory to completion
// ---------------------------------------------------------------------------

for (let i = 0; i < LOT_COUNT; i += 1) {
  releaseLot(
    factory,
    createWaferLot({
      lotId: `LOT-GPU-${String(i + 1).padStart(4, '0')}`,
      recipeId: GPU_RECIPE.recipeId,
      waferSize: WaferSize.WAFER_200MM,
      targetNode: TechnologyNode.NM_180,
      wafersPerLot: WAFERS_PER_LOT,
    }),
    i + 1,
  );
}

interface LotCost {
  lotId: string;
  yieldResult: LotYieldResult;
  materials: MaterialCostResult;
  backendUsd: number;
  shipDay: number;
}

const lotCosts: LotCost[] = [];
const completedIds = new Set<string>();
let lastChargedDay = -1;
let totalPowerUsd = 0;
let totalOpexUsd = 0;
let totalDepreciationUsd = 0;

function chargeCalendarDay(day: number): void {
  totalPowerUsd += financials.chargePower(day);
  totalOpexUsd += financials.chargeOpex(day);
  totalDepreciationUsd += financials.accrueDepreciation(day);
}

let ticks = 0;
while (lotCosts.length < LOT_COUNT && ticks < MAX_TICKS) {
  factoryTick(factory);
  ticks += 1;

  const day = Math.floor(factory.now / 1440);
  while (day > lastChargedDay) {
    lastChargedDay += 1;
    chargeCalendarDay(lastChargedDay);
  }

  for (const fl of factory.completed) {
    if (completedIds.has(fl.domainLot.lotId)) continue;
    completedIds.add(fl.domainLot.lotId);

    const y = computeLotYield({
      waferSize: WaferSize.WAFER_200MM,
      dieSizeMm2: DIE_SIZE_MM2,
      defectDensityPerCm2: fl.domainLot.accumulatedDefectDensityPerCm2,
      wafersPerLot: fl.domainLot.wafersPerLot,
    });

    const matInputs: MaterialCostInput[] = GPU_MATERIALS.map((m) => ({
      materialId: m.materialId,
      name: m.name,
      unitPriceUsd: MATERIAL_PRICES[m.materialId] ?? 0,
      quantityPerWafer: m.quantityPerWafer,
      wafersPerLot: fl.domainLot.wafersPerLot,
    }));
    const materials = financials.chargeMaterials(fl.domainLot.lotId, matInputs, day);
    const backendUsd = y.netGoodDies * BACKEND_USD_PER_DIE;
    financials.chargeBackend(fl.domainLot.lotId, backendUsd, day);

    lotCosts.push({ lotId: fl.domainLot.lotId, yieldResult: y, materials, backendUsd, shipDay: day });
    board.recordDelivery(contract.id, fl.domainLot.lotId, y.netGoodDies, day);
  }
}

if (lotCosts.length < LOT_COUNT) {
  throw new Error(`Production incomplete: ${lotCosts.length}/${LOT_COUNT} lots after ${MAX_TICKS} ticks`);
}

// ---------------------------------------------------------------------------
// Deliver and settle
// ---------------------------------------------------------------------------

const deliveries: LotDelivery[] = lotCosts.map((lc) => ({
  lotId: lc.lotId,
  quality: {
    goodDies: lc.yieldResult.netGoodDies,
    totalDies: lc.yieldResult.totalGrossDies,
    yieldFraction: lc.yieldResult.yieldFraction,
    defectDensityPerCm2: lc.yieldResult.defectDensityPerCm2,
  },
  shipDay: lc.shipDay,
}));

const settlement = new SettlementEngine(financials, clientBook, market, {
  collectionRate: 1,
  allowDefault: false,
}, SETTLEMENT_SEED);

const result = settlement.settle(board, contract.id, deliveries);

const fullyDelivered =
  result.deliveredDies >= result.requiredDies && result.qualityPassed && result.onTime;
if (fullyDelivered) {
  board.settle(contract.id);
} else {
  board.breach(contract.id);
}

const reputationAfter = clientBook.reputationOf(client.id);
const income = financials.incomeStatement();
const balance = financials.balanceSheet();

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const rule = (ch = '═', n = 72): string => ch.repeat(n);

console.log(rule());
console.log(' SEMICONDUCTOR TYCOON — Step 3: Economy Integration');
console.log(rule());
console.log(` Contract : ${contract.id} — ${GPU_RECIPE.productName}`);
console.log(` Client   : ${client.name} (${client.tier})`);
console.log(` Quote    : $${quote.pricePerDieUsd.toFixed(4)}/die × ${contract.demand.requiredGoodDies} dies = $${quote.totalValueUsd.toLocaleString()}`);
console.log(` Market   : phase ${market.currentPhase}, day ${market.currentDay}`);
console.log();

// Per-lot results
console.log('▶ Per-lot production');
for (const lc of lotCosts) {
  const scrap = lc.yieldResult.totalGrossDies - lc.yieldResult.netGoodDies;
  console.log(
    `  ${lc.lotId}: yield ${(lc.yieldResult.yieldFraction * 100).toFixed(2)}%  ` +
      `good ${lc.yieldResult.netGoodDies} / gross ${lc.yieldResult.totalGrossDies}  scrap ${scrap}  ` +
      `D0 ${lc.yieldResult.defectDensityPerCm2.toFixed(4)}/cm²  ` +
      `materials $${lc.materials.totalUsd.toLocaleString()}  backend $${lc.backendUsd.toLocaleString()}  ship day ${lc.shipDay}`,
  );
}

// Aggregates
const totalGross = lotCosts.reduce((s, lc) => s + lc.yieldResult.totalGrossDies, 0);
const totalGood = lotCosts.reduce((s, lc) => s + lc.yieldResult.netGoodDies, 0);
const totalScrap = totalGross - totalGood;
const totalMaterials = lotCosts.reduce((s, lc) => s + lc.materials.totalUsd, 0);
const totalBackend = lotCosts.reduce((s, lc) => s + lc.backendUsd, 0);
const avgYield = totalGood / Math.max(totalGross, 1);
const capex = financials.grossAssetsUsd;
const netAssets = financials.netAssetsUsd;

console.log();
console.log('▶ Aggregate production');
console.log(`  lots        : ${lotCosts.length} / ${LOT_COUNT}`);
console.log(`  gross dies  : ${totalGross}`);
console.log(`  good dies   : ${totalGood}`);
console.log(`  scrap dies  : ${totalScrap}`);
console.log(`  avg yield   : ${(avgYield * 100).toFixed(2)}%`);
console.log(`  materials   : $${totalMaterials.toLocaleString()}`);
console.log(`  backend     : $${totalBackend.toLocaleString()}`);
console.log(`  CapEX       : $${capex.toLocaleString()}  (net book value $${netAssets.toLocaleString()})`);
console.log(`  power       : $${totalPowerUsd.toLocaleString()}`);
console.log(`  facility/labor: $${totalOpexUsd.toLocaleString()}`);
console.log(`  depreciation: $${totalDepreciationUsd.toLocaleString()}`);
console.log(`  ticks elapsed: ${ticks} (${factory.now} min)`);

console.log();
console.log('▶ Financials');
console.log(`  revenue (gross payment): $${income.revenueUsd.toLocaleString()}`);
console.log(`  materials              : $${income.materialCostUsd.toLocaleString()}`);
console.log(`  backend/test           : $${income.backendCostUsd.toLocaleString()}`);
console.log(`  opex (facility+labor)  : $${totalOpexUsd.toLocaleString()}`);
console.log(`  power                  : $${totalPowerUsd.toLocaleString()}`);
console.log(`  depreciation           : $${income.depreciationUsd.toLocaleString()}`);
console.log(`  penalties              : $${income.penaltyUsd.toLocaleString()}`);
console.log(`  net profit             : $${income.netProfitUsd.toLocaleString()}  (margin ${income.marginPercent.toFixed(1)}%)`);
console.log(`  cash                   : $${balance.cashUsd.toLocaleString()}`);

console.log();
console.log('▶ Settlement');
console.log(`  grade          : ${result.grade}`);
console.log(`  on time        : ${result.onTime}`);
console.log(`  quality passed : ${result.qualityPassed}`);
console.log(`  days late      : ${result.daysLate}`);
console.log(`  delivered dies : ${result.deliveredDies} / ${result.requiredDies}`);
console.log(`  contract value : $${result.contractValueUsd.toLocaleString()}`);
console.log(`  delivered value: $${result.deliveredValueUsd.toLocaleString()}`);
console.log(`  penalties      : $${result.penaltyUsd.toLocaleString()}`);
console.log(`  net payment    : $${result.netPaymentUsd.toLocaleString()}`);
console.log(`  final status   : ${result.finalStatus}`);
console.log(`  reputation     : ${reputationBefore} → ${reputationAfter} (delta ${result.reputationDelta})`);
for (const note of result.notes) {
  console.log(`  - ${note}`);
}
console.log(rule());
