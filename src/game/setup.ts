/**
 * Starter-company setup for the shared game core.
 *
 * Holds the canonical starter toolset, zones, recipe, material prices and
 * clients, plus `createStartingState()` which builds the canonical
 * {@link GameState} used by both the interactive CLI and the HTTP server.
 */

import {
  ClientTier,
  ContractBoard,
  FinancialSystem,
  LedgerCategory,
  MarketEnvironment,
  ClientBook,
  createClient,
  type Client,
} from '../economy/index.ts';
import {
  ComponentCategory,
  LithoSource,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from '../domain/enums.ts';
import {
  createProcessStep,
  createProductRecipe,
  type MaterialRequirement,
  type ProcessStep,
  type ProductRecipe,
} from '../domain/recipe.ts';
import { createEquipment, type Equipment } from '../domain/equipment.ts';
import {
  createCleanroomZone,
  createFactory,
  createMachineInstance,
  type CleanroomZone,
  type Factory,
} from '../factory/index.ts';
import { AdvancedTechTree } from '../advanced/techTree.ts';
import type { GameState } from './types.ts';

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

/** Starter materials for the 180nm GPU recipe. */
export const STARTER_MATERIALS: MaterialRequirement[] = [
  { materialId: 'WAFER_SI_200', name: '200mm P-type CZ Silicon Wafer', category: MaterialCategory.WAFER_SUBSTRATE, quantityPerWafer: 1, unit: 'pcs' },
  { materialId: 'PHOTORESIST_KRF', name: 'KrF 248nm Positive Photoresist', category: MaterialCategory.PHOTORESIST, quantityPerWafer: 12, unit: 'ml' },
  { materialId: 'MASK_RETICLE', name: 'Quartz Photomask Reticle Set (amortised)', category: MaterialCategory.PHOTO_MASK, quantityPerWafer: 0.04, unit: 'set' },
  { materialId: 'POLY_SI', name: 'Undoped Polysilicon (SiH4 CVD)', category: MaterialCategory.CVD_PRECURSOR, quantityPerWafer: 0.6, unit: 'g' },
  { materialId: 'TARGET_ALUMINUM', name: 'Al-Cu Sputtering Target (99.999%)', category: MaterialCategory.TARGET_METAL, quantityPerWafer: 1.1, unit: 'g' },
  { materialId: 'CMP_SLURRY', name: 'Alumina / Silica CMP Slurry', category: MaterialCategory.CMP_SLURRY, quantityPerWafer: 400, unit: 'ml' },
  { materialId: 'IMPLANT_N_PLUS', name: 'N+ Dopant Gas (PH3 / AsH3)', category: MaterialCategory.IMPLANT_DOPANT, quantityPerWafer: 0.4, unit: 'std-L' },
];

/** Unit prices the fab pays per unit of material (USD). */
export const STARTER_MATERIAL_PRICES: Record<string, number> = {
  WAFER_SI_200: 88,
  PHOTORESIST_KRF: 0.92,
  MASK_RETICLE: 1450,
  POLY_SI: 7.4,
  TARGET_ALUMINUM: 5.1,
  CMP_SLURRY: 2.5,
  IMPLANT_N_PLUS: 12.0,
};

// ---------------------------------------------------------------------------
// Starter toolset
// ---------------------------------------------------------------------------

/** Canonical starter 180nm-era toolset. */
export function createStarterToolset(): Equipment[] {
  return [
    createEquipment({
      id: 'EQ-LITHO-01',
      brand: 'ASML',
      modelName: 'PAS 5500/550 KrF Scanner',
      processType: ProcessType.LITHOGRAPHY,
      lithoSource: LithoSource.KRF,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 110,
      baseDefectRatePerCm2: 0.006,
      powerConsumptionKw: 100,
      priceUsd: 12_000_000,
      maintenance: { healthPercent: 95, wearPercent: 10, hoursSinceLastPm: 200 },
    }),
    createEquipment({
      id: 'EQ-ETCH-01',
      brand: 'Lam Research',
      modelName: 'TCP 9400 Etcher',
      processType: ProcessType.ETCHING,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 140,
      baseDefectRatePerCm2: 0.007,
      powerConsumptionKw: 45,
      priceUsd: 8_000_000,
      maintenance: { healthPercent: 94, wearPercent: 12, hoursSinceLastPm: 180 },
    }),
    createEquipment({
      id: 'EQ-DEP-01',
      brand: 'Applied Materials',
      modelName: 'Centura CVD',
      processType: ProcessType.DEPOSITION,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 200,
      baseDefectRatePerCm2: 0.005,
      powerConsumptionKw: 60,
      priceUsd: 6_000_000,
      maintenance: { healthPercent: 93, wearPercent: 15, hoursSinceLastPm: 220 },
    }),
    createEquipment({
      id: 'EQ-CMP-01',
      brand: 'Applied Materials',
      modelName: 'Mirra CMP',
      processType: ProcessType.CMP,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 180,
      baseDefectRatePerCm2: 0.004,
      powerConsumptionKw: 55,
      priceUsd: 5_000_000,
      maintenance: { healthPercent: 92, wearPercent: 18, hoursSinceLastPm: 250 },
    }),
    createEquipment({
      id: 'EQ-CLEAN-01',
      brand: 'Tokyo Electron',
      modelName: 'CELiS Cleaner',
      processType: ProcessType.CLEAN,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 220,
      baseDefectRatePerCm2: 0.002,
      powerConsumptionKw: 25,
      priceUsd: 3_500_000,
      maintenance: { healthPercent: 96, wearPercent: 8, hoursSinceLastPm: 300 },
    }),
    createEquipment({
      id: 'EQ-THERM-01',
      brand: 'Tokyo Electron',
      modelName: 'V-Series Furnace',
      processType: ProcessType.THERMAL,
      supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
      throughputWph: 120,
      baseDefectRatePerCm2: 0.003,
      powerConsumptionKw: 80,
      priceUsd: 4_500_000,
      maintenance: { healthPercent: 93, wearPercent: 12, hoursSinceLastPm: 180 },
    }),
    createEquipment({
      id: 'EQ-IMPLANT-01',
      brand: 'Applied Materials',
      modelName: 'ViiSta 900XP',
      processType: ProcessType.ION_IMPLANT,
      supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 160,
      baseDefectRatePerCm2: 0.005,
      powerConsumptionKw: 70,
      priceUsd: 7_000_000,
      maintenance: { healthPercent: 94, wearPercent: 10, hoursSinceLastPm: 200 },
    }),
    createEquipment({
      id: 'EQ-INSPECT-01',
      brand: 'KLA',
      modelName: '2130 Inspector',
      processType: ProcessType.INSPECTION,
      supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
      supportedWaferSizes: ['WAFER_200MM'],
      throughputWph: 40,
      baseDefectRatePerCm2: 0.002,
      powerConsumptionKw: 20,
      priceUsd: 5_000_000,
      maintenance: { healthPercent: 95, wearPercent: 8, hoursSinceLastPm: 220 },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Starter recipe
// ---------------------------------------------------------------------------

/** The starter product recipe: a 180nm discrete GPU on 200mm wafers. */
export function createStarterRecipe(): ProductRecipe {
  const steps: ProcessStep[] = [
    createProcessStep({
      stepId: 'S01_LITHO_KRF',
      name: 'KrF Lithography — Gate Pattern',
      processType: ProcessType.LITHOGRAPHY,
      maskIndex: 1,
      durationMinutes: 45,
      stepDefectDensityPerCm2: 0.004,
      consumesMaterialIds: ['PHOTORESIST_KRF', 'MASK_RETICLE'],
    }),
    createProcessStep({
      stepId: 'S02_ETCH_POLY',
      name: 'Polysilicon Gate Etch',
      processType: ProcessType.ETCHING,
      durationMinutes: 35,
      stepDefectDensityPerCm2: 0.005,
    }),
    createProcessStep({
      stepId: 'S03_DEP_CVD',
      name: 'CVD Dielectric Deposition',
      processType: ProcessType.DEPOSITION,
      durationMinutes: 40,
      stepDefectDensityPerCm2: 0.003,
      consumesMaterialIds: ['POLY_SI'],
    }),
    createProcessStep({
      stepId: 'S04_CMP',
      name: 'CMP Planarisation',
      processType: ProcessType.CMP,
      durationMinutes: 25,
      stepDefectDensityPerCm2: 0.002,
      consumesMaterialIds: ['CMP_SLURRY'],
    }),
    createProcessStep({
      stepId: 'S05_CLEAN',
      name: 'Wafer Clean',
      processType: ProcessType.CLEAN,
      durationMinutes: 15,
      stepDefectDensityPerCm2: 0.001,
    }),
    createProcessStep({
      stepId: 'S06_THERMAL',
      name: 'Thermal Anneal',
      processType: ProcessType.THERMAL,
      durationMinutes: 60,
      stepDefectDensityPerCm2: 0.003,
    }),
    createProcessStep({
      stepId: 'S07_IMPLANT',
      name: 'Ion Implant',
      processType: ProcessType.ION_IMPLANT,
      durationMinutes: 30,
      stepDefectDensityPerCm2: 0.004,
      consumesMaterialIds: ['IMPLANT_N_PLUS'],
    }),
    createProcessStep({
      stepId: 'S08_INSPECT',
      name: 'Patterned-Wafer Inspection',
      processType: ProcessType.INSPECTION,
      durationMinutes: 20,
      stepDefectDensityPerCm2: 0.001,
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

// ---------------------------------------------------------------------------
// Starter company state
// ---------------------------------------------------------------------------

/** Build the canonical starting GameState used by both CLI and HTTP server. */
export function createStartingState(seed = 1337): GameState {
  const starterTools = createStarterToolset();
  const factory = createFactory({
    machines: starterTools.map((eq) =>
      createMachineInstance({
        id: eq.id,
        equipmentSpec: eq,
        zoneId: 'Z-FAB',
      }),
    ),
    recipes: [createStarterRecipe()],
    options: {
      wearPerMinute: 0.001,
      breakdownProbabilityPerTick: 0.0001,
    },
  });

  const financials = new FinancialSystem({ startingCashUsd: 50_000_000 });
  const market = new MarketEnvironment({
    seed,
    baseDiePriceUsd: { '180nm': 1.6 } as Partial<Record<TechnologyNode, number>>,
  });

  const clients: Client[] = [
    createClient({
      id: 'CL-STARTUP-01',
      name: 'ByteCraft Systems',
      tier: ClientTier.STARTUP,
      strictness: 0.35,
      orderWeight: 2,
    }),
    createClient({
      id: 'CL-TIER1-01',
      name: 'Northwind Silicon',
      tier: ClientTier.TIER1,
      strictness: 0.6,
      orderWeight: 1,
    }),
    createClient({
      id: 'CL-HYPER-01',
      name: 'Nebula Cloud',
      tier: ClientTier.HYPERSCALE,
      strictness: 0.85,
      orderWeight: 0.5,
    }),
  ];
  const clientBook = new ClientBook(clients);
  const board = new ContractBoard();
  const techTree = new AdvancedTechTree();

  const recipes = new Map<string, ProductRecipe>();
  recipes.set(createStarterRecipe().recipeId, createStarterRecipe());

  const materialPrices = new Map<string, number>();
  for (const [id, price] of Object.entries(STARTER_MATERIAL_PRICES)) {
    materialPrices.set(id, price);
  }

  return {
    month: 1,
    day: 0,
    gameOver: false,
    gameOverReason: null,
    factory,
    financials,
    market,
    clientBook,
    board,
    techTree,
    ownedEquipment: [...starterTools],
    recipes,
    materialPrices,
    lots: [],
    packagingLine: null,
    dataCenter: null,
    computeStream: null,
    currentResearch: null,
    lastIncome: null,
    lastBalance: null,
    seed,
  };
}
