#!/usr/bin/env node
/****
 * Semiconductor Tycoon — Interactive Terminal Game
 *
 * Terminal-based semiconductor company simulation integrating production,
 * finance, contracts, markets, R&D (tech tree), packaging, and data centers.
 * Reuses existing domain, factory, economy, and advanced modules.
 *
 * Run: node scripts/interactiveGame.ts
 */

import * as readline from 'readline';

// ---------------------------------------------------------------------------
// Domain
// ---------------------------------------------------------------------------
import {
  ComponentCategory,
  LithoSource,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
  type TechnologyNode as TechnologyNodeType,
} from '../src/domain/enums.ts';
import {
  createProcessStep,
  createProductRecipe,
  type MaterialRequirement,
  type ProcessStep,
  type ProductRecipe,
} from '../src/domain/recipe.ts';
import { createWaferLot } from '../src/domain/waferLot.ts';
import { computeLotYield, type LotYieldResult } from '../src/domain/yield.ts';
import { createEquipment, type Equipment } from '../src/domain/equipment.ts';
import { NODE_SPECS } from '../src/domain/nodeSpecs.ts';
import { FAB_CONVENTIONS } from '../src/domain/constants.ts';

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------
import {
  createCleanroomZone,
  createFactory,
  createMachineInstance,
  factoryTick,
  releaseLot,
  SchedulingPolicy,
  type Factory,
} from '../src/factory/index.ts';

// ---------------------------------------------------------------------------
// Economy
// ---------------------------------------------------------------------------
import {
  ClientTier,
  ContractBoard,
  FinancialSystem,
  LedgerCategory,
  MarketEnvironment,
  SettlementEngine,
  ClientBook,
  createClient,
  generateContract,
  priceContract,
  type Client,
  type Contract,
  type DemandTemplate,
  type IncomeStatement,
  type BalanceSheet,
  type LotDelivery,
  type MaterialCostInput,
  type MaterialCostResult,
} from '../src/economy/index.ts';

// ---------------------------------------------------------------------------
// Advanced
// ---------------------------------------------------------------------------
import {
  AdvancedTechTree,
  type TechNodeRequirement,
} from '../src/advanced/techTree.ts';
import {
  AdvancedPackagingLine,
  type PackagingLineSpec,
  type PackagingResult,
} from '../src/advanced/packaging.ts';
import {
  DataCenterFacility,
  ComputeRevenueStream,
  type DataCenterSpec,
  type ComputeRevenueResult,
  CoolingTechnology,
  NetworkInterconnect,
} from '../src/advanced/dataCenter.ts';

// ===========================================================================
// Game state interfaces
// ===========================================================================

/** One lot released to the factory, tracked against a contract. */
interface GameLot {
  readonly lotId: string;
  readonly contractId: string;
  readonly recipeId: string;
  /** Day the lot was released. */
  readonly releaseDay: number;
  /** Day the lot completed (null if not yet). */
  readonly completedDay: number | null;
  /** Yield result (set when completed). */
  readonly yieldResult: LotYieldResult | null;
  /** Material cost (set when completed). */
  readonly materialCost: MaterialCostResult | null;
  /** Backend cost USD (set when completed). */
  readonly backendUsd: number;
  /** Whether the lot has been delivered/settled. */
  readonly delivered: boolean;
}

/** The complete mutable state of the player's semiconductor company. */
interface GameState {
  /** Game month counter (1-based). */
  month: number;
  /** Sim day counter. */
  day: number;
  /** Whether the game is over. */
  gameOver: boolean;
  /** Game over reason, if any. */
  gameOverReason: string | null;

  /** The factory (machines, zones, recipes, lots). */
  factory: Factory;
  /** Financial ledger + assets. */
  financials: FinancialSystem;
  /** Market environment (pricing, cycle phase). */
  market: MarketEnvironment;
  /** Client relationship book. */
  clientBook: ClientBook;
  /** Contract board (offers + active contracts). */
  board: ContractBoard;
  /** Technology tree (R&D unlocks). */
  techTree: AdvancedTechTree;

  /** Equipment the player owns (for CapEX and manufacturability checks). */
  ownedEquipment: Equipment[];

  /** Recipes the player has access to (registered with factory). */
  recipes: Map<string, ProductRecipe>;

  /** Unit prices the fab pays per material (USD). */
  materialPrices: Map<string, number>;

  /** Game lots in flight / completed. */
  lots: GameLot[];

  /** Optional packaging line. */
  packagingLine: AdvancedPackagingLine | null;

  /** Optional data center facility. */
  dataCenter: DataCenterFacility | null;

  /** Optional compute revenue stream. */
  computeStream: ComputeRevenueStream | null;

  /** In-progress research (null when idle). */
  currentResearch: {
    readonly node: TechnologyNodeType;
    readonly startDay: number;
    readonly daysRemaining: number;
    readonly costUsd: number;
  } | null;

  /** Cache of last income statement / balance sheet. */
  lastIncome: IncomeStatement | null;
  lastBalance: BalanceSheet | null;

  /** PRNG seed offset for market/settlement determinism. */
  seed: number;
}

// ===========================================================================
// Starting company setup
// ===========================================================================

