/**
 * Economy enumerations (Step 3).
 *
 * Same style as the rest of the codebase: frozen const objects + derived union
 * types, so the code stays erasable and runs on Node with no build step.
 */

/**
 * The phase of the semiconductor business cycle.
 *
 * The industry is famously cyclical: capacity built at the peak is stranded
 * at the trough, so prices swing far more than end-demand does.
 */
export const MarketPhase = {
  /** Demand collapses, inventories full, ASPs crater, defaults rise. */
  DOWNTURN: 'DOWNTURN',
  /** Inventories cleared, orders start trickling back. */
  RECOVERY: 'RECOVERY',
  /** Demand normal, capacity tightens, pricing stabilises. */
  EXPANSION: 'EXPANSION',
  /** "AI supercycle": AI accelerators / HBM / SiC demand explodes, prices double. */
  BOOM: 'BOOM',
  /** The classic peak: shortages, record ASPs, everyone builds capacity. */
  PEAK: 'PEAK',
} as const;
export type MarketPhase = (typeof MarketPhase)[keyof typeof MarketPhase];

/** Lifecycle of a B2B contract. */
export const ContractStatus = {
  /** Published on the contract board, not yet accepted. */
  OFFERED: 'OFFERED',
  /** Player accepted it; fab is committed to the schedule. */
  ACCEPTED: 'ACCEPTED',
  /** In production / partially shipped. */
  IN_PRODUCTION: 'IN_PRODUCTION',
  /** All lots delivered and paid. */
  SETTLED: 'SETTLED',
  /** Delivered late, short, or out of spec — penalties applied. */
  BREACHED: 'BREACHED',
  /** Cancelled by the player or the client. */
  CANCELLED: 'CANCELLED',
} as const;
export type ContractStatus = (typeof ContractStatus)[keyof typeof ContractStatus];

/** Categories of money flowing through the financial ledger. */
export const LedgerCategory = {
  /** Cash in from a customer shipment. */
  REVENUE: 'REVENUE',
  /** Raw materials (wafers, resist, targets, gases) consumed. */
  MATERIALS: 'MATERIALS',
  /** Power, salaries, gases, cleanroom upkeep — recurring. */
  OPEX: 'OPEX',
  /** Electricity consumed by the tool base. */
  POWER: 'POWER',
  /** Equipment, fab expansion — one-off capital purchases. */
  CAPEX: 'CAPEX',
  /** Depreciation of capital assets. */
  DEPRECIATION: 'DEPRECIATION',
  /** Liquidated damages / late penalties. */
  PENALTY: 'PENALTY',
  /** Packaging, OSAT assembly, test, freight. */
  BACKEND: 'BACKEND',
  /** Borrowing or equity injection. */
  FINANCING: 'FINANCING',
} as const;
export type LedgerCategory = (typeof LedgerCategory)[keyof typeof LedgerCategory];

/** Client tier — drives which contracts a customer is allowed to place. */
export const ClientTier = {
  /** Small PC brand / boutique OEM: low volume, lenient terms. */
  STARTUP: 'STARTUP',
  /** Regional Tier-1 automotive supplier. */
  TIER1: 'TIER1',
  /** Hyperscale AI / cloud giant: huge volume, brutal quality gates. */
  HYPERSCALE: 'HYPERSCALE',
} as const;
export type ClientTier = (typeof ClientTier)[keyof typeof ClientTier];

/** Quality grade awarded to a shipment, driving the reputation delta. */
export const ShipmentGrade = {
  /** Met every gate with margin to spare. */
  EXEMPLARY: 'EXEMPLARY',
  /** Met every gate exactly. */
  ON_SPEC: 'ON_SPEC',
  /** Delivered, but yield was marginal. */
  MARGINAL: 'MARGINAL',
  /** Late delivery. */
  LATE: 'LATE',
  /** Short on good dies. */
  SHORT: 'SHORT',
  /** Failed the defect-density gate outright. */
  REJECTED: 'REJECTED',
} as const;
export type ShipmentGrade = (typeof ShipmentGrade)[keyof typeof ShipmentGrade];
