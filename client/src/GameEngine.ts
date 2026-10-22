/**
 * Client‑side game engine for Semiconductor Tycoon.
 * This module runs completely in the browser / WebView and does not need a Node.js backend.
 * It mirrors the core logic that was previously on the Express server (GameEngine, FactoryTick, Economy, AdvancedTechTree).
 * All state is plain JavaScript/TypeScript objects – React components can subscribe to it via useState/useEffect.
 */

// ----------------------------------------------------------------------------------------------------------------------------------------
// Simple immutable‑style state container.
import type { Contract, Financials } from "./types";

export type StateSnapshot = {
  date: string; // e.g. "2024-08"
  cash: number;
  reputation: number;
  stage: "startup" | "growthature" | "massProduction" | "exit";
  // factory & equipment
  factories: {
    id: string;
    name: string;
    health: number; // 0‑100
    level: number;
  }[];
  // economy numbers
  economy: {
    revenue: number;
    materials: number;
    opex: number;
    depreciation: number;
    netProfit: number;
  };
  // tech tree
  techNodes: {
    id: string;
    name: string;
    level: number; // 0 = locked, 1 = researching, 2 = unlocked unlock, etc.
    costUsd: number;
  }[];
  // customer contracts
  contracts: Contract[];
};

// -----------------------------------------------------------------
// Helper: tiny deterministic‑seed (you can replace with any persisted state)
const seedState: StateSnapshot = {
  date: "2024-08",
  cash: 1500,
  reputation: 0,
  stage: "startup",
  factories: [],
  economy: {
    revenue: 0,
    materials: 0,
    opex: 0,
    depreciation: 0,
    netProfit: 0,
  },
  techNodes: [
    { id: "wafers_500mm", name: "500 mm Wafer", level: 0, costUsd: 200 },
    { id: "7nm", name: "7 nm Process", level: 0, costUsd: 500 },
    { id: "a16", name: "A16 Process", level: 0, costUsd: 1200 },
  ],
  contracts: [
    {
      id: "contract_180nm",
      name: "180 nm GPU 預訂",
      targetNode: "wafers_500mm",
      rewardUsd: 300,
      progress: 0,
      status: "available",
    },
    {
      id: "contract_7nm",
      name: "7 nm 加速卡",
      targetNode: "7nm",
      rewardUsd: 800,
      progress: 0,
      status: "available",
    },
    {
      id: "contract_a16",
      name: "A16 製程晶圓",
      targetNode: "a16",
      rewardUsd: 1500,
      progress: 0,
      status: "available",
    },
  ],
};

// -----------------------------------------------------------------
// Core Engine – pure functions, no DOM or network dependence.
export class GameEngine {
  private state: StateSnapshot;

  constructor(initialState?: StateSnapshot) {
    const src = initialState ?? seedState;
    // Deep copy so the module‑level seed is never mutated.
    this.state = {
      ...src,
      factories: src.factories.map((f) => ({ ...f })),
      economy: { ...src.economy },
      techNodes: src.techNodes.map((n) => ({ ...n })),
      contracts: src.contracts.map((c) => ({ ...c })),
    };
  }

  /** Get a copy of the current state (immutable). */
  getState(): StateSnapshot {
    return {
      ...this.state,
      factories: this.state.factories.map((f) => ({ ...f })),
      economy: { ...this.state.economy },
      techNodes: this.state.techNodes.map((n) => ({ ...n })),
      contracts: this.state.contracts.map((c) => ({ ...c })),
    };
  }

  /** Financial summary used by the Financials panel. */
  getFinancials(): Financials {
    const { economy, cash, factories } = this.state;
    const assets = cash + factories.reduce((sum, f) => sum + f.health * 40, 0);
    const liabilities = factories.length * 250;
    return {
      revenue: economy.revenue,
      materials: economy.materials,
      opex: economy.opex,
      depreciation: economy.depreciation,
      netProfit: economy.netProfit,
      cash,
      assets,
      liabilities,
    };
  }