/** Starter materials for the 180nm GPU recipe. */
const STARTER_MATERIALS: MaterialRequirement[] = [
  { materialId: 'WAFER_SI_200', name: '200mm P-type CZ Silicon Wafer', category: MaterialCategory.WAFER_SUBSTRATE, quantityPerWafer: 1, unit: 'pcs' },
  { materialId: 'PHOTORESIST_KRF', name: 'KrF 248nm Positive Photoresist', category: MaterialCategory.PHOTORESIST, quantityPerWafer: 12, unit: 'ml' },
  { materialId: 'MASK_RETICLE', name: 'Quartz Photomask Reticle Set (amortised)', category: MaterialCategory.PHOTO_MASK, quantityPerWafer: 0.04, unit: 'set' },
  { materialId: 'POLY_SI', name: 'Undoped Polysilicon (SiH4 CVD)', category: MaterialCategory.CVD_PRECURSOR, quantityPerWafer: 0.6, unit: 'g' },
  { materialId: 'TARGET_ALUMINUM', name: 'Al-Cu Sputtering Target (99.999%)', category: MaterialCategory.TARGET_METAL, quantityPerWafer: 1.1, unit: 'g' },
  { materialId: 'CMP_SLURRY', name: 'Alumina / Silica CMP Slurry', category: MaterialCategory.CMP_SLURRY, quantityPerWafer: 400, unit: 'ml' },
  { materialId: 'IMPLANT_N_PLUS', name: 'N+ Dopant Gas (PH3 / AsH3)', category: MaterialCategory.IMPLANT_DOPANT, quantityPerWafer: 0.4, unit: 'std-L' },
];

/** Unit prices the fab pays per unit of material (USD). */
const STARTER_MATERIAL_PRICES: Record<string, number> = {
  WAFER_SI_200: 88,
  PHOTORESIST_KRF: 0.92,
  MASK_RETICLE: 1450,
  POLY_SI: 7.4,
  TARGET_ALUMINUM: 5.1,
  CMP_SLURRY: 2.5,
  IMPLANT_N_PLUS: 12.0,
};

/** Build the starter 180nm toolset (one tool per process type). */
function createStarterToolset(): Equipment[] {
  return [
    createEquipment({
      id: 'EQ-LITHO-01', brand: 'ASML', modelName: 'PAS 5500/550 KrF Scanner',
      processType: ProcessType.LITHOGRAPHY, lithoSource: LithoSource.KRF,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 110,
      baseDefectRatePerCm2: 0.006, powerConsumptionKw: 100, priceUsd: 12000000,
      maintenance: { healthPercent: 95, wearPercent: 10, hoursSinceLastPm: 200 },
    }),
    createEquipment({
      id: 'EQ-ETCH-01', brand: 'Lam Research', modelName: 'TCP 9400 Etcher',
      processType: ProcessType.ETCHING,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 140,
      baseDefectRatePerCm2: 0.007, powerConsumptionKw: 45, priceUsd: 8000000,
      maintenance: { healthPercent: 94, wearPercent: 12, hoursSinceLastPm: 180 },
    }),
    createEquipment({
      id: 'EQ-DEP-01', brand: 'Applied Materials', modelName: 'Centura CVD',
      processType: ProcessType.DEPOSITION,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 200,
      baseDefectRatePerCm2: 0.005, powerConsumptionKw: 60, priceUsd: 6000000,
      maintenance: { healthPercent: 93, wearPercent: 15, hoursSinceLastPm: 220 },
    }),
    createEquipment({
      id: 'EQ-CMP-01', brand: 'Applied Materials', modelName: 'Mirra CMP',
      processType: ProcessType.CMP,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 180,
      baseDefectRatePerCm2: 0.004, powerConsumptionKw: 55, priceUsd: 5000000,
      maintenance: { healthPercent: 92, wearPercent: 18, hoursSinceLastPm: 250 },
    }),
    createEquipment({
      id: 'EQ-CLEAN-01', brand: 'Tokyo Electron', modelName: 'CELiS Cleaner',
      processType: ProcessType.CLEAN,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 220,
      baseDefectRatePerCm2: 0.002, powerConsumptionKw: 25, priceUsd: 3500000,
      maintenance: { healthPercent: 96, wearPercent: 8, hoursSinceLastPm: 300 },
    }),
    createEquipment({
      id: 'EQ-THERM-01', brand: 'Tokyo Electron', modelName: 'V-Series Furnace',
      processType: ProcessType.THERMAL,
      supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'], throughputWph: 120,
      baseDefectRatePerCm2: 0.003, powerConsumptionKw: 80, priceUsd: 4500000,
      maintenance: { healthPercent: 93, wearPercent: 12, hoursSinceLastPm: 180 },
    }),
    createEquipment({
      id: 'EQ-IMPLANT-01', brand: 'Applied Materials', modelName: 'ViiSta 900XP',
      processType: ProcessType.ION_IMPLANT,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 160,
      baseDefectRatePerCm2: 0.005, powerConsumptionKw: 70, priceUsd: 7000000,
      maintenance: { healthPercent: 94, wearPercent: 10, hoursSinceLastPm: 200 },
    }),
    createEquipment({
      id: 'EQ-INSPECT-01', brand: 'KLA', modelName: '2130 Inspector',
      processType: ProcessType.INSPECTION,
      supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'], throughputWph: 40,
      baseDefectRatePerCm2: 0.002, powerConsumptionKw: 20, priceUsd: 5000000,
      maintenance: { healthPercent: 95, wearPercent: 8, hoursSinceLastPm: 220 },
    }),
  ];
}

// ===========================================================================
// Display helpers
// ===========================================================================

const RULE = '═'.repeat(66);
const RULE2 = '─'.repeat(66);

