export interface Status {
  date: string; // e.g. "2024-08"
  cash: number;
  reputation: number;
  stage: "startup" | "growth" | "massProduction" | "exit";
}

export interface Financials {
  revenue: number;
  materials: number;
  opex: number;
  depreciation: number;
  netProfit: number;
  cash: number;
  assets: number;
  liabilities: number;
}

// ---------------------------------------------------------------------
// Equipment roles (7 categories)
// ---------------------------------------------------------------------

export type RoleCategory =
  | "litho"
  | "etch"
  | "depo"
  | "implant"
  | "clean"
  | "insp"
  | "pack";

export interface EquipmentRoleSpec {
  roleCategory: RoleCategory;
  roleDescription: string;
}

export interface Equipment {
  id: string;
  name: string;
  category: "fab" | "tool";
  priceUsd: number;
  health?: number; // 0‑100 %
  roleCategory?: RoleCategory;
  roleDescription?: string;
  processType?: string;
  brand?: string;
  supportedNodes?: string;
  throughputWph?: number;
  powerKw?: number;
  materialCostPerWafer?: number;
  mtbfHours?: number;
  description?: string;
}

// ---------------------------------------------------------------------
// Inventory dock – equipment bought but not yet deployed to a fab
// ---------------------------------------------------------------------

export interface InventoryMachine {
  instanceId: string;
  equipmentId: string;
  name: string;
  roleCategory: RoleCategory;
  health: number;
  level: number; // equipment mastery level (0 = base)
}

// ---------------------------------------------------------------------
// Fab bay (multi-fab structure)
// ---------------------------------------------------------------------

export interface FabSlot {
  index: number;
  machineInstanceId: string | null;
}

export interface FabBay {
  id: string;
  name: string;
  unlocked: boolean;
  unlockCostUsd: number;
  unlockRequirementNode: string | null; // tech node id required
  unlockRequirementYield: number | null; // min yield % required
  maxSlots: number;
  maxPerCategory: number;
  yieldBonusPercent: number; // fab clean-room bonus (+0, +5, +10, +15)
  slots: FabSlot[];
}

// ---------------------------------------------------------------------
// Fab diagnostics (synergy & bottleneck calculation output)
// ---------------------------------------------------------------------

export type FabLineState =
  | "NO_LITHO"
  | "INCOMPLETE_LINE"
  | "COMPLETE_LINE"
  | "GOLDEN_SYNERGY";

export interface FabDiagnostics {
  fabId: string;
  lineState: FabLineState;
  completenessMultiplier: number;
  bottleneckMultiplier: number;
  grossDiesPerSecond: number;
  yieldPercent: number;
  goodDiesPerSecond: number;
  scrapDiesPerSecond: number;
  diagnosisMessage: string;
  counts: Record<RoleCategory, number>;
}

// ---------------------------------------------------------------------
// Tech node with yield breakthrough chain
// ---------------------------------------------------------------------

export interface TechNode {
  id: string;
  name: string; // e.g. "7nm", "A16"
  costUsd: number;
  level: number; // 0 = locked, 1 = researching, 2 = unlocked
  yieldPercent: number; // 40-100 (base yield for this node)
  yieldLevel: number; // 0-5 (each level +12% yield)
}

// ---------------------------------------------------------------------
// Equipment mastery (per category upgrade chain)
// ---------------------------------------------------------------------

export interface EquipmentMastery {
  category: RoleCategory;
  level: number; // 0 = base, 4 = 100% yield coefficient
  masteryYieldPercent: number; // 60-100
}

// ---------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------

export interface Contract {
  id: string;
  name: string; // e.g. "180nm GPU order"
  targetNode: string; // technology node
  diesRequired?: number; // total dies needed to complete
  diesProduced?: number; // dies produced toward this contract
  rewardUsd: number;
  progress: number; // 0‑100 %
  status: "available" | "accepted" | "completed";
}

// ---------------------------------------------------------------------
// StateSnapshot (canonical source of truth)
// ---------------------------------------------------------------------

export interface StateSnapshot {
  date: string;
  cash: number;
  reputation: number;
  stage: "startup" | "growth" | "massProduction" | "exit";
  // Multi-fab + inventory system
  fabs: FabBay[];
  inventory: InventoryMachine[];
  equipmentMastery: EquipmentMastery[];
  // Economy
  economy: {
    revenue: number;
    materials: number;
    opex: number;
    depreciation: number;
    netProfit: number;
  };
  // Tech tree with yield breakthrough chain
  techNodes: TechNode[];
  // Customer contracts
  contracts: Contract[];
  day: number; // 1-30 day of month
  lastSavedTimestamp: number;
  producedWafers: number;
  producedDies: number;
  researchPoints: number;
}