  /** Advance one in‑game month. Re‑calc revenue, expenses, depreciation, etc. */
  advanceMonth() {
    const { state } = this;

    // --- simple example calculations ---------------------------------
    // Revenue = sum of factory health * base revenue factor
    const baseRevenue = state.factories.reduce(
      (sum, f) => sum + f.health * 10, // each health% = 10 K per month
      0
    );

    const materialsCost = state.factories.reduce(
      (sum, f) => sum + f.health * 5, // each health% = 5 K material cost
      0
    );

    const opex = state.factories.length * 100; // fixed overhead per factory
    const depreciation = state.factories.reduce(
      (sum, f) => sum + f.health * 2,
      0
    );

    const netProfit = baseRevenue - materialsCost - opex - depreciation;
    const newCash = state.cash + netProfit;

    // update date (month increment)
    const [year, month] = state.date.split("-").map(Number);
    let newMonth = month + 1;
    let newYear = year;
    if (newMonth > 12) {
      newMonth = 1;
      newYear += 1;
    }
    const newDate = `${newYear}-${newMonth.toString().padStart(2, "0")}`;

    // maybe advance stage after some cash threshold
    let newStage = state.stage;
    if (newCash >= 5000 && state.stage === "startup") newStage = "growthature";
    if (newCash >= 20000 && state.stage === "growthature") newStage = "massProduction";

    this.state = {
      ...state,
      date: newDate,
      cash: newCash,
      economy: {
        revenue: baseRevenue,
        materials: materialsCost,
        opex,
        depreciation,
        netProfit,
      },
      stage: newStage,
    };
  }

  /** Purchase 可購買的機台列表 (simple static list for demo) */
  getAvailableEquipment(): { id: string; name: string; priceUsd: number; health?: number }[] {
    return [
      { id: "asml_duv", name: "ASML DUV", priceUsd: 800, health: 100 },
      { id: "asml_euv", name: "ASML EUV", priceUsd: 2500, health: 100 },
      { id: "etch_reactor", name: "Dry Etch Reactor", priceUsd: 300, health: 100 },
    ];
  }

  /** Begin research on a tech node (instant‑for‑demo – real game would have time/cost). */
  researchNode(nodeId: string): { ok: boolean; message: string } {
    const node = this.state.techNodes.find((n) => n.id === nodeId);
    if (!node) return { ok: false, message: "找不到此研發節點" };
    if (node.level >= 2) return { ok: false, message: `${node.name} 已解鎖` };

    const cost = node.costUsd;
    if (this.state.cash < cost) {
      return { ok: false, message: `現金不足，需要 ${cost}K` };
    }
    this.state.cash -= cost;
    node.level = (node.level ?? 0) + 1;
    return {
      ok: true,
      message: node.level >= 2 ? `${node.name} 已解鎖！` : `開始研發 ${node.name}`,
    };
  }

  /** Buy a piece of equipment (conceptual – just records the purchase). */
  buyEquipment(eqId: string): { ok: boolean; message: string } {
    const equipment = this.getAvailableEquipment().find((e) => e.id === eqId);
    if (!equipment) return { ok: false, message: "找不到此機台" };
    if (this.state.cash < equipment.priceUsd) {
      return { ok: false, message: `現金不足，需要 ${equipment.priceUsd}K` };
    }
    this.state.cash -= equipment.priceUsd;
    this.state.factories.push({
      id: eqId,
      name: equipment.name,
      health: equipment.health ?? 100,
      level: 1,
    });
    return { ok: true, message: `已購入 ${equipment.name}` };
  }

  // ------------------------------------------------------------------
  // Customer contracts
  // ------------------------------------------------------------------

  /** All contracts currently known to the player. */
  getContracts(): Contract[] {
    return this.state.contracts.map((c) => ({ ...c }));
  }

  /** Accept a contract – requires an unlocked target tech node. */
  acceptContract(contractId: string): { ok: boolean; message: string } {
    const contract = this.state.contracts.find((c) => c.id === contractId);
    if (!contract) return { ok: false, message: "找不到此合約" };
    if (contract.status !== "available") {
      return { ok: false, message: "此合約已接取" };
    }
    const node = this.state.techNodes.find((n) => n.id === contract.targetNode);
    if (!node || node.level < 2) {
      return { ok: false, message: `需要先解鎖 ${contract.targetNode} 製程` };
    }
    contract.status = "accepted";
    contract.progress = 0;
    return { ok: true, message: `已接取合約：${contract.name}` };
  }

  /** Deliver an accepted contract – pays out the reward. */
  completeContract(contractId: string): { ok: boolean; message: string } {
    const contract = this.state.contracts.find((c) => c.id === contractId);
    if (!contract) return { ok: false, message: "找不到此合約" };
    if (contract.status !== "accepted") {
      return { ok: false, message: "此合約尚未接取" };
    }
    contract.status = "completed";
    contract.progress = 100;
    this.state.cash += contract.rewardUsd;
    this.state.reputation += 5;
    return { ok: true, message: `合約完成，獲得 ${contract.rewardUsd}K` };
  }
}

// -----------------------------------------------------------------
// Export a singleton instance for easy import in React components.
// In a real app you might want to store the engine in a React context.
export const engine = new GameEngine();

// -----------------------------------------------------------------
// Optional: re‑export the types so consumers can type‑check.
export type { Contract, Financials };