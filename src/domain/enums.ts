/**
 * Core enumerations & const-union types for Semiconductor Tycoon.
 *
 * NOTE ON STYLE: We model "enums" as frozen const objects plus derived union
 * types rather than TypeScript `enum` declarations. This is deliberate:
 *  - it keeps the code compatible with Node's native type-stripping runtime
 *    (`erasableSyntaxOnly`), so no build step is required to run/test,
 *  - it gives us real value-level objects (iterable, indexable) at runtime,
 *  - it preserves full literal-type narrowing in the type system.
 */

// ---------------------------------------------------------------------------
// Process (front-end / back-end) steps
// ---------------------------------------------------------------------------

/** The physical/chemical process a piece of fab equipment performs. */
export const ProcessType = {
  /** 微影 - pattern transfer via photoresist + exposure (ASML, Nikon, Canon). */
  LITHOGRAPHY: 'LITHOGRAPHY',
  /** 刻蝕 - selective material removal (Lam Research, TEL, Applied). */
  ETCHING: 'ETCHING',
  /** 薄膜沉積 - thin-film growth: CVD, PVD, ALD (Applied, Lam, TEL). */
  DEPOSITION: 'DEPOSITION',
  /** 化學機械研磨 - planarization between metal layers (Applied, Ebara). */
  CMP: 'CMP',
  /** 離子注入 - dopant implantation (Applied, Axcelis). */
  ION_IMPLANT: 'ION_IMPLANT',
  /** 熱製程 - oxidation / anneal / diffusion furnaces (TEL, Kokusai). */
  THERMAL: 'THERMAL',
  /** 清洗 - wafer cleaning / surface prep (TEL, SCREEN, Lam). */
  CLEAN: 'CLEAN',
  /** 封裝測試 - back-end assembly & test (K&S, ASMPT, Besi). */
  PACKAGING: 'PACKAGING',
  /** 被動元件燒結 - MLCC stacking & sintering (Murata, Samsung EM). */
  PASSIVE_SINTERING: 'PASSIVE_SINTERING',
  /** 晶圓檢測 - e-beam/optical inspection & metrology (KLA, Hitachi). */
  INSPECTION: 'INSPECTION',
} as const;
export type ProcessType = (typeof ProcessType)[keyof typeof ProcessType];

// ---------------------------------------------------------------------------
// Technology node
// ---------------------------------------------------------------------------

/**
 * Technology nodes (design rules). Ordering by physical feature size is
 * INVERTED vs. "advanced-ness": a smaller number is a more advanced node.
 * Use the NODE_SPECS metadata table for rank / year / cost, not string order.
 */
export const TechnologyNode = {
  NM_350: '350nm',
  NM_250: '250nm',
  NM_180: '180nm',
  NM_130: '130nm',
  NM_90: '90nm',
  NM_65: '65nm',
  NM_45: '45nm',
  NM_28: '28nm',
  NM_16_FINFET: '16nm_finfet',
  NM_7: '7nm',
  NM_5: '5nm',
  NM_3: '3nm',
  NM_2_GAA: '2nm_gaa',
  NM_2: '2nm',
  /** Intel/TSMC-class angstrom node (GAA / CFET), beyond 2nm. */
  NM_A16: 'A16',
  NM_A16_CFET: 'a16_cfet',
  NM_A10: 'a10',
} as const;
export type TechnologyNode = (typeof TechnologyNode)[keyof typeof TechnologyNode];

// ---------------------------------------------------------------------------
// Wafer size
// ---------------------------------------------------------------------------

/** Standard silicon wafer diameters. */
export const WaferSize = {
  WAFER_150MM: 'WAFER_150MM', // 6 inch
  WAFER_200MM: 'WAFER_200MM', // 8 inch
  WAFER_300MM: 'WAFER_300MM', // 12 inch
} as const;
export type WaferSize = (typeof WaferSize)[keyof typeof WaferSize];

// ---------------------------------------------------------------------------
// Component category (what the fab sells)
// ---------------------------------------------------------------------------

/** Product categories the factory can manufacture. */
export const ComponentCategory = {
  GPU: 'GPU',
  CPU: 'CPU',
  SSD_NAND: 'SSD_NAND',
  LOGIC_SOC: 'LOGIC_SOC',
  MLCC: 'MLCC',
  AUTOMOTIVE_MCU: 'AUTOMOTIVE_MCU',
  POWER_SIC: 'POWER_SIC',
} as const;
export type ComponentCategory = (typeof ComponentCategory)[keyof typeof ComponentCategory];