function usd(n: number): string {
  return n >= 0 ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    : `-$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function pct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function padRight(s: string, len: number): string {
  return s + ' '.repeat(Math.max(0, len - s.length));
}

function fmtDay(d: number): string {
  const m = Math.floor(d / 30);
  const dd = d % 30;
  return `Day ${d} (Month ${m + 1}, day ${dd + 1})`;
}

/** Print a section header. */
function header(title: string): void {
  console.log();
  console.log(RULE);
  console.log(` ${title}`);
  console.log(RULE);
}

/** Print a key/value row. */
function kv(key: string, value: string, indent = 2): void {
  console.log(' '.repeat(indent) + padRight(key + ':', 24) + value);
}

/** Print a numbered list item. */
function listItem(n: number, label: string, detail: string): void {
  console.log(`  ${n}. ${padRight(label, 30)} ${detail}`);
}

// ===========================================================================
// Report: company status
// ===========================================================================

function showStatus(g: GameState): void {
  header('COMPANY STATUS');
  kv('Month', `${g.month}`);
  kv('Sim day', `${g.day}`);
  kv('Cash', usd(g.financials.cashUsd));
  kv('Market phase', g.market.currentPhase);
  kv('Net assets', usd(g.financials.netAssetsUsd));
  kv('Gross assets', usd(g.financials.grossAssetsUsd));
  kv('Tech nodes unlocked', g.techTree.unlockedNodes.join(', '));
  console.log();
  kv('Owned equipment', `${g.ownedEquipment.length} tool(s)`);
  for (const eq of g.ownedEquipment) {
    console.log(`    • ${eq.id} — ${eq.brand} ${eq.modelName} (${eq.processType}) $${(eq.priceUsd ?? 0).toLocaleString()}`);
  }
  console.log();
  kv('Recipes', `${g.recipes.size}`);
  for (const [id, r] of g.recipes) {
    console.log(`    • ${id} — ${r.productName} (${r.targetNode}, ${r.waferSize})`);
  }
  console.log();
  if (g.packagingLine) {
    kv('Packaging line', `${g.packagingLine['lineSpec'].name} (configured)`);
  } else {
    kv('Packaging line', 'none');
  }
  if (g.dataCenter) {
    const snap = g.dataCenter.snapshot();
    kv('Data center', `${g.dataCenter.spec.name} — ${snap.deployedRacks}/${g.dataCenter.spec.rackCapacity} racks, PUE ${snap.pue.toFixed(2)}`);
  } else {
    kv('Data center', 'none');
  }
  if (g.currentResearch) {
    const r = g.currentResearch;
    kv('Research in progress', `${r.node} — ${r.daysRemaining} day(s) remaining`);
  } else {
    kv('Research', 'idle');
  }
  console.log();
  const active = g.board.active();
  const offers = g.board.openOffers();
  kv('Active contracts', `${active.length}`);
  kv('Open offers', `${offers.length}`);
  console.log();
  if (g.gameOverReason) {
    console.log(`  ⚠ GAME OVER: ${g.gameOverReason}`);
  }
}

// ===========================================================================
// Report: financials
// ===========================================================================

function showFinancials(g: GameState): void {
  header('FINANCIALS');
  const income = g.lastIncome ?? g.financials.incomeStatement();
  const balance = g.lastBalance ?? g.financials.balanceSheet();
  g.lastIncome = income;
  g.lastBalance = balance;

  console.log('  Income statement (period):');
  kv('Revenue', usd(income.revenueUsd));
  kv('Materials', usd(-income.materialCostUsd));
  kv('Backend/test', usd(-income.backendCostUsd));
  kv('OpEx (facility+labor)', usd(-income.opexUsd));
  kv('Depreciation', usd(-income.depreciationUsd));
  kv('Penalties', usd(-income.penaltyUsd));
  kv('Gross profit', usd(income.grossProfitUsd));
  kv('Operating profit', usd(income.operatingProfitUsd));
  kv('Net profit', usd(income.netProfitUsd));
  kv('Margin', pct(income.marginPercent));
  console.log();
  console.log('  Balance sheet:');
  kv('Cash', usd(balance.cashUsd));
  kv('Gross assets', usd(balance.grossAssetsUsd));
  kv('Net assets', usd(balance.netAssetsUsd));
  kv('Total liabilities', usd(balance.totalLiabilitiesUsd));
  kv('Equity', usd(balance.equityUsd));
  kv('Net cash', usd(balance.netCashUsd));
  console.log();
  console.log('  Capital assets:');
  for (const a of g.financials.capitalAssets) {
    console.log(`    • ${a.id} — ${a.name}: cost $${a.costUsd.toLocaleString()}, book $${a.bookValueUsd.toLocaleString()}`);
  }
  console.log();
  console.log('  Recent ledger (last 10):');
  const entries = g.financials.entries.slice(-10);
  for (const e of entries) {
    console.log(`    Day ${e.day} [${e.category}] ${e.memo}: ${usd(e.amountUsd)} → bal $${e.balanceAfterUsd.toLocaleString()}`);
  }
}

// ===========================================================================
// Report: market
// ===========================================================================

function showMarket(g: GameState): void {
  header('MARKET');
  const snap = g.market.snapshot();
  kv('Phase', snap.phase);
  kv('Day', `${snap.day}`);
  kv('Demand index', snap.demandIndex.toFixed(2));
  kv('Supply index', snap.supplyIndex.toFixed(2));
  kv('Competitor price level', snap.competitorPriceLevel.toFixed(2));
  kv('Lead time (weeks)', `${snap.leadTimeWeeks.toFixed(1)}`);
  kv('Default rate', pct(snap.defaultRate * 100));
  console.log();
  console.log('  By node:');
  for (const [node, state] of Object.entries(snap.byNode)) {
    const price = g.market.pricePerGoodDie(node as TechnologyNode, 1);
    console.log(`    ${padRight(node, 8)} priceIndex=${state.priceIndex.toFixed(2)} ` +
      `demand=${state.demandIndex.toFixed(2)} supply=${state.supplyIndex.toFixed(2)} ` +
      `ASP/die=$${price.toFixed(4)} lead=${state.leadTimeWeeks}w`);
  }
  console.log();
  if (snap.competitors.length > 0) {
    console.log('  Competitors:');
    for (const c of snap.competitors) {
      console.log(`    • ${c.id} — ${c.name} (${c.nodes.join(', ')}) aggression=${c.priceAggression} capacity=${c.capacityFactor} yield=${pct(c.yieldRate * 100)}`);
    }
  }
}

// ===========================================================================
// Command: accept <contractId>
// ===========================================================================

function cmdAccept(g: GameState, args: string[]): void {
  if (args.length === 0) {
    console.log('  Usage: accept <contractId>');
    return;
  }
  const id = args[0]!;
  const record = g.board.openOffers().find((r) => r.contract.id === id);
  if (!record) {
    console.log(`  No open offer '${id}'.`);
    return;
  }
  const c = record.contract;
  const rep = g.clientBook.reputationOf(c.client.id);
  const gate = reputationGateFor(c.client.tier);
  if (rep < gate) {
    console.log(`  Reputation ${rep} below gate ${gate} for ${c.client.tier} contracts.`);
    return;
  }
  if (!g.techTree.canManufacture(c.demand.targetNode, g.ownedEquipment)) {
    console.log(`  Cannot manufacture ${c.demand.targetNode}: node not unlocked or missing equipment.`);
    return;
  }
  const hasRecipe = [...g.recipes.values()].some((r) => r.targetNode === c.demand.targetNode);
  if (!hasRecipe) {
    console.log(`  No recipe registered for node ${c.demand.targetNode}.`);
    return;
  }
  g.board.accept(id);
  g.board.startProduction(id);
  console.log(`  Accepted contract ${id} from ${c.client.name}. Production started.`);
}

function reputationGateFor(tier: ClientTier): number {
  const gates: Record<ClientTier, number> = {
    [ClientTier.STARTUP]: 0,
    [ClientTier.TIER1]: 35,
    [ClientTier.HYPERSCALE]: 60,
  };
  return gates[tier];
}

// ===========================================================================
// Command: cancel <contractId>
// ===========================================================================

function cmdCancel(g: GameState, args: string[]): void {
  if (args.length === 0) {
    console.log('  Usage: cancel <contractId>');
    return;
  }
  const id = args[0]!;
  try {
    g.board.cancel(id);
    console.log(`  Cancelled contract ${id}.`);
  } catch (e) {
    console.log(`  Cannot cancel '${id}': ${(e as Error).message}`);
  }
}

// ===========================================================================
// Command: buy <equipmentId>
// ===========================================================================

function cmdBuy(g: GameState, args: string[]): void {
  if (args.length === 0) {
    console.log('  Usage: buy <equipmentId>');
    console.log('  Available starter equipment:');
    for (const eq of createStarterToolset()) {
      const already = g.ownedEquipment.some((e) => e.id === eq.id);
      console.log(`    ${eq.id} — ${eq.brand} ${eq.modelName} ($${(eq.priceUsd ?? 0).toLocaleString()}) ${already ? '(owned)' : ''}`);
    }
    return;
  }
  const id = args[0]!;
  const catalog = createStarterToolset();
  const eq = catalog.find((e) => e.id === id);
  if (!eq) {
    console.log(`  Unknown equipment '${id}'.`);
    return;
  }
  if (g.ownedEquipment.some((e) => e.id === id)) {
    console.log(`  Already own '${id}'.`);
    return;
  }
  const price = eq.priceUsd ?? 0;
  if (g.financials.cashUsd < price) {
    console.log(`  Insufficient funds: need $${price.toLocaleString()}, have $${g.financials.cashUsd.toLocaleString()}.`);
    return;
  }
  const powerDrawFactor = (eq.powerConsumptionKw * 24) / 2880;
  g.financials.capitalise({
    id: eq.id, name: `${eq.brand} ${eq.modelName}`, costUsd: price,
    acquiredDay: g.day, powerDrawFactor, staffingFactor: 1,
  });
  g.ownedEquipment.push(eq);
  console.log(`  Purchased ${eq.id} — ${eq.brand} ${eq.modelName} for $${price.toLocaleString()}.`);
}

// ===========================================================================
// Command: research <node>
// ===========================================================================

function cmdResearch(g: GameState, args: string[]): void {
  if (args.length === 0) {
    console.log('  Usage: research <node>');
    console.log('  Researchable nodes:');
    const affordable = g.techTree.nextResearchableNodes(g.financials.cashUsd);
    if (affordable.length === 0) {
      console.log('    (none affordable or unlocked)');
    }
    for (const node of affordable) {
      const req = g.techTree.requirementFor(node);
      console.log(`    ${node} — ${req?.name} ($${req?.researchCostUsd.toLocaleString()}, ${req?.researchTimeDays} days)`);
    }
    return;
  }
  const node = args[0] as TechnologyNode;
  if (!Object.values(TechnologyNode).includes(node)) {
    console.log(`  Invalid node '${node}'.`);
    return;
  }
  if (g.techTree.isUnlocked(node)) {
    console.log(`  Node ${node} already unlocked.`);
    return;
  }
  if (g.currentResearch) {
    console.log(`  Research already in progress: ${g.currentResearch.node}.`);
    return;
  }
  const req = g.techTree.requirementFor(node);
  if (!req) {
    console.log(`  Unknown node '${node}'.`);
    return;
  }
  if (req.prerequisiteNode && !g.techTree.isUnlocked(req.prerequisiteNode)) {
    console.log(`  Prerequisite ${req.prerequisiteNode} not unlocked.`);
    return;
  }
  if (g.financials.cashUsd < req.researchCostUsd) {
    console.log(`  Insufficient funds: need $${req.researchCostUsd.toLocaleString()}, have $${g.financials.cashUsd.toLocaleString()}.`);
    return;
  }
  g.financials.post(LedgerCategory.OPEX, `R&D: ${node}`, -req.researchCostUsd, g.day);
  g.currentResearch = {
    node, startDay: g.day, daysRemaining: req.researchTimeDays, costUsd: req.researchCostUsd,
  };
  console.log(`  Started research on ${node} (${req.researchTimeDays} days, $${req.researchCostUsd.toLocaleString()}).`);
}

// ===========================================================================
// Command: build <recipeId> <lotCount>
// ===========================================================================

function cmdBuild(g: GameState, args: string[]): void {
  if (args.length < 2) {
    console.log('  Usage: build <recipeId> <lotCount>');
    console.log('  Recipes:');
    for (const [id, r] of g.recipes) {
      console.log(`    ${id} — ${r.productName} (${r.targetNode})`);
    }
    return;
  }
  const recipeId = args[0]!;
  const lotCount = parseInt(args[1]!, 10);
  if (!Number.isFinite(lotCount) || lotCount < 1) {
    console.log('  Invalid lot count.');
    return;
  }
  const recipe = g.recipes.get(recipeId);
  if (!recipe) {
    console.log(`  Unknown recipe '${recipeId}'.`);
    return;
  }
  const active = g.board.active();
  const matching = active.filter((r) => r.contract.demand.targetNode === recipe.targetNode);
  if (matching.length === 0) {
    console.log(`  No active contracts for node ${recipe.targetNode}. Accept a contract first.`);
    return;
  }
  const wafersPerLot = matching[0]!.contract.demand.wafersPerLot;
  for (let i = 0; i < lotCount; i++) {
    const lotId = `LOT-M${g.month}-${String(i + 1).padStart(4, '0')}`;
    const contract = matching[i % matching.length]!;
    releaseLot(
      g.factory,
      createWaferLot({
        lotId, recipeId: recipe.recipeId, waferSize: recipe.waferSize,
        targetNode: recipe.targetNode, wafersPerLot,
      }),
      i,
    );
    g.lots.push({
      lotId, contractId: contract.contract.id, recipeId: recipe.recipeId,
      releaseDay: g.day, completedDay: null, yieldResult: null,
      materialCost: null, backendUsd: 0, delivered: false,
    });
  }
  console.log(`  Released ${lotCount} lot(s) of ${recipe.productName}.`);
}

// ===========================================================================
// Command: advance / next — advance one month
// ===========================================================================

const DAYS_PER_MONTH = 30;
const TICKS_PER_DAY = 1440;
const MAX_TICKS_PER_MONTH = DAYS_PER_MONTH * TICKS_PER_DAY;

function cmdAdvance(g: GameState): void {
  if (g.gameOver) {
    console.log('  Game is over. Start a new game to play again.');
    return;
  }

  // ── 1. Production: run factory for the month ──
  let ticks = 0;
  const completedBefore = new Set(g.lots.filter((l) => l.completedDay !== null).map((l) => l.lotId));
  let lastChargedDay = g.day;

  while (ticks < MAX_TICKS_PER_MONTH) {
    factoryTick(g.factory);
    ticks += 1;
    const day = Math.floor(g.factory.now / TICKS_PER_DAY);

    while (day > lastChargedDay) {
      lastChargedDay += 1;
      g.financials.chargePower(lastChargedDay);
      g.financials.chargeOpex(lastChargedDay);
      g.financials.accrueDepreciation(lastChargedDay);
    }

    const newlyCompleted = g.factory.completed.filter(
      (fl) => !completedBefore.has(fl.domainLot.lotId),
    );
    for (const fl of newlyCompleted) {
      completedBefore.add(fl.domainLot.lotId);
      const gameLot = g.lots.find((l) => l.lotId === fl.domainLot.lotId);
      if (!gameLot) continue;

      const y = computeLotYield({
        waferSize: fl.domainLot.waferSize,
        dieSizeMm2: 140,
        defectDensityPerCm2: fl.domainLot.accumulatedDefectDensityPerCm2,
        wafersPerLot: fl.domainLot.wafersPerLot,
      });

      const recipe = g.recipes.get(gameLot.recipeId);
      const matInputs: MaterialCostInput[] = recipe?.materials.map((m) => ({
        materialId: m.materialId, name: m.name,
        unitPriceUsd: g.materialPrices.get(m.materialId) ?? 0,
        quantityPerWafer: m.quantityPerWafer,
        wafersPerLot: fl.domainLot.wafersPerLot,
      })) ?? [];

      const materials = g.financials.chargeMaterials(fl.domainLot.lotId, matInputs, day);
      const backendUsd = y.netGoodDies * 0.42;
      g.financials.chargeBackend(fl.domainLot.lotId, backendUsd, day);

      Object.assign(gameLot, {
        completedDay: day, yieldResult: y, materialCost: materials, backendUsd,
      });

      const contractRec = g.board.active().find((r) => r.contract.id === gameLot.contractId);
      if (contractRec) {
        g.board.recordDelivery(gameLot.contractId, fl.domainLot.lotId, y.netGoodDies, day);
      }
      console.log(`  Lot ${fl.domainLot.lotId} completed: ${y.netGoodDies} good / ${y.totalGrossDies} gross (yield ${(y.yieldFraction * 100).toFixed(1)}%)`);
    }

    const allDone = g.lots.every((l) => l.completedDay !== null);
    if (allDone && g.lots.length > 0) break;
  }
  g.day = Math.floor(g.factory.now / TICKS_PER_DAY);

  // ── 2. R&D: advance research ──
  if (g.currentResearch) {
    g.currentResearch = {
      ...g.currentResearch, daysRemaining: g.currentResearch.daysRemaining - DAYS_PER_MONTH,
    };
    if (g.currentResearch.daysRemaining <= 0) {
      const unlock = g.techTree.unlock(g.currentResearch.node, g.day, g.financials.cashUsd);
      if (unlock.result.unlocked) {
        console.log(`  Research complete: ${g.currentResearch.node} unlocked!`);
      } else {
        console.log(`  Research on ${g.currentResearch.node} failed: ${unlock.result.reason}`);
      }
      g.currentResearch = null;
    } else {
      console.log(`  Research ${g.currentResearch.node}: ${g.currentResearch.daysRemaining} day(s) remaining.`);
    }
  }

  // ── 3. Contract settlement ──
  for (const r of g.board.active()) {
    const c = r.contract;
    const gameLotsForContract = g.lots.filter((l) => l.contractId === c.id && !l.delivered);
    const undelivered = gameLotsForContract.filter((l) => l.completedDay === null);
    if (undelivered.length > 0) continue;

    const deliveries: LotDelivery[] = gameLotsForContract.map((l) => ({
      lotId: l.lotId,
      quality: {
        goodDies: l.yieldResult!.netGoodDies,
        totalDies: l.yieldResult!.totalGrossDies,
        yieldFraction: l.yieldResult!.yieldFraction,
        defectDensityPerCm2: l.yieldResult!.defectDensityPerCm2,
      },
      shipDay: l.completedDay!,
    }));
    const settlement = new SettlementEngine(
      g.financials, g.clientBook, g.market,
      { collectionRate: 1, allowDefault: false },
      g.seed,
    );
    const result = settlement.settle(g.board, c.id, deliveries);
    console.log(`  Settled ${c.id}: grade=${result.grade} onTime=${result.onTime} ` +
      `delivered=${result.deliveredDies}/${result.requiredDies} ` +
      `net=$${result.netPaymentUsd.toLocaleString()} rep Δ${result.reputationDelta}`);
    for (const lot of gameLotsForContract) {
      Object.assign(lot, { delivered: true });
    }
  }

  // ── 4. Financial period close ──
  g.lastIncome = g.financials.incomeStatement();
  g.lastBalance = g.financials.balanceSheet();
  g.financials.resetPeriod();

  // ── 5. Market advance ──
  for (let i = 0; i < DAYS_PER_MONTH; i++) {
    g.market.tick();
  }

  // ── 6. Generate new contract offers ──
  generateOffers(g);

  // ── 7. Month advance ──
  g.month += 1;

  // ── Game over check ──
  if (g.financials.cashUsd < 0 && g.financials.cashUsd + g.financials.netAssetsUsd < 0) {
    g.gameOver = true;
    g.gameOverReason = 'Bankrupt: cash and assets exhausted.';
  }

  console.log(`  Month advanced. Now month ${g.month}, day ${g.day}.`);
}

function generateOffers(g: GameState): void {
  const clients = g.clientBook.all();
  const template: DemandTemplate = {
    componentCategory: ComponentCategory.GPU,
    targetNode: TechnologyNode.NM_180,
    wafersPerLot: 25,
    lotCount: 3,
    leadTimeDays: 30,
    minAcceptableYield: 0.60,
    maxDefectDensityPerCm2: 0.5,
    qualityWeight: 0.5,
  };

  for (const clientRec of clients) {
    const rep = clientRec.reputationScore;
    const gate = reputationGateFor(clientRec.client.tier);
    if (rep < gate) continue;

    const contract = generateContract({
      market: g.market,
      client: clientRec.client,
      template,
      dieSizeMm2: 140,
      waferSize: WaferSize.WAFER_200MM,
      issuedDay: g.day,
      contractId: `CTR-M${g.month}-${clientRec.client.id.slice(-4)}`,
    });
    g.board.offer(contract);
    console.log(`  New offer: ${contract.id} from ${clientRec.client.name} ` +
      `($${priceContract(g.market, clientRec.client, contract.demand).totalValueUsd.toLocaleString()})`);
  }
}

// ===========================================================================
// Command: help
// ===========================================================================

function cmdHelp(): void {
  header('COMMANDS');
  listItem(1, 'status / st', 'Show company status (cash, month, equipment, recipes)');
  listItem(2, 'financials / fin', 'Show income statement and balance sheet');
  listItem(3, 'market / mk', 'Show market phase, node prices, competitors');
  listItem(4, 'contracts / ct', 'Show open offers and active contracts');
  listItem(5, 'accept <id>', 'Accept a contract offer');
  listItem(6, 'cancel <id>', 'Cancel an active contract');
  listItem(7, 'buy <eqId>', 'Buy equipment (CapEX)');
  listItem(8, 'research <node>', 'Start R&D on a tech node (e.g. research 3nm)');
  listItem(9, 'build <recipeId> <lots>', 'Release lots to the factory for an active contract');
  listItem(10, 'advance / next / n', 'Advance one month (production → settlement → market)');
  listItem(11, 'help / h', 'Show this help');
  listItem(12, 'quit / q', 'Exit the game');
  console.log();
  console.log('  Monthly loop: production → R&D → settlement → financials → market → new offers');
  console.log('  Goal: grow cash, unlock advanced nodes, avoid bankruptcy.');
}

// ===========================================================================
// Main loop
// ===========================================================================

function parseInput(line: string): { cmd: string; args: string[] } {
  const trimmed = line.trim();
  if (!trimmed) return { cmd: '', args: [] };
  const parts = trimmed.split(/\s+/);
  return { cmd: parts[0]!.toLowerCase(), args: parts.slice(1) };
}

async function main(): Promise<void> {
  const g = createStartingState();

  // Seed initial contract offers
  generateOffers(g);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'semiworld> ',
  });

  console.log();
  console.log('╔═════════════════════════════════════════════════════════════════════════╗');
  console.log('║      SEMIWORLD — Semiconductor Company Simulation                      ║');
  console.log('║      Starting cash: $50M  │  Fab: 180nm starter toolset              ║');
  console.log('║      Type "help" for commands, "quit" to exit.                        ║');
  console.log('╚═════════════════════════════════════════════════════════════════════════╝');

  rl.prompt();

  rl.on('line', (line) => {
    const { cmd, args } = parseInput(line);

    switch (cmd) {
      case '': break;
      case 'help': case 'h': cmdHelp(); break;
      case 'status': case 'st': showStatus(g); break;
      case 'financials': case 'fin': showFinancials(g); break;
      case 'market': case 'mk': showMarket(g); break;
      case 'contracts': case 'ct': showContracts(g); break;
      case 'accept': cmdAccept(g, args); break;
      case 'cancel': cmdCancel(g, args); break;
      case 'buy': cmdBuy(g, args); break;
      case 'research': cmdResearch(g, args); break;
      case 'build': cmdBuild(g, args); break;
      case 'advance': case 'next': case 'n': cmdAdvance(g); break;
      case 'quit': case 'q': case 'exit':
        console.log('  Goodbye.');
        rl.close();
        return;
      default:
        console.log(`  Unknown command '${cmd}'. Type 'help' for commands.`);
    }

    if (g.gameOver) {
      console.log();
      console.log(`  ⚠ GAME OVER: ${g.gameOverReason}`);
      console.log('  Type "quit" to exit.');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

function showContracts(g: GameState): void {
  header('CONTRACTS');

  const offers = g.board.openOffers();
  if (offers.length > 0) {
    console.log('  Open offers (accept with `accept <id>`):');
    for (const r of offers) {
      const c = r.contract;
      const quote = priceContract(g.market, c.client, c.demand);
      console.log(`    ${c.id} — ${c.client.name} (${c.client.tier})`);
      console.log(`      ${c.demand.lotCount} lot(s) × ${c.demand.wafersPerLot} wafers, ` +
        `${c.demand.targetNode} node, ${c.demand.componentCategory}`);
      console.log(`      Required good dies: ${c.demand.requiredGoodDies} ` +
        `| Lead time: ${c.demand.leadTimeDays} days ` +
        `| Value: $${quote.totalValueUsd.toLocaleString()}` +
        ` ($${quote.pricePerDieUsd.toFixed(4)}/die)`);
      console.log(`      Quality gate: yield ≥ ${(c.demand.qualityGate.minAcceptableYield * 100).toFixed(0)}%, ` +
        `D0 ≤ ${c.demand.qualityGate.maxDefectDensityPerCm2.toFixed(3)}/cm²`);
    }
  } else {
    console.log('  No open offers.');
  }

  console.log();
  const active = g.board.active();
  if (active.length > 0) {
    console.log('  Active contracts:');
    for (const r of active) {
      const c = r.contract;
      const delivered = r.deliveredDies;
      const required = c.demand.requiredGoodDies;
      console.log(`    ${c.id} — ${c.client.name} (${r.status})`);
      console.log(`      Progress: ${delivered}/${required} good dies ` +
        `(pct ${((delivered / Math.max(required, 1)) * 100).toFixed(0)}%)`);
      console.log(`      Penalties accrued: $${r.penaltyAccruedUsd.toLocaleString()}`);
    }
  } else {
    console.log('  No active contracts.');
  }
}
function createStartingState(): GameState {
  const seed = 1001;
  const startingCash = 75_000_000;

  const starterTools = createStarterToolset();

  const lithoZone = createCleanroomZone({
    zoneId: 'Z-LITHO', name: 'ISO-5 Lithography Bay', isoClass: 5,
    ambientDefectRatePerCm2: 0.003, temperatureC: 22,
    relativeHumidityPercent: 45, vibrationScore: 2,
  });
  const etchZone = createCleanroomZone({
    zoneId: 'Z-ETCH', name: 'ISO-5 Etch Bay', isoClass: 5,
    ambientDefectRatePerCm2: 0.004, temperatureC: 22,
    relativeHumidityPercent: 45, vibrationScore: 3,
  });
  const genZone = createCleanroomZone({
    zoneId: 'Z-GEN', name: 'ISO-6 General Bay', isoClass: 6,
    ambientDefectRatePerCm2: 0.008, temperatureC: 23,
    relativeHumidityPercent: 48, vibrationScore: 5,
  });

  const machines = starterTools.map((eq) => {
    const zone =
      eq.processType === ProcessType.LITHOGRAPHY ? lithoZone
        : eq.processType === ProcessType.ETCHING ? etchZone : genZone;
    return createMachineInstance({ id: eq.id, equipmentSpec: eq, zoneId: zone.zoneId });
  });

  const recipe = createStarterRecipe();
  const recipes = new Map<string, ProductRecipe>([[recipe.recipeId, recipe]]);
  const materialPrices = new Map<string, number>(Object.entries(STARTER_MATERIAL_PRICES));

  const factory = createFactory({
    machines, zones: [lithoZone, etchZone, genZone], recipes: [recipe],
    options: {
      policy: SchedulingPolicy.FIFO, tickMinutes: 1, wearPerMinute: 0.02,
      breakdownProbabilityPerTick: 0.0001, breakdownHealthThresholdPercent: 8,
      rngSeed: seed, qtimeRules: [],
    },
  });

  const financials = new FinancialSystem({
    startingCashUsd: startingCash, usdPerKwh: 0.08,
    facilityOpexUsdPerDay: 120_000, laborUsdPerDay: 4_500,
    defaultUsefulLifeDays: 1460,
  });

  for (const eq of starterTools) {
    const price = eq.priceUsd ?? 0;
    const powerDrawFactor = (eq.powerConsumptionKw * 24) / 2880;
    financials.capitalise({
      id: eq.id, name: `${eq.brand} ${eq.modelName}`, costUsd: price,
      acquiredDay: 0, powerDrawFactor, staffingFactor: 1,
    });
  }

  const market = new MarketEnvironment({
    seed,
    baseDiePriceUsd: { '180nm': 1.6 } as Partial<Record<TechnologyNode, number>>,
  });

  const clients: Client[] = [
    createClient({ id: 'CL-STARTUP-01', name: 'ByteCraft Systems', tier: ClientTier.STARTUP, strictness: 0.35, orderWeight: 2 }),
    createClient({ id: 'CL-TIER1-01', name: 'Northwind Silicon', tier: ClientTier.TIER1, strictness: 0.6, orderWeight: 1 }),
    createClient({ id: 'CL-HYPER-01', name: 'Nebula Cloud', tier: ClientTier.HYPERSCALE, strictness: 0.85, orderWeight: 0.5 }),
  ];
  const clientBook = new ClientBook(clients);
  const board = new ContractBoard();
  const techTree = new AdvancedTechTree();

  return {
    month: 1, day: 0, gameOver: false, gameOverReason: null,
    factory, financials, market, clientBook, board, techTree,
    ownedEquipment: [...starterTools], recipes, materialPrices, lots: [],
    packagingLine: null, dataCenter: null, computeStream: null,
    currentResearch: null, lastIncome: null, lastBalance: null, seed,
  };
}

/** The starter product recipe: a 180nm discrete GPU on 200mm wafers. */
function createStarterRecipe(): ProductRecipe {
  const steps: ProcessStep[] = [
    createProcessStep({
      stepId: 'S01_LITHO_KRF', name: 'KrF Lithography — Gate Pattern',
      processType: ProcessType.LITHOGRAPHY, maskIndex: 1, durationMinutes: 45,
      stepDefectDensityPerCm2: 0.004, consumesMaterialIds: ['PHOTORESIST_KRF', 'MASK_RETICLE'],
    }),
    createProcessStep({
      stepId: 'S02_ETCH_POLY', name: 'Polysilicon Gate Etch',
      processType: ProcessType.ETCHING, durationMinutes: 35, stepDefectDensityPerCm2: 0.005,
    }),
    createProcessStep({
      stepId: 'S03_DEP_CVD', name: 'CVD Dielectric Deposition',
      processType: ProcessType.DEPOSITION, durationMinutes: 40, stepDefectDensityPerCm2: 0.003,
      consumesMaterialIds: ['POLY_SI'],
    }),
    createProcessStep({
      stepId: 'S04_CMP', name: 'CMP Planarisation',
      processType: ProcessType.CMP, durationMinutes: 25, stepDefectDensityPerCm2: 0.002,
      consumesMaterialIds: ['CMP_SLURRY'],
    }),
    createProcessStep({
      stepId: 'S05_CLEAN', name: 'Wafer Clean',
      processType: ProcessType.CLEAN, durationMinutes: 15, stepDefectDensityPerCm2: 0.001,
    }),
    createProcessStep({
      stepId: 'S06_THERMAL', name: 'Thermal Anneal',
      processType: ProcessType.THERMAL, durationMinutes: 60, stepDefectDensityPerCm2: 0.003,
    }),
    createProcessStep({
      stepId: 'S07_IMPLANT', name: 'Ion Implant',
      processType: ProcessType.ION_IMPLANT, durationMinutes: 30, stepDefectDensityPerCm2: 0.004,
      consumesMaterialIds: ['IMPLANT_N_PLUS'],
    }),
    createProcessStep({
      stepId: 'S08_INSPECT', name: 'Patterned-Wafer Inspection',
      processType: ProcessType.INSPECTION, durationMinutes: 20, stepDefectDensityPerCm2: 0.001,
    }),
  ];

  return createProductRecipe({
    recipeId: 'RCP-180NM-GPU',
    productName: '180nm Discrete GPU',
    category: ComponentCategory.GPU,
    targetNode: TechnologyNode.NM_180,
    waferSize: WaferSize.WAFER_200MM,
    dieSizeMm2: 140,
    materials: STARTER_MATERIALS,
    processSteps: steps,
    packaging: {
      packagingType: PackagingType.BGA,
      assemblyFlowName: '200mm OSAT — Die Attach → Wire Bond → Molding → BGA → Final Test',
      companionComponents: [{ category: ComponentCategory.MLCC, minQuantityPerUnit: 6 }],
    },
  });
}
