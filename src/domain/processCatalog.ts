/**
 * Semiconductor Tycoon — the consumables catalog.
 *
 * Every material referenced by the 15-stage process flow (and by the product
 * recipes built on top of it) is defined exactly once here, together with its
 * unit price. The factory simulation bills materials per wafer consumed, so
 * these prices are one of the two levers that decide whether a product line
 * is profitable.
 *
 * Pure data, no I/O, browser-safe.
 */

import {
  ComponentCategory,
  LithoSource,
  MaterialCategory,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from './enums.ts';
import {
  ORDERED_PROCESS_FLOW,
  ProcessNodeId,
  stagesUnlockedAt,
} from './processFlow.ts';
import {
  createProcessStep,
  createProductRecipe,
  type MaterialRequirement,
  type PackagingSpec,
  type ProcessStep,
  type ProductRecipe,
} from './recipe.ts';
import { deepFreeze } from './validation.ts';

/** One catalogued consumable. */
export interface MaterialCatalogEntry {
  readonly materialId: string;
  readonly name: string;
  readonly nameZh: string;
  readonly category: MaterialCategory;
  /** Amount consumed per wafer at each stage that uses it. */
  readonly quantityPerWafer: number;
  readonly unit: string;
  /** Price per unit in USD. */
  readonly pricePerUnitUsd: number;
  /** True when the material can be reclaimed and partially refunded. */
  readonly reclaimable: boolean;
}

function mat(
  e: Omit<MaterialCatalogEntry, 'reclaimable'> & { reclaimable?: boolean },
): MaterialCatalogEntry {
  return deepFreeze({ ...e, reclaimable: e.reclaimable ?? false });
}

// ---------------------------------------------------------------------------
// Material catalog
// ---------------------------------------------------------------------------

/**
 * The full material catalog.
 *
 * Ids are prefixed by family so the UI can group them:
 *   `mat_gas_*`    process gases       `mat_clean_*` wet chemistry
 *   `mat_resist_*` photoresists        `mat_mask_*`  photomasks
 *   `mat_precursor_*` film precursors  `mat_slurry_*` CMP consumables
 *   `mat_target_*` sputtering targets  `mat_wafer_*` bare substrates
 */
export const MATERIAL_CATALOG: readonly MaterialCatalogEntry[] = deepFreeze([
  // --- bare substrates ---
  mat({
    materialId: 'mat_wafer_si_200',
    name: '200mm P-type CZ Silicon Wafer',
    nameZh: '200mm P型矽晶圓',
    category: MaterialCategory.WAFER_SUBSTRATE,
    quantityPerWafer: 1,
    unit: 'pcs',
    pricePerUnitUsd: 88,
  }),
  mat({
    materialId: 'mat_wafer_si_300',
    name: '300mm P-type CZ Silicon Wafer',
    nameZh: '300mm P型矽晶圓',
    category: MaterialCategory.WAFER_SUBSTRATE,
    quantityPerWafer: 1,
    unit: 'pcs',
    pricePerUnitUsd: 145,
  }),
  mat({
    materialId: 'mat_wafer_sic_200',
    name: '200mm 4H-SiC Substrate',
    nameZh: '200mm 碳化矽晶圓',
    category: MaterialCategory.WAFER_SUBSTRATE,
    quantityPerWafer: 1,
    unit: 'pcs',
    pricePerUnitUsd: 620,
  }),

  // --- photoresists ---
  mat({
    materialId: 'mat_resist_krf',
    name: 'KrF 248nm Positive Photoresist',
    nameZh: 'KrF 248nm 正光阻',
    category: MaterialCategory.PHOTORESIST,
    quantityPerWafer: 12,
    unit: 'ml',
    pricePerUnitUsd: 0.92,
  }),
  mat({
    materialId: 'mat_resist_iline',
    name: 'I-Line 365nm Positive Photoresist',
    nameZh: 'I-Line 365nm 正光阻',
    category: MaterialCategory.PHOTORESIST,
    quantityPerWafer: 10,
    unit: 'ml',
    pricePerUnitUsd: 0.55,
  }),
  mat({
    materialId: 'mat_resist_ar',
    name: 'ArF 193nm Resist (immersion-grade)',
    nameZh: 'ArF 193nm 浸没式光阻',
    category: MaterialCategory.PHOTORESIST,
    quantityPerWafer: 16,
    unit: 'ml',
    pricePerUnitUsd: 4.6,
  }),
  mat({
    materialId: 'mat_resist_euv',
    name: 'EUV Resist (metal-oxide resist)',
    nameZh: 'EUV 光阻',
    category: MaterialCategory.PHOTORESIST,
    quantityPerWafer: 20,
    unit: 'ml',
    pricePerUnitUsd: 22,
  }),

  // --- photomasks ---
  mat({
    materialId: 'mat_mask_gate',
    name: 'Gate Level Photomask Set (amortised)',
    nameZh: '閘極層光罩組',
    category: MaterialCategory.PHOTO_MASK,
    quantityPerWafer: 0.04,
    unit: 'set',
    pricePerUnitUsd: 1450,
  }),
  mat({
    materialId: 'mat_mask_contact',
    name: 'Contact/Via Level Photomask Set (amortised)',
    nameZh: '接觸孔層光罩組',
    category: MaterialCategory.PHOTO_MASK,
    quantityPerWafer: 0.04,
    unit: 'set',
    pricePerUnitUsd: 1450,
  }),

  // --- process gases ---
  mat({
    materialId: 'mat_gas_o2',
    name: 'Oxygen (Oxidation Furnace Grade)',
    nameZh: '氧氣',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 40,
    unit: 'slm',
    pricePerUnitUsd: 0.012,
  }),
  mat({
    materialId: 'mat_gas_n2',
    name: 'Nitrogen (Carrier / Anneal Grade)',
    nameZh: '氮氣',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 120,
    unit: 'slm',
    pricePerUnitUsd: 0.008,
  }),
  mat({
    materialId: 'mat_gas_h2',
    name: 'Hydrogen (Forming / Anneal Grade)',
    nameZh: '氫氣',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 25,
    unit: 'slm',
    pricePerUnitUsd: 0.02,
  }),
  mat({
    materialId: 'mat_gas_sih4',
    name: 'Silane (SiH4) Deposition Gas',
    nameZh: '矽烷氣',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 8,
    unit: 'slm',
    pricePerUnitUsd: 0.85,
  }),
  mat({
    materialId: 'mat_gas_nh3',
    name: 'Ammonia (NH3) for Nitride Deposition',
    nameZh: '氨氣',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 10,
    unit: 'slm',
    pricePerUnitUsd: 0.55,
  }),
  mat({
    materialId: 'mat_gas_ph3',
    name: 'Phosphine (PH3) Implant Dopant',
    nameZh: '磷烷',
    category: MaterialCategory.IMPLANT_DOPANT,
    quantityPerWafer: 0.35,
    unit: 'std-L',
    pricePerUnitUsd: 12,
  }),
  mat({
    materialId: 'mat_gas_arsine',
    name: 'Arsine (AsH3) Implant Dopant',
    nameZh: '砷烷',
    category: MaterialCategory.IMPLANT_DOPANT,
    quantityPerWafer: 0.3,
    unit: 'std-L',
    pricePerUnitUsd: 14,
  }),
  mat({
    materialId: 'mat_gas_bf3',
    name: 'Boron Trifluoride (BF3) Implant Dopant',
    nameZh: '三氟化硼',
    category: MaterialCategory.IMPLANT_DOPANT,
    quantityPerWafer: 0.4,
    unit: 'std-L',
    pricePerUnitUsd: 9,
  }),
  mat({
    materialId: 'mat_gas_cf4',
    name: 'Tetrafluoromethane (CF4) Etant',
    nameZh: '四氟化碳',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 6,
    unit: 'slm',
    pricePerUnitUsd: 0.35,
  }),
  mat({
    materialId: 'mat_gas_cl2',
    name: 'Chlorine (Cl2) Etant',
    nameZh: '氯氣',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 4,
    unit: 'slm',
    pricePerUnitUsd: 0.18,
  }),
  mat({
    materialId: 'mat_gas_hbr',
    name: 'Hydrogen Bromide (HBr) Etant',
    nameZh: '溴化氫',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 3,
    unit: 'slm',
    pricePerUnitUsd: 1.1,
  }),

  // --- wet chemistry ---
  mat({
    materialId: 'mat_clean_rca',
    name: 'RCA-1/RCA-2 SC-1 Clean Chemistry',
    nameZh: 'RCA 清洗液',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 15,
    unit: 'ml',
    pricePerUnitUsd: 0.22,
  }),
  mat({
    materialId: 'mat_clean_hf',
    name: 'Dilute Hydrofluoric Acid (DHF)',
    nameZh: '稀氫氟酸',
    category: MaterialCategory.PRECURSOR_GAS,
    quantityPerWafer: 8,
    unit: 'ml',
    pricePerUnitUsd: 0.45,
  }),

  // --- deposition precursors / targets ---
  mat({
    materialId: 'mat_precursor_sio',
    name: 'Low-k Dielectric Precursor (Si-based)',
    nameZh: '低介電質前驅物',
    category: MaterialCategory.CVD_PRECURSOR,
    quantityPerWafer: 0.6,
    unit: 'g',
    pricePerUnitUsd: 12,
  }),
  mat({
    materialId: 'mat_target_cu',
    name: 'Copper Sputtering Target (6N)',
    nameZh: '銅靶材',
    category: MaterialCategory.TARGET_METAL,
    quantityPerWafer: 1.4,
    unit: 'g',
    pricePerUnitUsd: 9.8,
  }),

  // --- CMP consumables ---
  mat({
    materialId: 'mat_slurry_cmp',
    name: 'CMP Slurry and Conditioning Pad Set',
    nameZh: 'CMP 研磨液與修墊',
    category: MaterialCategory.CMP_SLURRY,
    quantityPerWafer: 400,
    unit: 'ml',
    pricePerUnitUsd: 2.5,
    reclaimable: true,
  }),
]);

/** Fast id -> material lookup. */
export const MATERIAL_BY_ID: Readonly<Record<string, MaterialCatalogEntry>> = deepFreeze(
  Object.fromEntries(MATERIAL_CATALOG.map((m) => [m.materialId, m])),
);

/** Look up a material by id. Throws if unknown. */
export function getMaterial(materialId: string): MaterialCatalogEntry {
  const found = MATERIAL_BY_ID[materialId];
  if (!found) {
    throw new RangeError(`Unknown material id: ${materialId}`);
  }
  return found;
}

/** Unit price map keyed by material id, for the economy layer. */
export const MATERIAL_PRICE_MAP: Readonly<Record<string, number>> = deepFreeze(
  Object.fromEntries(MATERIAL_CATALOG.map((m) => [m.materialId, m.pricePerUnitUsd])),
);

// ---------------------------------------------------------------------------
// Equipment catalog
// ---------------------------------------------------------------------------

/**
 * A purchasable tool "platform" — one catalog entry the player can buy
 * multiple copies of.
 *
 * The catalog is organised *by stage*: every one of the 15 flow stages has at
 * least one platform that can run it. Platforms are tiered by capability
 * (`tier`), which is the backbone of the unlock/economy curve: a tier-1 tool
 * can run 350nm, a tier-3 tool is required for 7nm and beyond.
 */
export interface EquipmentCatalogEntry {
  readonly equipmentId: string;
  readonly brand: string;
  readonly modelName: string;
  readonly nameZh: string;
  readonly processType: ProcessType;
  /** Capability tier 1-3. Higher tiers unlock advanced nodes. */
  readonly tier: 1 | 2 | 3;
  /** Feature-size window this platform can run, in nm. */
  readonly mostAdvancedNm: number;
  readonly mostMatureNm: number;
  readonly supportedWaferSizes: readonly WaferSize[];
  /** Gross line rate, wafers per hour. */
  readonly throughputWph: number;
  /** Intrinsic defect contribution per wafer pass, in defects/cm². */
  readonly baseDefectRatePerCm2: number;
  readonly powerConsumptionKw: number;
  /** Acquisition cost in USD. */
  readonly priceUsd: number;
  /** Litho light source — litho platforms only. */
  readonly lithoSource?: LithoSource;
  /** The flow stages this platform is the canonical choice for. */
  readonly servesNodeIds: readonly ProcessNodeId[];
  /** Technology node required before this platform can be purchased. */
  readonly unlockNode: TechnologyNode;
  /** Short player-facing pitch. */
  readonly description: string;
}

/**
 * The equipment catalog.
 *
 * Coverage rule: every one of the 15 flow stages has at least one platform
 * listed in `servesNodeIds`, so a fully equipped tier-1 fab can run the whole
 * line at 350nm.
 */
export const EQUIPMENT_CATALOG: readonly EquipmentCatalogEntry[] = deepFreeze([
  // =========================================================================
  // TIER 1 — mature-node toolset (350nm / 180nm)
  // =========================================================================

  // --- Stage 1 & 15: inspection ---
  {
    equipmentId: 'EQP-KLA-2130',
    brand: 'KLA',
    modelName: '2130 Inspection System',
    nameZh: 'KLA 2130 檢測系統',
    processType: ProcessType.INSPECTION,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    throughputWph: 40,
    baseDefectRatePerCm2: 0.002,
    powerConsumptionKw: 20,
    priceUsd: 5_000_000,
    servesNodeIds: [
      ProcessNodeId.INCOMING_INSPECTION,
      ProcessNodeId.FINAL_INSPECTION,
    ],
    unlockNode: TechnologyNode.NM_350,
    description: 'Broadband patterned-wafer defect review. The gate every wafer passes through twice.',
  },
  {
    equipmentId: 'EQP-TEL-CELIS',
    brand: 'Tokyo Electron',
    modelName: 'CELiS SC Series',
    nameZh: 'TEL CELiS 清洗機',
    processType: ProcessType.CLEAN,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    throughputWph: 90,
    baseDefectRatePerCm2: 0.001,
    powerConsumptionKw: 25,
    priceUsd: 3_200_000,
    servesNodeIds: [ProcessNodeId.PRE_PROCESS_CLEAN],
    unlockNode: TechnologyNode.NM_350,
    description: 'Single-wafer wet bench. RCA and HF cleans keep particle counts near zero.',
  },
  {
    equipmentId: 'EQP-TEL-VF',
    brand: 'Tokyo Electron',
    modelName: 'V-Series Vertical Furnace',
    nameZh: 'TEL V 系列垂直爐',
    processType: ProcessType.THERMAL,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    throughputWph: 120,
    baseDefectRatePerCm2: 0.003,
    powerConsumptionKw: 80,
    priceUsd: 4_500_000,
    servesNodeIds: [ProcessNodeId.FIELD_OXIDATION, ProcessNodeId.ACTIVATION_ANNEAL],
    unlockNode: TechnologyNode.NM_350,
    description: 'Vertical batch furnace. 50-wafer boats make oxidation and anneal surprisingly cheap.',
  },
  {
    equipmentId: 'EQP-AMAT-VIISTA',
    brand: 'Applied Materials',
    modelName: 'ViiSta 900XP',
    nameZh: 'AMAT ViiSta 900XP 注入機',
    processType: ProcessType.ION_IMPLANT,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM'],
    throughputWph: 160,
    baseDefectRatePerCm2: 0.005,
    powerConsumptionKw: 70,
    priceUsd: 7_000_000,
    servesNodeIds: [
      ProcessNodeId.N_WELL_IMPLANT,
      ProcessNodeId.P_WELL_IMPLANT,
      ProcessNodeId.SOURCE_DRAIN_IMPLANT,
    ],
    unlockNode: TechnologyNode.NM_350,
    description: 'Medium-current implanter. One platform covers wells, source/drain and LDD recipes.',
  },
  {
    equipmentId: 'EQP-NIKON-NSR',
    brand: 'Nikon',
    modelName: 'NSR Series i-Line Stepper',
    nameZh: 'Nikon NSR i-Line 步進曝光機',
    processType: ProcessType.LITHOGRAPHY,
    tier: 1,
    mostAdvancedNm: 350,
    mostMatureNm: 500,
    supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    throughputWph: 120,
    baseDefectRatePerCm2: 0.008,
    powerConsumptionKw: 55,
    priceUsd: 4_200_000,
    lithoSource: LithoSource.I_LINE,
    servesNodeIds: [ProcessNodeId.GATE_LITHOGRAPHY],
    unlockNode: TechnologyNode.NM_350,
    description: '365nm i-line stepper. The only lithography that existed when 350nm was leading edge.',
  },
  {
    equipmentId: 'EQP-ASML-P5500',
    brand: 'ASML',
    modelName: 'PAS 5500/550 KrF Scanner',
    nameZh: 'ASML PAS 5500/550 KrF 曝光機',
    processType: ProcessType.LITHOGRAPHY,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM'],
    throughputWph: 165,
    baseDefectRatePerCm2: 0.006,
    powerConsumptionKw: 85,
    priceUsd: 12_000_000,
    lithoSource: LithoSource.KRF,
    servesNodeIds: [ProcessNodeId.GATE_LITHOGRAPHY, ProcessNodeId.CONTACT_LITHOGRAPHY],
    unlockNode: TechnologyNode.NM_350,
    description: '248nm step-and-scan. The workhorse that built the entire 180nm era.',
  },
  {
    equipmentId: 'EQP-LAM-TCP9400',
    brand: 'Lam Research',
    modelName: 'TCP 9400',
    nameZh: 'Lam TCP 9400 刻蝕機',
    processType: ProcessType.ETCHING,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM'],
    throughputWph: 45,
    baseDefectRatePerCm2: 0.006,
    powerConsumptionKw: 35,
    priceUsd: 6_500_000,
    servesNodeIds: [ProcessNodeId.GATE_ETCH, ProcessNodeId.CONTACT_ETCH],
    unlockNode: TechnologyNode.NM_350,
    description: 'Transformer-coupled plasma etcher. Reliable, cheap, and everywhere in 180nm fabs.',
  },
  {
    equipmentId: 'EQP-AMAT-CENTURA',
    brand: 'Applied Materials',
    modelName: 'Centura CVD',
    nameZh: 'AMAT Centura CVD',
    processType: ProcessType.DEPOSITION,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    throughputWph: 28,
    baseDefectRatePerCm2: 0.005,
    powerConsumptionKw: 55,
    priceUsd: 7_800_000,
    servesNodeIds: [ProcessNodeId.GATE_STACK_DEPOSITION, ProcessNodeId.METAL_INTERCONNECT],
    unlockNode: TechnologyNode.NM_350,
    description: 'Multi-chamber CVD platform. Poly, nitride and low-k all run on one tool.',
  },
  {
    equipmentId: 'EQP-AMAT-MIRRA',
    brand: 'Applied Materials',
    modelName: 'Mirra CMP',
    nameZh: 'AMAT Mirra CMP',
    processType: ProcessType.CMP,
    tier: 1,
    mostAdvancedNm: 180,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    throughputWph: 35,
    baseDefectRatePerCm2: 0.008,
    powerConsumptionKw: 60,
    priceUsd: 7_500_000,
    servesNodeIds: [ProcessNodeId.INTERLAYER_DIELECTRIC],
    unlockNode: TechnologyNode.NM_350,
    description: 'Single-wafer CMP. Planarization is what lets the interconnect stack go vertical.',
  },

  // =========================================================================
  // TIER 2 — mid-node toolset (90nm / 28nm)
  // =========================================================================

  {
    equipmentId: 'EQP-KLA-2930',
    brand: 'KLA',
    modelName: '2930 Inspection System',
    nameZh: 'KLA 2930 檢測系統',
    processType: ProcessType.INSPECTION,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 60,
    baseDefectRatePerCm2: 0.001,
    powerConsumptionKw: 30,
    priceUsd: 14_000_000,
    servesNodeIds: [
      ProcessNodeId.INCOMING_INSPECTION,
      ProcessNodeId.FINAL_INSPECTION,
    ],
    unlockNode: TechnologyNode.NM_90,
    description: 'Sensitivity to sub-30nm defects. Retrofitting this upgrades your whole line at once.',
  },
  {
    equipmentId: 'EQP-SCREEN-CLEAN',
    brand: 'SCREEN Holdings',
    modelName: 'CLEAN DUO',
    nameZh: 'SCREEN CLEAN DUO 清洗機',
    processType: ProcessType.CLEAN,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 120,
    baseDefectRatePerCm2: 0.0008,
    powerConsumptionKw: 32,
    priceUsd: 8_500_000,
    servesNodeIds: [ProcessNodeId.PRE_PROCESS_CLEAN],
    unlockNode: TechnologyNode.NM_90,
    description: 'Batch wet clean with single-wafer polish. Cheaper per wafer than CELiS.',
  },
  {
    equipmentId: 'EQP-KOKUSAI-MI-5000',
    brand: 'Kokusai Electric',
    modelName: 'MI-5000 Batch Furnace',
    nameZh: 'Kokusai MI-5000 批次爐',
    processType: ProcessType.THERMAL,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 140,
    baseDefectRatePerCm2: 0.002,
    powerConsumptionKw: 95,
    priceUsd: 9_500_000,
    servesNodeIds: [ProcessNodeId.FIELD_OXIDATION, ProcessNodeId.ACTIVATION_ANNEAL],
    unlockNode: TechnologyNode.NM_90,
    description: 'Next-gen vertical furnace. Faster ramp, tighter temperature uniformity.',
  },
  {
    equipmentId: 'EQP-AMAT-VIISTA-3D',
    brand: 'Applied Materials',
    modelName: 'ViiSta 3D',
    nameZh: 'AMAT ViiSta 3D 注入機',
    processType: ProcessType.ION_IMPLANT,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 185,
    baseDefectRatePerCm2: 0.003,
    powerConsumptionKw: 85,
    priceUsd: 18_000_000,
    servesNodeIds: [
      ProcessNodeId.N_WELL_IMPLANT,
      ProcessNodeId.P_WELL_IMPLANT,
      ProcessNodeId.SOURCE_DRAIN_IMPLANT,
    ],
    unlockNode: TechnologyNode.NM_90,
    description: 'Low-damage high-current implant. Tighter dose control at 90nm and below.',
  },
  {
    equipmentId: 'EQP-ASML-NXT2000I',
    brand: 'ASML',
    modelName: 'TWINSCAN NXT:2000i',
    nameZh: 'ASML TWINSCAN NXT:2000i',
    processType: ProcessType.LITHOGRAPHY,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 180,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 275,
    baseDefectRatePerCm2: 0.004,
    powerConsumptionKw: 170,
    priceUsd: 180_000_000,
    lithoSource: LithoSource.ARF_IMMERSION,
    servesNodeIds: [ProcessNodeId.GATE_LITHOGRAPHY, ProcessNodeId.CONTACT_LITHOGRAPHY],
    unlockNode: TechnologyNode.NM_90,
    description: '193nm immersion scanner. Overlaps litho and keeps the whole flow moving.',
  },
  {
    equipmentId: 'EQP-LAM-KIYO45',
    brand: 'Lam Research',
    modelName: 'Kiyo 45',
    nameZh: 'Lam Kiyo 45 刻蝕機',
    processType: ProcessType.ETCHING,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 60,
    baseDefectRatePerCm2: 0.004,
    powerConsumptionKw: 45,
    priceUsd: 14_000_000,
    servesNodeIds: [ProcessNodeId.GATE_ETCH, ProcessNodeId.CONTACT_ETCH],
    unlockNode: TechnologyNode.NM_90,
    description: 'Polymorph-silicon etcher. Handles both the gate and the via stack.',
  },
  {
    equipmentId: 'EQP-AMAT-PRODUKT',
    brand: 'Applied Materials',
    modelName: 'Producer PVD / ALD',
    nameZh: 'AMAT Producer PVD/ALD',
    processType: ProcessType.DEPOSITION,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 45,
    baseDefectRatePerCm2: 0.003,
    powerConsumptionKw: 70,
    priceUsd: 22_000_000,
    servesNodeIds: [ProcessNodeId.GATE_STACK_DEPOSITION, ProcessNodeId.METAL_INTERCONNECT],
    unlockNode: TechnologyNode.NM_90,
    description: 'PVD and ALD in one platform. High-k gate stacks and copper barriers need both.',
  },
  {
    equipmentId: 'EQP-EBARA-300',
    brand: 'Ebara',
    modelName: 'CMP-300 Series',
    nameZh: 'Ebara CMP-300',
    processType: ProcessType.CMP,
    tier: 2,
    mostAdvancedNm: 28,
    mostMatureNm: 350,
    supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    throughputWph: 55,
    baseDefectRatePerCm2: 0.005,
    powerConsumptionKw: 70,
    priceUsd: 16_000_000,
    servesNodeIds: [ProcessNodeId.INTERLAYER_DIELECTRIC],
    unlockNode: TechnologyNode.NM_90,
    description: 'High-throughput CMP. The bottleneck tool in every advanced interconnect flow.',
  },

  // =========================================================================
  // TIER 3 — advanced-node toolset (7nm and beyond)
  // =========================================================================

  {
    equipmentId: 'EQP-KLA-39',
    brand: 'KLA',
    modelName: '39 Series Gen5',
    nameZh: 'KLA 39 系列 Gen5 檢測系統',
    processType: ProcessType.INSPECTION,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 90,
    baseDefectRatePerCm2: 0.0005,
    powerConsumptionKw: 45,
    priceUsd: 95_000_000,
    servesNodeIds: [
      ProcessNodeId.INCOMING_INSPECTION,
      ProcessNodeId.FINAL_INSPECTION,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'Gen5 high-NA-capable defect inspection. Mandatory above 7nm.',
  },
  {
    equipmentId: 'EQP-SCREEN-MC-300',
    brand: 'SCREEN Holdings',
    modelName: 'MC-300 Advanced Clean',
    nameZh: 'SCREEN MC-300 先進清洗機',
    processType: ProcessType.CLEAN,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 180,
    baseDefectRatePerCm2: 0.0004,
    powerConsumptionKw: 48,
    priceUsd: 26_000_000,
    servesNodeIds: [ProcessNodeId.PRE_PROCESS_CLEAN],
    unlockNode: TechnologyNode.NM_7,
    description: 'Megasonic and batch-clean hybrid. At 7nm, cleaning is the whole ballgame.',
  },
  {
    equipmentId: 'EQP-TEL-TM-300',
    brand: 'Tokyo Electron',
    modelName: 'Trema MC-300 Furnace',
    nameZh: 'TEL Trema MC-300 爐管',
    processType: ProcessType.THERMAL,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 150,
    baseDefectRatePerCm2: 0.001,
    powerConsumptionKw: 130,
    priceUsd: 42_000_000,
    servesNodeIds: [ProcessNodeId.FIELD_OXIDATION, ProcessNodeId.ACTIVATION_ANNEAL],
    unlockNode: TechnologyNode.NM_7,
    description: 'RTP-capable batch anneal. Spike-anneal profiles are how you fix the gate stack.',
  },
  {
    equipmentId: 'EQP-AMAT-TX5000',
    brand: 'Applied Materials',
    modelName: 'ViiSta Haxsea',
    nameZh: 'AMAT ViiSta Haxsea 注入機',
    processType: ProcessType.ION_IMPLANT,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 210,
    baseDefectRatePerCm2: 0.0015,
    powerConsumptionKw: 120,
    priceUsd: 68_000_000,
    servesNodeIds: [
      ProcessNodeId.N_WELL_IMPLANT,
      ProcessNodeId.P_WELL_IMPLANT,
      ProcessNodeId.SOURCE_DRAIN_IMPLANT,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'High-energy angled implant for FinFET and GAA source/drain structures.',
  },
  {
    equipmentId: 'EQP-ASML-EXE5000',
    brand: 'ASML',
    modelName: 'TWINSCAN EXE:5000 High-NA',
    nameZh: 'ASML TWINSCAN EXE:5000 高數值孔徑 EUV',
    processType: ProcessType.LITHOGRAPHY,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 140,
    baseDefectRatePerCm2: 0.006,
    powerConsumptionKw: 340,
    priceUsd: 380_000_000,
    lithoSource: LithoSource.EUV,
    servesNodeIds: [ProcessNodeId.GATE_LITHOGRAPHY, ProcessNodeId.CONTACT_LITHOGRAPHY],
    unlockNode: TechnologyNode.NM_7,
    description: '0.55-NA EUV. The only tool that can print 2nm-class structures at all.',
  },
  {
    equipmentId: 'EQP-LAM-KIYOFX',
    brand: 'Lam Research',
    modelName: 'Kiyo FX',
    nameZh: 'Lam Kiyo FX 刻蝕機',
    processType: ProcessType.ETCHING,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 55,
    baseDefectRatePerCm2: 0.002,
    powerConsumptionKw: 55,
    priceUsd: 32_000_000,
    servesNodeIds: [ProcessNodeId.GATE_ETCH, ProcessNodeId.CONTACT_ETCH],
    unlockNode: TechnologyNode.NM_7,
    description: 'Atomic-precision conductor etch for FinFET and GAA structures.',
  },
  {
    equipmentId: 'EQP-AMAT-SENTURA',
    brand: 'Applied Materials',
    modelName: 'Sentura PVD',
    nameZh: 'AMAT Sentura PVD',
    processType: ProcessType.DEPOSITION,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 65,
    baseDefectRatePerCm2: 0.0012,
    powerConsumptionKw: 95,
    priceUsd: 78_000_000,
    servesNodeIds: [ProcessNodeId.GATE_STACK_DEPOSITION, ProcessNodeId.METAL_INTERCONNECT],
    unlockNode: TechnologyNode.NM_7,
    description: 'Cobalt and ruthenium metallization plus ALD high-k. Where GAA is won.',
  },
  {
    equipmentId: 'EQP-EBARA-500',
    brand: 'Ebara',
    modelName: 'CMP-500 Series',
    nameZh: 'Ebara CMP-500 系列',
    processType: ProcessType.CMP,
    tier: 3,
    mostAdvancedNm: 1.6,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 80,
    baseDefectRatePerCm2: 0.002,
    powerConsumptionKw: 110,
    priceUsd: 62_000_000,
    servesNodeIds: [ProcessNodeId.INTERLAYER_DIELECTRIC],
    unlockNode: TechnologyNode.NM_7,
    description: 'Advanced CMP with copper and low-k slurries. Over-planarization is fatal above 7nm.',
  },
  {
    equipmentId: 'EQP-ASML-EXE5000-ADV',
    brand: 'ASML',
    modelName: 'TWINSCAN EXE:5000 High-NA EUV (Advanced)',
    nameZh: 'ASML TWINSCAN EXE:5000 高NA EUV (進階)',
    processType: ProcessType.LITHOGRAPHY,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 140,
    baseDefectRatePerCm2: 0.006,
    powerConsumptionKw: 340,
    priceUsd: 380_000_000,
    lithoSource: LithoSource.EUV,
    servesNodeIds: [
      ProcessNodeId.GATE_LITHOGRAPHY,
      ProcessNodeId.CONTACT_LITHOGRAPHY,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'High-NA EUV scanner covering every advanced lithography layer from 28nm down to A10.',
  },
  {
    equipmentId: 'EQP-LAM-KIYOEX-ADV',
    brand: 'Lam Research',
    modelName: 'Kiyo EX Conductor Etcher (Advanced)',
    nameZh: 'Lam Research Kiyo EX 導體刻蝕機 (進階)',
    processType: ProcessType.ETCHING,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 16,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 40,
    baseDefectRatePerCm2: 0.006,
    powerConsumptionKw: 52,
    priceUsd: 42_000_000,
    servesNodeIds: [
      ProcessNodeId.GATE_ETCH,
      ProcessNodeId.CONTACT_ETCH,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'Sub-7nm conductor etch for FinFET and GAA device structures.',
  },
  {
    equipmentId: 'EQP-ASM-INTREPID-ADV',
    brand: 'ASM International',
    modelName: 'Intrepid Genesis CVD (Advanced)',
    nameZh: 'ASM Intrepid Genesis CVD (進階)',
    processType: ProcessType.DEPOSITION,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 24,
    baseDefectRatePerCm2: 0.004,
    powerConsumptionKw: 48,
    priceUsd: 9_500_000,
    servesNodeIds: [
      ProcessNodeId.GATE_STACK_DEPOSITION,
      ProcessNodeId.INTERLAYER_DIELECTRIC,
      ProcessNodeId.METAL_INTERCONNECT,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'Single-wafer CVD for advanced-node dielectrics and metal films.',
  },
  {
    equipmentId: 'EQP-AXCELIS-OPTIMA-ADV',
    brand: 'Axcelis',
    modelName: 'Optima XE Implanter (Advanced)',
    nameZh: 'Axcelis Optima XE 離子注入機 (進階)',
    processType: ProcessType.ION_IMPLANT,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 55,
    baseDefectRatePerCm2: 0.004,
    powerConsumptionKw: 50,
    priceUsd: 14_000_000,
    servesNodeIds: [
      ProcessNodeId.N_WELL_IMPLANT,
      ProcessNodeId.P_WELL_IMPLANT,
      ProcessNodeId.SOURCE_DRAIN_IMPLANT,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'High-current and high-energy implant for advanced CMOS wells and source/drain.',
  },
  {
    equipmentId: 'EQP-TEL-VSERIES-ADV',
    brand: 'Tokyo Electron',
    modelName: 'V-Series Vertical Furnace (Advanced)',
    nameZh: 'TEL V-Series 垂直擴散爐 (進階)',
    processType: ProcessType.THERMAL,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 120,
    baseDefectRatePerCm2: 0.003,
    powerConsumptionKw: 80,
    priceUsd: 4_500_000,
    servesNodeIds: [
      ProcessNodeId.FIELD_OXIDATION,
      ProcessNodeId.ACTIVATION_ANNEAL,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'Vertical batch furnace for oxidation and activation anneal at advanced nodes.',
  },
  {
    equipmentId: 'EQP-LAM-SYNDION-ADV',
    brand: 'Lam Research',
    modelName: 'Syndion Clean (Advanced)',
    nameZh: 'Lam Syndion 單晶圓清洗機 (進階)',
    processType: ProcessType.CLEAN,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 16,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 35,
    baseDefectRatePerCm2: 0.0005,
    powerConsumptionKw: 28,
    priceUsd: 7_800_000,
    servesNodeIds: [ProcessNodeId.PRE_PROCESS_CLEAN],
    unlockNode: TechnologyNode.NM_7,
    description: 'Single-wafer wet clean for sub-7nm particle removal.',
  },
  {
    equipmentId: 'EQP-KLA-2910-ADV',
    brand: 'KLA',
    modelName: '2910 Advanced Inspector (Advanced)',
    nameZh: 'KLA 2910 先進晶圓檢測機 (進階)',
    processType: ProcessType.INSPECTION,
    tier: 3,
    mostAdvancedNm: 1.0,
    mostMatureNm: 28,
    supportedWaferSizes: ['WAFER_300MM'],
    throughputWph: 12,
    baseDefectRatePerCm2: 0.0008,
    powerConsumptionKw: 32,
    priceUsd: 12_000_000,
    servesNodeIds: [
      ProcessNodeId.INCOMING_INSPECTION,
      ProcessNodeId.FINAL_INSPECTION,
    ],
    unlockNode: TechnologyNode.NM_7,
    description: 'Advanced e-beam/optical inspection for EUV-patterned wafers.',
  },
]);

// ---------------------------------------------------------------------------
// Catalog lookups
// ---------------------------------------------------------------------------

/** Fast equipment id -> catalog entry lookup. */
export const EQUIPMENT_BY_ID: Readonly<Record<string, EquipmentCatalogEntry>> = deepFreeze(
  Object.fromEntries(EQUIPMENT_CATALOG.map((e) => [e.equipmentId, e])),
);

/** Look up a catalog entry by id. Throws if unknown. */
export function getCatalogEquipment(equipmentId: string): EquipmentCatalogEntry {
  const found = EQUIPMENT_BY_ID[equipmentId];
  if (!found) {
    throw new RangeError(`Unknown equipment id: ${equipmentId}`);
  }
  return found;
}

/**
 * Every catalog platform that can serve a given flow stage.
 *
 * This is the backbone of the router: a stage is serviceable if at least one
 * *owned* tool from this list is available and supports the target node and
 * wafer size.
 */
export function platformsForStage(nodeId: ProcessNodeId): readonly EquipmentCatalogEntry[] {
  return EQUIPMENT_CATALOG.filter((e) => e.servesNodeIds.includes(nodeId));
}

/**
 * The cheapest catalog platform that can serve a stage at a given node.
 *
 * Used by the auto-procurement helper and by the "recommended next purchase"
 * hint in the fab-floor UI.
 */
export function recommendedPlatform(
  nodeId: ProcessNodeId,
  nodeNm: number,
  waferSize: WaferSize,
): EquipmentCatalogEntry | null {
  const candidates = platformsForStage(nodeId).filter(
    (e) =>
      nodeNm >= e.mostAdvancedNm &&
      nodeNm <= e.mostMatureNm &&
      e.supportedWaferSizes.includes(waferSize),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, e) => (e.priceUsd < best.priceUsd ? e : best));
}

/** All catalog platforms that are purchasable once `node` is unlocked. */
export function platformsUnlockedAt(node: TechnologyNode): readonly EquipmentCatalogEntry[] {
  const order = Object.values(TechnologyNode) as TechnologyNode[];
  const rank = order.indexOf(node);
  if (rank < 0) return [];
  return EQUIPMENT_CATALOG.filter((e) => order.indexOf(e.unlockNode) <= rank);
}

/**
 * Coverage check: which flow stages have no purchasable platform.
 *
 * Returns an empty array for a healthy catalog. Used by the domain tests to
 * guarantee the 15-node flow is fully serviceable.
 */
export function uncoveredStages(): readonly ProcessNodeId[] {
  const covered = new Set(EQUIPMENT_CATALOG.flatMap((e) => e.servesNodeIds));
  return Object.values(ProcessNodeId).filter((id) => !covered.has(id));
}

// ---------------------------------------------------------------------------
// Recipe construction from the process flow
// ---------------------------------------------------------------------------

/** Options for {@link buildFlowRecipe}. */
export interface FlowRecipeOptions {
  readonly recipeId: string;
  readonly productName: string;
  readonly category: ComponentCategory;
  readonly targetNode: TechnologyNode;
  readonly waferSize: WaferSize;
  readonly dieSizeMm2: number;
  readonly packaging: PackagingSpec;
  /**
   * Which flow stages to include.
   *
   * Defaults to every stage unlocked at `targetNode`. Pass a shorter list to
   * build a partial flow (for example a mature-node product that skips the
   * copper damascene stage).
   */
  readonly stageNodeIds?: readonly ProcessNodeId[];
  /**
   * Multiplier applied to every stage's cycle time. 1.0 = as specified.
   * Use >1 to model a slower, lower-throughput line.
   */
  readonly cycleTimeMultiplier?: number;
  /**
   * Additive bonus to every stage's yield percentage, in percentage points.
   * Use negative values to model a immature, high-defect line.
   */
  readonly yieldBonusPercent?: number;
}

/**
 * Build a complete {@link ProductRecipe} from the canonical 15-stage flow.
 *
 * The resulting recipe:
 *  - has one `ProcessStep` per flow stage, in flow order;
 *  - carries the flow stage's `processNodeId` so the router and UI can map a
 *    lot's position back onto the fab floor;
 *  - aggregates the materials consumed by the included stages into the
 *    recipe's material list;
 *  - derives `maskCount` from the lithography stages actually present.
 *
 * Stages whose `unlockNode` is beyond `targetNode` are dropped by default.
 */
export function buildFlowRecipe(options: FlowRecipeOptions): ProductRecipe {
  const cycleTimeMultiplier = options.cycleTimeMultiplier ?? 1;
  if (cycleTimeMultiplier <= 0) {
    throw new RangeError('FlowRecipeOptions.cycleTimeMultiplier must be > 0');
  }

  const unlocked = stagesUnlockedAt(options.targetNode);
  const selected = options.stageNodeIds
    ? ORDERED_PROCESS_FLOW.filter((s) => options.stageNodeIds!.includes(s.nodeId))
    : unlocked;

  if (selected.length === 0) {
    throw new RangeError(
      `buildFlowRecipe: no flow stages selected for node ${options.targetNode}`,
    );
  }

  // --- materials: union of everything the selected stages consume ---
  const materialMap = new Map<string, MaterialRequirement>();
  for (const stage of selected) {
    for (const materialId of stage.consumesMaterialIds) {
      const entry = MATERIAL_BY_ID[materialId];
      if (!entry) {
        throw new RangeError(
          `buildFlowRecipe: stage ${stage.nodeId} consumes unknown material '${materialId}'`,
        );
      }
      const existing = materialMap.get(materialId);
      if (existing) {
        // Same material used twice in a flow (e.g. N2 in two thermal steps):
        // the requirement is per-wafer-per-use, so sum the quantities.
        materialMap.set(materialId, {
          ...existing,
          quantityPerWafer: existing.quantityPerWafer + entry.quantityPerWafer,
        });
      } else {
        materialMap.set(materialId, {
          materialId: entry.materialId,
          name: entry.name,
          category: entry.category,
          quantityPerWafer: entry.quantityPerWafer,
          unit: entry.unit,
        });
      }
    }
  }

  // --- process steps ---
  let maskOrdinal = 0;
  const steps: ProcessStep[] = selected.map((stage) => {
    if (stage.usesMask) maskOrdinal += 1;
    return createProcessStep({
      stepId: `S${String(stage.sequence).padStart(2, '0')}_${stage.nodeId}`,
      name: stage.name,
      processType: stage.processType,
      ...(stage.usesMask ? { maskIndex: maskOrdinal } : {}),
      durationMinutes: Math.max(1, Math.round(stage.cycleTimeMinutes * cycleTimeMultiplier)),
      stepDefectDensityPerCm2: stage.defectDensityPerCm2,
      consumesMaterialIds: [...stage.consumesMaterialIds],
      processNodeId: stage.nodeId,
    });
  });

  return createProductRecipe({
    recipeId: options.recipeId,
    productName: options.productName,
    category: options.category,
    targetNode: options.targetNode,
    waferSize: options.waferSize,
    dieSizeMm2: options.dieSizeMm2,
    materials: [...materialMap.values()],
    processSteps: steps,
    packaging: options.packaging,
  });
}

/**
 * The expected wafer survival across a flow built from the given stages.
 *
 * Uses each stage's `yieldPercent` with the optional bonus applied. This is
 * the number the economy uses to price a wafer: the player sees it in the
 * fab-floor UI as "Expected yield".
 */
export function expectedFlowYield(
  stageNodeIds: readonly ProcessNodeId[],
  yieldBonusPercent = 0,
): number {
  let y = 1;
  for (const stage of ORDERED_PROCESS_FLOW) {
    if (!stageNodeIds.includes(stage.nodeId)) continue;
    const pct = Math.min(100, Math.max(0, stage.yieldPercent + yieldBonusPercent));
    y *= pct / 100;
  }
  return y;
}