// ---------------------------------------------------------------------------
// Lot (in-flight wafer batch) status
// ---------------------------------------------------------------------------

export const LotStatus = {
  /** Currently being processed on a machine. */
  IN_PROCESS: 'IN_PROCESS',
  /** Finished a step, queued for the next machine. */
  WAITING_NEXT_MACHINE: 'WAITING_NEXT_MACHINE',
  /** Ran through every recipe step successfully. */
  COMPLETED: 'COMPLETED',
  /** Killed (fatal defect / abort). Not sellable. */
  SCRAPPED: 'SCRAPPED',
} as const;
export type LotStatus = (typeof LotStatus)[keyof typeof LotStatus];

// ---------------------------------------------------------------------------
// Equipment maintenance / health state
// ---------------------------------------------------------------------------

/** Discrete maintenance lifecycle state derived from wear/health. */
export const MaintenanceState = {
  IDLE: 'IDLE',
  RUNNING: 'RUNNING',
  /** Preventive-maintenance window - machine down. */
  MAINTENANCE: 'MAINTENANCE',
  /** Health below threshold - must PM before next use. */
  NEEDS_PM: 'NEEDS_PM',
  /** Unrepairable this shift - hard down. */
  BROKEN: 'BROKEN',
} as const;
export type MaintenanceState = (typeof MaintenanceState)[keyof typeof MaintenanceState];

// ---------------------------------------------------------------------------
// Packaging type
// ---------------------------------------------------------------------------

/** Back-end package / assembly technologies. */
export const PackagingType = {
  QFP: 'QFP', // quad flat package (leads on all sides)
  QFN: 'QFN', // quad flat no-lead
  BGA: 'BGA', // ball grid array
  FCBGA: 'FCBGA', // flip-chip BGA
  /** 2.5D interposer (TSMC CoWoS) - die + silicon interposer on substrate. */
  INTERPOSER_2_5D_COWOS: 'INTERPOSER_2_5D_COWOS',
  /** 3D stacked-die (HBM-style) - dies stacked with TSVs. */
  STACKED_3D_TSV: 'STACKED_3D_TSV',
  /** Discrete / leadless chip carrier for passive or simple parts. */
  DISCRETE: 'DISCRETE',
} as const;
export type PackagingType = (typeof PackagingType)[keyof typeof PackagingType];

// ---------------------------------------------------------------------------
// Material categories (consumables / inputs)
// ---------------------------------------------------------------------------

export const MaterialCategory = {
  WAFER_SUBSTRATE: 'WAFER_SUBSTRATE', // bare silicon / SiC wafers
  PHOTORESIST: 'PHOTORESIST', // chemical resist (KrF / ArF / EUV)
  PHOTO_MASK: 'PHOTO_MASK', // reticle / mask set
  TARGET_METAL: 'TARGET_METAL', // sputtering targets (Cu, Al, Co...)
  PRECURSOR_GAS: 'PRECURSOR_GAS', // CVD/ALD precursors & reactant gases
  CVD_PRECURSOR: 'CVD_PRECURSOR', // liquid/solid film precursors
  CMP_SLURRY: 'CMP_SLURRY', // polish slurry & pads
  IMPLANT_DOPANT: 'IMPLANT_DOPANT', // BF3, PH3, AsH3...
  SUBSTRATE_PACKAGE: 'SUBSTRATE_PACKAGE', // organic package substrate / interposer
  DIE_ATTACH: 'DIE_ATTACH', // epoxy, solder, underfill
  LEADFRAME: 'LEADFRAME', // leadframe / bond wire (Au, Cu)
  RECLAIMABLE: 'RECLAIMABLE', // consumables partly reclaimed
} as const;
export type MaterialCategory = (typeof MaterialCategory)[keyof typeof MaterialCategory];

// ---------------------------------------------------------------------------
// Lithography light source (drives which node a scanner can reach)
// ---------------------------------------------------------------------------

export const LithoSource = {
  I_LINE: 'I_LINE', // 365 nm
  KRF: 'KRF', // 248 nm
  ARF_DRY: 'ARF_DRY', // 193 nm dry
  ARF_IMMERSION: 'ARF_IMMERSION', // 193 nm immersion (water)
  EUV: 'EUV', // 13.5 nm extreme ultraviolet
} as const;
export type LithoSource = (typeof LithoSource)[keyof typeof LithoSource];


