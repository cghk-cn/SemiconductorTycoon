import { LithoSource, ProcessType } from '../domain/enums.ts';
import { createEquipment, type Equipment } from '../domain/equipment.ts';

// ---------------------------------------------------------------------------
// Flagship reference machines (as briefed) — advanced-node showroom pieces
// ---------------------------------------------------------------------------

/**
 * ASML TWINSCAN NXT:2000i — 193nm immersion (ArF-i) DUV scanner.
 * Workhorse of the 90nm → 7nm era (TSMC/Intel/Samsung logic lines).
 */
export const ASML_TWINSCAN_NXT_2000I: Equipment = createEquipment({
  id: 'EQ-LITHO-ASML-NXT2000I',
  brand: 'ASML',
  modelName: 'TWINSCAN NXT:2000i',
  processType: ProcessType.LITHOGRAPHY,
  lithoSource: LithoSource.ARF_IMMERSION,
  supportedNodes: { mostAdvancedNm: 7, mostMatureNm: 90 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 275,
  baseDefectRatePerCm2: 0.008,
  powerConsumptionKw: 170,
  priceUsd: 180_000_000,
  maintenance: { healthPercent: 96, wearPercent: 8, hoursSinceLastPm: 320 },
});

/**
 * Lam Research Kiyo FX — conductor etch (real Kiyo product line).
 * Targets the 28nm → 7nm FinFET era.
 */
export const LAM_RESEARCH_KIYO_FX: Equipment = createEquipment({
  id: 'EQ-ETCH-LAM-KIYOFX',
  brand: 'Lam Research',
  modelName: 'Kiyo FX',
  processType: ProcessType.ETCHING,
  supportedNodes: { mostAdvancedNm: 7, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 55,
  baseDefectRatePerCm2: 0.007,
  powerConsumptionKw: 45,
  priceUsd: 32_000_000,
  maintenance: { healthPercent: 92, wearPercent: 15, hoursSinceLastPm: 540 },
});

// ---------------------------------------------------------------------------
// Complete 180nm-era toolset (runs the retro GPU demo end-to-end)
// ---------------------------------------------------------------------------

/** ASML PAS 5500/550 — KrF (248nm) step-and-scan, the 180nm-era workhorse. */
export const ASML_PAS5500_550: Equipment = createEquipment({
  id: 'EQ-LITHO-ASML-P5500',
  brand: 'ASML',
  modelName: 'PAS 5500/550 KrF Scanner',
  processType: ProcessType.LITHOGRAPHY,
  lithoSource: LithoSource.KRF,
  supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_200MM'],
  throughputWph: 165,
  baseDefectRatePerCm2: 0.008,
  powerConsumptionKw: 85,
  priceUsd: 12_000_000,
  maintenance: { healthPercent: 90, wearPercent: 18, hoursSinceLastPm: 210 },
});

/** Lam Research TCP 9400 — transformer-coupled-plasma etcher (180nm era). */
export const LAM_TCP_9400: Equipment = createEquipment({
  id: 'EQ-ETCH-LAM-TCP9400',
  brand: 'Lam Research',
  modelName: 'TCP 9400',
  processType: ProcessType.ETCHING,
  supportedNodes: { mostAdvancedNm: 180, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_200MM'],
  throughputWph: 45,
  baseDefectRatePerCm2: 0.006,
  powerConsumptionKw: 35,
  priceUsd: 6_500_000,
  maintenance: { healthPercent: 88, wearPercent: 22, hoursSinceLastPm: 300 },
});

/** Applied Materials Centura — multi-chamber CVD platform (prompt example). */
export const AMAT_CENTURA_CVD: Equipment = createEquipment({
  id: 'EQ-DEPO-AMAT-CENTURA',
  brand: 'Applied Materials',
  modelName: 'Centura CVD',
  processType: ProcessType.DEPOSITION,
  supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
  throughputWph: 28,
  baseDefectRatePerCm2: 0.005,
  powerConsumptionKw: 55,
  priceUsd: 7_000_000,
  maintenance: { healthPercent: 91, wearPercent: 16, hoursSinceLastPm: 260 },
});

/** Applied Materials VIISta 900XP — medium-current ion implanter. */
export const AMAT_VIISTA_900XP: Equipment = createEquipment({
  id: 'EQ-IMPL-AMAT-VIISTA900',
  brand: 'Applied Materials',
  modelName: 'VIISta 900XP',
  processType: ProcessType.ION_IMPLANT,
  supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
  throughputWph: 60,
  baseDefectRatePerCm2: 0.004,
  powerConsumptionKw: 48,
  priceUsd: 8_500_000,
  maintenance: { healthPercent: 87, wearPercent: 25, hoursSinceLastPm: 340 },
});

/** Applied Materials Mirra — 200mm CMP planarizer (metal / dielectric). */
export const AMAT_MIRRA_CMP: Equipment = createEquipment({
  id: 'EQ-CMP-AMAT-MIRRA',
  brand: 'Applied Materials',
  modelName: 'Mirra',
  processType: ProcessType.CMP,
  supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
  throughputWph: 35,
  baseDefectRatePerCm2: 0.008,
  powerConsumptionKw: 60,
  priceUsd: 7_500_000,
  maintenance: { healthPercent: 85, wearPercent: 30, hoursSinceLastPm: 280 },
});

/** Tokyo Electron V-Series — vertical batch furnace (oxidation / anneal). */
export const TEL_VSERIES_FURNACE: Equipment = createEquipment({
  id: 'EQ-THERM-TEL-VSERIES',
  brand: 'Tokyo Electron',
  modelName: 'V-Series Vertical Furnace',
  processType: ProcessType.THERMAL,
  supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
  throughputWph: 120, // batch tool: 50-wafer boats amortize to high effective wph
  baseDefectRatePerCm2: 0.003,
  powerConsumptionKw: 80,
  priceUsd: 4_500_000,
  maintenance: { healthPercent: 93, wearPercent: 12, hoursSinceLastPm: 180 },
});

/** Tokyo Electron CELiS — single-wafer wet clean (resist strip / particle clean).
 *  Modeled as near-zero defect contribution (we do not yet model net-negative
 *  defect removal, i.e. cleaners improving D0). */
export const TEL_CELIS_CLEANER: Equipment = createEquipment({
  id: 'EQ-CLEAN-TEL-CELIS',
  brand: 'Tokyo Electron',
  modelName: 'CELiS SC Series',
  processType: ProcessType.CLEAN,
  supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
  throughputWph: 90,
  baseDefectRatePerCm2: 0.001,
  powerConsumptionKw: 25,
  priceUsd: 3_200_000,
  maintenance: { healthPercent: 94, wearPercent: 10, hoursSinceLastPm: 150 },
});

/** KLA 2130 — broadband patterned-wafer inspection (defect review). */
export const KLA_2130_INSPECTOR: Equipment = createEquipment({
  id: 'EQ-INSP-KLA-2130',
  brand: 'KLA',
  modelName: '2130 Inspection System',
  processType: ProcessType.INSPECTION,
  supportedNodes: { mostAdvancedNm: 90, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
  throughputWph: 20,
  baseDefectRatePerCm2: 0.001,
  powerConsumptionKw: 20,
  priceUsd: 5_000_000,
  maintenance: { healthPercent: 95, wearPercent: 8, hoursSinceLastPm: 220 },
});

/**
 * ASML TWINSCAN EXE:5000 — High-NA EUV scanner (0.55 NA, ~8 nm resolution).
 * Required to manufacture 2nm and A16 (GAA/CFET) logic. Extreme CapEX and
 * power draw; the flagship tool of the angstrom era.
 */
export const ASML_EXE_5000_HIGH_NA_EUV: Equipment = createEquipment({
  id: 'EQ-LITHO-ASML-EXE5000',
  brand: 'ASML',
  modelName: 'TWINSCAN EXE:5000 High-NA EUV',
  processType: ProcessType.LITHOGRAPHY,
  lithoSource: LithoSource.EUV,
  supportedNodes: { mostAdvancedNm: 1.6, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 140,
  baseDefectRatePerCm2: 0.006,
  powerConsumptionKw: 340,
  priceUsd: 380_000_000,
  maintenance: { healthPercent: 94, wearPercent: 6, hoursSinceLastPm: 180 },
});

/**
 * Besi X-Flow — dies-to-wafer / wafer-to-wafer hybrid copper bonding system
 * for CoWoS and 3D-stacked packages (HBM on silicon interposer).
 */
export const BESI_XFLOW_HYBRID_BONDER: Equipment = createEquipment({
  id: 'EQ-PACK-BESI-XFLOW',
  brand: 'Besi',
  modelName: 'X-Flow Hybrid Bonder',
  processType: ProcessType.PACKAGING,
  supportedNodes: { mostAdvancedNm: 1.6, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 60,
  baseDefectRatePerCm2: 0.002,
  powerConsumptionKw: 22,
  priceUsd: 45_000_000,
  maintenance: { healthPercent: 95, wearPercent: 4, hoursSinceLastPm: 400 },
});

/**
 * The complete 180nm-era toolset keyed by process type. Dispatch every step of
 * the retro-GPU pipeline against this map.
 */
export const TOOLSET_180NM: Readonly<Record<string, Equipment>> = Object.freeze({
  [ProcessType.LITHOGRAPHY]: ASML_PAS5500_550,
  [ProcessType.ETCHING]: LAM_TCP_9400,
  [ProcessType.DEPOSITION]: AMAT_CENTURA_CVD,
  [ProcessType.ION_IMPLANT]: AMAT_VIISTA_900XP,
  [ProcessType.CMP]: AMAT_MIRRA_CMP,
  [ProcessType.THERMAL]: TEL_VSERIES_FURNACE,
  [ProcessType.CLEAN]: TEL_CELIS_CLEANER,
  [ProcessType.INSPECTION]: KLA_2130_INSPECTOR,
});

/** The two flagship showroom machines from the design brief. */
export const FLAGSHIP_EQUIPMENT: readonly Equipment[] = Object.freeze([
  ASML_TWINSCAN_NXT_2000I,
  LAM_RESEARCH_KIYO_FX,
]);

/** Every equipment fixture defined in this module. */
export const ALL_SAMPLE_EQUIPMENT: readonly Equipment[] = Object.freeze([
  ASML_TWINSCAN_NXT_2000I,
  LAM_RESEARCH_KIYO_FX,
  ASML_EXE_5000_HIGH_NA_EUV,
  BESI_XFLOW_HYBRID_BONDER,
  ...Object.values(TOOLSET_180NM),
]);

// ============================================================================
// Advanced-node equipment expansion (300mm, sub-28nm capability).
// Supports the 17-node tech tree from 350nm down to A10.
// ============================================================================


/** ASML TWINSCAN XT:1900i — 193nm ArF (dry) DUV scanner, 28nm→90nm workhorse. */
export const ASML_TWINSCAN_XT_1900I: Equipment = createEquipment({
  id: 'EQ-LITHO-ASML-TWINSCAN-XT',
  brand: 'ASML',
  modelName: 'TWINSCAN XT:1900i',
  processType: ProcessType.LITHOGRAPHY,
  lithoSource: LithoSource.ARF_DRY,
  supportedNodes: { mostAdvancedNm: 28, mostMatureNm: 90 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 185,
  baseDefectRatePerCm2: 0.009,
  powerConsumptionKw: 95,
  priceUsd: 85_000_000,
  maintenance: { healthPercent: 94, wearPercent: 10, hoursSinceLastPm: 280 },
});

/** ASML NXE:3600D — 13.5nm EUV scanner, 7nm→2nm production tool. */
export const ASML_NXE_3600D_EUV: Equipment = createEquipment({
  id: 'EQ-LITHO-ASML-NXE3600D',
  brand: 'ASML',
  modelName: 'NXE:3600D EUV',
  processType: ProcessType.LITHOGRAPHY,
  lithoSource: LithoSource.EUV,
  supportedNodes: { mostAdvancedNm: 2, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 115,
  baseDefectRatePerCm2: 0.005,
  powerConsumptionKw: 290,
  priceUsd: 320_000_000,
  maintenance: { healthPercent: 93, wearPercent: 7, hoursSinceLastPm: 200 },
});

/** Lam Research Kiyo EX — conductor etch, sub-7nm FinFET/GAA capability. */
export const LAM_RESEARCH_KIYO_EX: Equipment = createEquipment({
  id: 'EQ-ETCH-LAM-KIYOEX',
  brand: 'Lam Research',
  modelName: 'Kiyo EX',
  processType: ProcessType.ETCHING,
  supportedNodes: { mostAdvancedNm: 2, mostMatureNm: 16 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 40,
  baseDefectRatePerCm2: 0.006,
  powerConsumptionKw: 52,
  priceUsd: 42_000_000,
  maintenance: { healthPercent: 91, wearPercent: 14, hoursSinceLastPm: 420 },
});

/** Tokyo Electron Certas XP — dielectric etch, 28nm→7nm. */
export const TEL_CERTAS_XP: Equipment = createEquipment({
  id: 'EQ-ETCH-TEL-CERTAS',
  brand: 'Tokyo Electron',
  modelName: 'Certas XP',
  processType: ProcessType.ETCHING,
  supportedNodes: { mostAdvancedNm: 7, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 48,
  baseDefectRatePerCm2: 0.005,
  powerConsumptionKw: 38,
  priceUsd: 28_000_000,
  maintenance: { healthPercent: 90, wearPercent: 16, hoursSinceLastPm: 360 },
});

/** Tokyo Electron Certas XP — dielectric etch, 28nm→7nm. */
/** Applied Materials Endura PVD — metal sputtering, 200mm/300mm. */
export const AMAT_ENDURA_PVD: Equipment = createEquipment({
  id: 'EQ-DEPO-AMAT-ENDURA-PVD',
  brand: 'Applied Materials',
  modelName: 'Endura PVD',
  processType: ProcessType.DEPOSITION,
  supportedNodes: { mostAdvancedNm: 28, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
  throughputWph: 32,
  baseDefectRatePerCm2: 0.006,
  powerConsumptionKw: 42,
  priceUsd: 6_200_000,
  maintenance: { healthPercent: 89, wearPercent: 18, hoursSinceLastPm: 250 },
});

/** ASM Intrepid Genesis — single-wafer CVD, advanced-node dielectrics. */
export const ASM_INTREPID_CVD: Equipment = createEquipment({
  id: 'EQ-DEPO-ASM-INTREPID',
  brand: 'ASM International',
  modelName: 'Intrepid Genesis',
  processType: ProcessType.DEPOSITION,
  supportedNodes: { mostAdvancedNm: 7, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 24,
  baseDefectRatePerCm2: 0.004,
  powerConsumptionKw: 48,
  priceUsd: 9_500_000,
  maintenance: { healthPercent: 92, wearPercent: 12, hoursSinceLastPm: 300 },
});

/** Besi Xceed — hybrid copper bonder for advanced 2.5D/3D packaging. */
export const BESI_XCEED_HYBRID_BONDER: Equipment = createEquipment({
  id: 'EQ-PACK-BESI-XCEED',
  brand: 'Besi',
  modelName: 'Xceed Hybrid Bonder',
  processType: ProcessType.PACKAGING,
  supportedNodes: { mostAdvancedNm: 1.6, mostMatureNm: 16 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 45,
  baseDefectRatePerCm2: 0.002,
  powerConsumptionKw: 26,
  priceUsd: 55_000_000,
  maintenance: { healthPercent: 94, wearPercent: 5, hoursSinceLastPm: 380 },
});

/** DISCO Dicing Saw — back-end wafer dicing / singulation. */
export const DISCO_DICING_SAW: Equipment = createEquipment({
  id: 'EQ-PACK-DISCO-DICING',
  brand: 'DISCO',
  modelName: 'DAD 3351 Dicing Saw',
  processType: ProcessType.PACKAGING,
  supportedNodes: { mostAdvancedNm: 1.6, mostMatureNm: 350 },
  supportedWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
  throughputWph: 150,
  baseDefectRatePerCm2: 0.001,
  powerConsumptionKw: 18,
  priceUsd: 3_800_000,
  maintenance: { healthPercent: 96, wearPercent: 6, hoursSinceLastPm: 120 },
});

/** Lam Research Syndion — single-wafer clean for sub-7nm particles. */
export const LAM_SYNDION_CLEAN: Equipment = createEquipment({
  id: 'EQ-CLEAN-LAM-SYNDION',
  brand: 'Lam Research',
  modelName: 'Syndion Clean',
  processType: ProcessType.CLEAN,
  supportedNodes: { mostAdvancedNm: 2, mostMatureNm: 16 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 35,
  baseDefectRatePerCm2: 0.0005,
  powerConsumptionKw: 28,
  priceUsd: 7_800_000,
  maintenance: { healthPercent: 95, wearPercent: 7, hoursSinceLastPm: 180 },
});

/** KLA 2910 — advanced patterned-wafer inspection for EUV layers. */
export const KLA_2910_INSPECTOR: Equipment = createEquipment({
  id: 'EQ-INSP-KLA-2910',
  brand: 'KLA',
  modelName: '2910 Advanced Inspector',
  processType: ProcessType.INSPECTION,
  supportedNodes: { mostAdvancedNm: 2, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 12,
  baseDefectRatePerCm2: 0.0008,
  powerConsumptionKw: 32,
  priceUsd: 12_000_000,
  maintenance: { healthPercent: 93, wearPercent: 9, hoursSinceLastPm: 260 },
});

/** Axcelis Optima XE — high-current ion implanter, 28nm→7nm. */
export const AXCELIS_OPTIMA_XE: Equipment = createEquipment({
  id: 'EQ-IMPL-AXCELIS-OPTIMA',
  brand: 'Axcelis',
  modelName: 'Optima XE',
  processType: ProcessType.ION_IMPLANT,
  supportedNodes: { mostAdvancedNm: 7, mostMatureNm: 28 },
  supportedWaferSizes: ['WAFER_300MM'],
  throughputWph: 55,
  baseDefectRatePerCm2: 0.004,
  powerConsumptionKw: 50,
  priceUsd: 14_000_000,
  maintenance: { healthPercent: 89, wearPercent: 18, hoursSinceLastPm: 320 },
});

/** Advanced-node flagship equipment showcase. */
export const FLAGSHIP_EQUIPMENT_ADVANCED: readonly Equipment[] = Object.freeze([
  ASML_NXE_3600D_EUV,
  LAM_RESEARCH_KIYO_EX,
  BESI_XCEED_HYBRID_BONDER,
]);

/** Complete catalog — every sample equipment definition. */
export const EQUIPMENT_CATALOG: readonly Equipment[] = Object.freeze([
  ...ALL_SAMPLE_EQUIPMENT,
  ASML_TWINSCAN_XT_1900I,
  ASML_NXE_3600D_EUV,
  LAM_RESEARCH_KIYO_EX,
  TEL_CERTAS_XP,
  AMAT_ENDURA_PVD,
  ASM_INTREPID_CVD,
  BESI_XCEED_HYBRID_BONDER,
  DISCO_DICING_SAW,
  LAM_SYNDION_CLEAN,
  KLA_2910_INSPECTOR,
  AXCELIS_OPTIMA_XE,
]);
