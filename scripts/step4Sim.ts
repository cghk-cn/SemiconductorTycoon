/**
 * Semiconductor Tycoon — Step 4 integration verification: Advanced Tech &
 * Data Center Module.
 *
 * Simulates a player who:
 *   1. Researches up the tech tree to unlock A16 (GAA/CFET, High-NA EUV).
 *   2. Installs a High-NA EUV scanner and a hybrid-bonding CoWoS line.
 *   3. Fabricates AI GPU dies at A16, then CoWoS-packages them with HBM4.
 *   4. Deploys the AI accelerator cards into an immersion-cooled (PUE 1.08)
 *      data center and rents out token/hour compute for 24 hours.
 *   5. Prints a full financial + data-center report.
 *
 * Deterministic (seed 4242). Run: node scripts/step4Sim.ts
 */

import {
  ComponentCategory,
  PackagingType,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import { computeLotYield } from '../src/domain/yield.ts';
import { NODE_SPECS } from '../src/domain/nodeSpecs.ts';
import { waferDiameterMm } from '../src/domain/constants.ts';
import { createDefaultTree, AdvancedTechTree } from '../src/advanced/techTree.ts';
import {
  AdvancedPackagingLine,
  coWoSBom,
  type PackagingResult,
} from '../src/advanced/packaging.ts';
import {
  DataCenterFacility,
  CoolingTechnology,
  NetworkInterconnect,
  PUETuningEngine,
  ComputeRevenueStream,
  type ComputeRevenueResult,
} from '../src/advanced/dataCenter.ts';
import { FinancialSystem, LedgerCategory } from '../src/economy/index.ts';
import {
  ASML_EXE_5000_HIGH_NA_EUV,
  BESI_XFLOW_HYBRID_BONDER,
} from '../src/samples/sampleEquipment.ts';

// ---------------------------------------------------------------------------
// Scenario constants
// ---------------------------------------------------------------------------

/** Deterministic seed shared with the settlement engine. */
const SEED = 4242;

/** Starting cash (USD). */
const STARTING_CASH_USD = 2_000_000_000;

/** AI GPU die footprint (mm²) produced at A16. */
const GPU_DIE_SIZE_MM2 = 650;

/** Number of 300mm lots to run at A16. */
const LOT_COUNT = 4;
const WAFERS_PER_LOT = 25;

/** HBM4 stacks required per CoWoS package (from the BOM). */
const HBM_PER_PACKAGE = 6;

/** Packaging economics. */
const PACKAGING_FAILURE_RATE = 0.03;      // 3% of CoWoS packages fail
const DIE_DAMAGE_RATE_ON_FAILURE = 0.50;  // half of failures kill the GPU die
const COST_PER_PACKAGE_USD = 800;

/** Data center spec. */
const DC_RACK_CAPACITY = 600;
const DC_CARDS_PER_RACK = 8;
const DC_IT_POWER_KW_PER_RACK = 40; // 5 kW per accelerator card
const DC_COST_USD = 5_000_000;

/** Compute revenue knobs. */
const TOKENS_PER_CARD_PER_HOUR = 2_000_000;
const PRICE_PER_TOKEN_USD = 0.0000005; // $0.50 per 1M tokens
const USD_PER_KWH = 0.08;
const RUN_HOURS = 24;

const rule = (ch = '═', n = 72): string => ch.repeat(n);

// ---------------------------------------------------------------------------
// 1. Tech tree research: unlock 3nm -> 2nm -> A16
// ---------------------------------------------------------------------------

const financials = new FinancialSystem({
  startingCashUsd: STARTING_CASH_USD,
  usdPerKwh: USD_PER_KWH,
});

const tree = createDefaultTree();
let cash = financials.cashUsd;

console.log(rule());
console.log(' STEP 4 — ADVANCED TECH & DATA CENTER INTEGRATION');
console.log(rule());
console.log(` Starting cash : $${STARTING_CASH_USD.toLocaleString()}`);
console.log();

const researchChain: TechnologyNode[] = ['3nm', '2nm', 'A16'];
let day = 0;
for (const node of researchChain) {
  const req = tree.requirementFor(node)!;
  const before = tree.isUnlocked(node);
  if (before) {
    console.log(` [Research] ${node} already unlocked, skipping.`);
    continue;
  }
  const outcome = tree.unlock(node, day, cash);
  cash = outcome.remainingCashUsd;
  if (outcome.result.unlocked) {
    console.log(
      ` [Research] ${node} (${req.processFamily}) unlocked — ` +
        `$${req.researchCostUsd.toLocaleString()}, ${req.researchTimeDays} days.`,
    );
  } else {
    throw new Error(
      `Failed to unlock ${node}: ${outcome.result.reason}`,
    );
  }
  day += 1;
}

console.log(` Cash after research: $${cash.toLocaleString()}`);
console.log(` Unlocked nodes: ${tree.unlockedNodes.join(', ')}`);
console.log();

// Verify A16 is manufacturable with the High-NA EUV scanner installed.
const advancedTools = [ASML_EXE_5000_HIGH_NA_EUV, BESI_XFLOW_HYBRID_BONDER];
const canA16 = tree.canManufacture('A16', advancedTools);
console.log(` Can manufacture A16 with High-NA EUV + hybrid bonder: ${canA16}`);
if (!canA16) throw new Error('A16 not manufacturable — check tool capabilities');
// ---------------------------------------------------------------------------
// Post research costs to the ledger and capitalise the tool base (CapEX)
// ---------------------------------------------------------------------------

for (const node of researchChain) {
  const cost = tree.requirementFor(node)!.researchCostUsd;
  financials.post(
    LedgerCategory.FINANCING,
    `Research: ${node}`,
    -cost,
    day,
  );
}

const euvPowerFactor = (ASML_EXE_5000_HIGH_NA_EUV.powerConsumptionKw * 24) / 2_880;
const bonderPowerFactor = (BESI_XFLOW_HYBRID_BONDER.powerConsumptionKw * 24) / 2_880;
financials.capitalise({
  id: 'EQ-LITHO-ASML-EXE5000',
  name: ASML_EXE_5000_HIGH_NA_EUV.modelName,
  costUsd: ASML_EXE_5000_HIGH_NA_EUV.priceUsd!,
  acquiredDay: day,
  powerDrawFactor: euvPowerFactor,
  staffingFactor: 1,
});
financials.capitalise({
  id: 'EQ-PACK-BESI-XFLOW',
  name: BESI_XFLOW_HYBRID_BONDER.modelName,
  costUsd: BESI_XFLOW_HYBRID_BONDER.priceUsd!,
  acquiredDay: day,
  powerDrawFactor: bonderPowerFactor,
  staffingFactor: 1,
});

console.log();
console.log(` Cash after research+CapEX: $${financials.cashUsd.toLocaleString()}`);
console.log(` CapEX deployed           : $${financials.grossAssetsUsd.toLocaleString()}`);

// ---------------------------------------------------------------------------
// 2. Fabricate AI GPU dies at A16 (100 wafers -> net good dies)
// ---------------------------------------------------------------------------

const a16Spec = NODE_SPECS['A16'];

let totalGpuDies = 0;
let totalGrossDies = 0;
for (let i = 0; i < LOT_COUNT; i += 1) {
  const y = computeLotYield({
    waferSize: WaferSize.WAFER_300MM,
    dieSizeMm2: GPU_DIE_SIZE_MM2,
    defectDensityPerCm2: a16Spec.matureDefectDensityPerCm2,
    wafersPerLot: WAFERS_PER_LOT,
  });
  totalGpuDies += y.netGoodDies;
  totalGrossDies += y.totalGrossDies;
  console.log(
    ` [Fab] Lot ${String(i + 1).padStart(2, '0')}: yield ${(y.yieldFraction * 100).toFixed(2)}%  ` +
      `good ${y.netGoodDies} / gross ${y.totalGrossDies}  D0 ${a16Spec.matureDefectDensityPerCm2}/cm²`,
  );
}
console.log(
  ` [Fab] Total: ${totalGrossDies} gross dies, ${totalGpuDies} good A16 GPU dies`,
);

// ---------------------------------------------------------------------------
// 3. CoWoS advanced packaging: GPU die + HBM4 + interposer -> AI accelerator card
// ---------------------------------------------------------------------------

const bom = coWoSBom();
const line = new AdvancedPackagingLine({
  lineId: 'PKG-COWOS-01',
  name: 'CoWoS 2.5D Packaging Line (HBM4 + Silicon Interposer)',
  packagingType: PackagingType.INTERPOSER_2_5D_COWOS,
  equipment: BESI_XFLOW_HYBRID_BONDER,
  throughputPackagesPerDay: 2_000,
  baseFailureRate: PACKAGING_FAILURE_RATE,
  dieDamageRateOnFailure: DIE_DAMAGE_RATE_ON_FAILURE,
  costPerPackageUsd: COST_PER_PACKAGE_USD,
});

const pkgInput = {
  computeDies: totalGpuDies,
  hbmStacks: totalGpuDies * HBM_PER_PACKAGE,
  interposers: totalGpuDies,
  substrates: totalGpuDies,
};
const pkgResult = line.assemble(pkgInput);

console.log();
console.log(` [Packaging] ${line.spec.name}`);
for (const note of pkgResult.notes) {
  console.log(`   - ${note}`);
}
console.log(
  `   Good AI accelerator cards: ${pkgResult.goodPackages}  ` +
    `(GPU dies lost to packaging failure: ${pkgResult.damagedComputeDies})`,
);

const acceleratorCards = pkgResult.goodPackages;

// ---------------------------------------------------------------------------
// 4. Data center: immersion cooling (PUE 1.08) + CPO network
// ---------------------------------------------------------------------------

const dc = new DataCenterFacility({
  facilityId: 'DC-AI-01',
  name: 'AI Green Data Center — Immersion Cooled',
  cooling: CoolingTechnology.IMMERSION_COOLING,
  network: NetworkInterconnect.CPO,
  rackCapacity: DC_RACK_CAPACITY,
  cardsPerRack: DC_CARDS_PER_RACK,
  itPowerKwPerRack: DC_IT_POWER_KW_PER_RACK,
  usefulLifeDays: 1_460,
  costUsd: DC_COST_USD,
});
financials.capitalise({
  id: 'DC-AI-01',
  name: dc.spec.name,
  costUsd: DC_COST_USD,
  acquiredDay: day,
  powerDrawFactor: 1.0,
  staffingFactor: 1,
});

let cardsRemaining = acceleratorCards;
let rackIndex = 0;
while (cardsRemaining > 0) {
  const cardsThisRack = Math.min(DC_CARDS_PER_RACK, cardsRemaining);
  const result = dc.deployRack(`RACK-${String(++rackIndex).padStart(3, '0')}`, cardsThisRack, day);
  if (!result.ok) throw new Error(`Rack deploy failed: ${result.reason}`);
  cardsRemaining -= cardsThisRack;
}

console.log();
console.log(` [Data Center] ${dc.spec.name}`);
console.log(`   Cooling : ${dc.spec.cooling}  Network : ${dc.spec.network}`);
console.log(`   PUE     : ${dc.pue.toFixed(4)}  (immersion cooling ${PUETuningEngine.pueForCooling(dc.spec.cooling).toFixed(2)} × network ${PUETuningEngine.networkFactor(dc.spec.network)})`);
console.log(`   Racks   : ${dc.deployedRacks} / ${DC_RACK_CAPACITY}  Cards : ${acceleratorCards}`);
const snap = dc.snapshot();
console.log(`   IT power        : ${snap.totalItPowerKw.toFixed(1)} kW`);
console.log(`   Cooling overhead: ${snap.coolingPowerKw.toFixed(1)} kW`);
console.log(`   Facility power  : ${snap.totalFacilityPowerKw.toFixed(1)} kW`);

// ---------------------------------------------------------------------------
// 5. Compute revenue: rent tokens/hour for 24 hours
// ---------------------------------------------------------------------------

const compute = new ComputeRevenueStream(dc, TOKENS_PER_CARD_PER_HOUR, PRICE_PER_TOKEN_USD, USD_PER_KWH);
const rev = compute.run(RUN_HOURS);

console.log();
console.log(` [Compute Revenue] ${RUN_HOURS}h token/hour rental`);
console.log(`   Cards       : ${rev.totalCards}`);
console.log(`   Tokens      : ${rev.tokensProduced.toLocaleString()}`);
console.log(`   Revenue     : $${rev.revenueUsd.toLocaleString()}`);
console.log(`   IT power    : ${rev.itPowerKw.toFixed(1)} kW  PUE ${rev.pue.toFixed(4)}`);
console.log(`   Facility P  : ${rev.facilityPowerKw.toFixed(1)} kW`);
console.log(`   Power cost  : $${rev.powerCostUsd.toFixed(2)}`);
console.log(`   Depreciation: $${rev.depreciationUsd.toFixed(2)}`);
console.log(`   Net (24h)   : $${rev.netUsd.toFixed(2)}  (margin ${rev.marginPercent.toFixed(1)}%)`);

// ---------------------------------------------------------------------------
// Settle economics into the ledger: packaging, power, revenue, depreciation
// ---------------------------------------------------------------------------

financials.chargeMaterials(
  'COWOSBATCH',
  [
    {
      materialId: 'COWOSS_CONSUMABLES',
      name: 'CoWoS interposer / substrate / HBM consumables',
      unitPriceUsd: COST_PER_PACKAGE_USD,
      quantityPerWafer: pkgResult.packagesAttempted,
      wafersPerLot: 1,
    },
  ],
  day,
);
financials.post(LedgerCategory.POWER, `Data center power (${RUN_HOURS}h)`, -rev.powerCostUsd, day);
financials.recogniseRevenue('COMPUTE-24H', rev.revenueUsd, day);
financials.post(LedgerCategory.DEPRECIATION, 'AI accelerator depreciation (24h)', -rev.depreciationUsd, day);

const balance = financials.balanceSheet();
const operationalNet = rev.revenueUsd - rev.powerCostUsd - rev.depreciationUsd;
const operationalMargin = rev.revenueUsd > 0 ? (operationalNet / rev.revenueUsd) * 100 : 0;
const paybackDays =
  operationalNet > 0 ? Math.ceil(pkgResult.packagingCostUsd / operationalNet) : Number.POSITIVE_INFINITY;

// ---------------------------------------------------------------------------
// Final report
// ---------------------------------------------------------------------------

console.log();
console.log(rule());
console.log(' FINANCIAL & DATA-CENTER REPORT');
console.log(rule());
console.log(` Cash              : $${balance.cashUsd.toLocaleString()}`);
console.log(` Net assets (CapEX): $${balance.netAssetsUsd.toLocaleString()}`);
console.log(` Equity            : $${balance.equityUsd.toLocaleString()}`);
console.log();
console.log(' [24h operations]');
console.log(`   Token revenue     : $${rev.revenueUsd.toLocaleString()}`);
console.log(`   Power cost        : $${rev.powerCostUsd.toFixed(2)}`);
console.log(`   Depreciation      : $${rev.depreciationUsd.toFixed(2)}`);
console.log(`   Operational net   : $${operationalNet.toFixed(2)}  (margin ${operationalMargin.toFixed(1)}%)`);
console.log();
console.log(' [Production economics]');
console.log(`   One-time packaging: $${pkgResult.packagingCostUsd.toLocaleString()} (${pkgResult.packagesAttempted} cards)`);
console.log(`   Packaging payback : ${paybackDays} days at current operational net`);
console.log();
console.log(` Yield summary   : ${totalGpuDies} good GPU dies / ${totalGrossDies} gross`);
console.log(` Packaged cards  : ${acceleratorCards} (failed ${pkgResult.failedPackages} packages)`);
console.log(` Data center PUE : ${dc.pue.toFixed(4)}`);
console.log(` Facility power  : ${snap.totalFacilityPowerKw.toFixed(1)} kW (IT ${snap.totalItPowerKw.toFixed(1)} kW)`);
console.log(` Tokens/hour     : ${(TOKENS_PER_CARD_PER_HOUR * acceleratorCards).toLocaleString()}`);
console.log(rule());

