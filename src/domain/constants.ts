import { WaferSize } from './enums.ts';

// ---------------------------------------------------------------------------
// Fab conventions (real-world defaults expressed as game constants)
// ---------------------------------------------------------------------------

export const FAB_CONVENTIONS = Object.freeze({
  /** Wafers per lot — a standard FOUP holds exactly 25 wafers. */
  WAFERS_PER_LOT: 25,
  /** Default wafer-edge exclusion band in mm where no usable die may sit. */
  DEFAULT_EDGE_EXCLUSION_MM: 3,
  /** One shift in hours (for equipment uptime accounting). */
  SHIFT_HOURS: 8,
  /** Maintenance threshold: health below this (%) forces NEEDS_PM. */
  MAINTENANCE_HEALTH_THRESHOLD_PERCENT: 20,
  /** Maintenance threshold: wear above this (%) forces NEEDS_PM. */
  MAINTENANCE_WEAR_THRESHOLD_PERCENT: 80,
  /** Health (%) below which a tool is considered BROKEN. */
  BROKEN_HEALTH_THRESHOLD_PERCENT: 5,
} as const);

// ---------------------------------------------------------------------------
// Wafer geometry
// ---------------------------------------------------------------------------

/** Physical description of a standard wafer size. */
export interface WaferSpec {
  size: WaferSize;
  /** Diameter in mm (150 / 200 / 300). */
  diameterMm: number;
  /** Radius in cm (used for the cm² area that yield models consume). */
  radiusCm: number;
  /** Total surface area in cm². */
  areaCm2: number;
}

const MM_PER_CM = 10;

function makeWaferSpec(size: WaferSize, diameterMm: number): WaferSpec {
  const radiusCm = diameterMm / 2 / MM_PER_CM;
  return Object.freeze({
    size,
    diameterMm,
    radiusCm,
    areaCm2: Math.PI * radiusCm * radiusCm,
  });
}

/** Physical specs for each wafer diameter. */
export const WAFER_SPECS: Readonly<Record<WaferSize, WaferSpec>> = Object.freeze({
  WAFER_150MM: makeWaferSpec('WAFER_150MM', 150),
  WAFER_200MM: makeWaferSpec('WAFER_200MM', 200),
  WAFER_300MM: makeWaferSpec('WAFER_300MM', 300),
});

/** Surface area in cm² for a wafer size (yield models consume cm²). */
export function waferAreaCm2(size: WaferSize): number {
  return WAFER_SPECS[size].areaCm2;
}

/** Diameter in mm for a wafer size. */
export function waferDiameterMm(size: WaferSize): number {
  return WAFER_SPECS[size].diameterMm;
}

// ---------------------------------------------------------------------------
// Real-world equipment vendor catalog (used for brand validation & flavor)
// ---------------------------------------------------------------------------

/** Recognized equipment/material vendors (real companies). */
export const KNOWN_BRANDS = Object.freeze([
  'ASML',
  'Nikon',
  'Canon',
  'Lam Research',
  'Applied Materials',
  'Tokyo Electron',
  'KLA',
  'Axcelis',
  'Ebara',
  'SCREEN Holdings',
  'Kokusai Electric',
  'Kulicke & Soffa',
  'ASMPT',
  'Besi',
  'Murata',
  'Samsung Electro-Mechanics',
  'Taiyo Yuden',
  'TSMC',
  'Intel',
  'GlobalFoundries',
  'UMC',
  'SK hynix',
  'Micron',
  'ASE Technology',
  'Foxconn',
] as const);

export type KnownBrand = (typeof KNOWN_BRANDS)[number];

/** True if the brand is one of the recognized real-world vendors. */
export function isKnownBrand(brand: string): brand is KnownBrand {
  return (KNOWN_BRANDS as readonly string[]).includes(brand);
}
