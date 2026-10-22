/**
 * Semiconductor Tycoon — Equipment Data Layer (v2.0).
 *
 * Re-exports the complete equipment catalog from the samples layer so that
 * both the backend simulation and the React frontend share a single source of
 * truth for all 24+ machines.
 *
 * Includes: ASML (KrF/ArF/EUV/High-NA EUV scanners), Lam Research (Kiyo FX/EX,
 * Syndion), Tokyo Electron (Certas, V-Series, CELiS), Applied Materials
 * (Centura CVD, Endura PVD, Mirra CMP, VIISta 900XP), ASM International
 * (Intrepid Genesis), Besi (X-Flow, Xceed Hybrid Bonder), DISCO (Dicing Saw),
 * KLA (2130, 2910 Inspector), Axcelis (Optima XE).
 */
export {
  type Equipment,
  type EquipmentInput,
  type NodeRange,
  type MaintenanceStatus,
  createEquipment,
  supportsNode,
  supportsWaferSize,
  isOperational,
  effectiveDefectRatePerCm2,
} from '../domain/equipment.ts';
export {
  ASML_TWINSCAN_NXT_2000I,
  LAM_RESEARCH_KIYO_FX,
  ASML_PAS5500_550,
  LAM_TCP_9400,
  AMAT_CENTURA_CVD,
  AMAT_VIISTA_900XP,
  AMAT_MIRRA_CMP,
  TEL_VSERIES_FURNACE,
  TEL_CELIS_CLEANER,
  KLA_2130_INSPECTOR,
  ASML_EXE_5000_HIGH_NA_EUV,
  BESI_XFLOW_HYBRID_BONDER,
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
  TOOLSET_180NM,
  FLAGSHIP_EQUIPMENT,
  FLAGSHIP_EQUIPMENT_ADVANCED,
  ALL_SAMPLE_EQUIPMENT,
  EQUIPMENT_CATALOG,
} from '../samples/sampleEquipment.ts';