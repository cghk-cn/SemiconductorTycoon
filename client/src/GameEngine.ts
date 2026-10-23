/**
 * Client-side game engine for Semiconductor Tycoon.
 * Core Game Mechanics 2.0 – Multi-fab + Inventory + Yield Breakthrough architecture.
 */

import type {
  Contract,
  Financials,
  InventoryMachine,
  StateSnapshot,
  RoleCategory,
} from "./types";
import { EQUIPMENT_CATALOG } from "./equipmentCatalog";

// -----------------------------------------------------------------
// Canonical seed state
// -----------------------------------------------------------------
const seedState: StateSnapshot = {
  date: "2024-08",
  day: 1,
  cash: 1500,
  reputation: 0,
  lastSavedTimestamp: Date.now(),
  producedWafers: 0,
  producedDies: 0,
  researchPoints: 15,
  stage: "startup",
  fabs: [
    {
      id: "fab_1",
      name: "1號先導無塵室",
      unlocked: true,
      unlockCostUsd: 0,
      unlockRequirementNode: null,
      unlockRequirementYield: null,
      maxSlots: 6,
      maxPerCategory: 2,
      yieldBonusPercent: 0,
      slots: [
        { index: 0, machineInstanceId: "inst_litho_1" },
        { index: 1, machineInstanceId: null },
        { index: 2, machineInstanceId: null },
        { index: 3, machineInstanceId: null },
        { index: 4, machineInstanceId: null },
        { index: 5, machineInstanceId: null },
      ],
    },
    {
      id: "fab_2",
      name: "2號標準量產廠",
      unlocked: false,
      unlockCostUsd: 50000,
      unlockRequirementNode: "350nm",
      unlockRequirementYield: 100,
      maxSlots: 9,
      maxPerCategory: 3,
      yieldBonusPercent: 5,
      slots: Array.from({ length: 9 }, (_, i) => ({ index: i, machineInstanceId: null })),
    },
    {
      id: "fab_3",
      name: "3號超潔淨晶圓廠",
      unlocked: false,
      unlockCostUsd: 500000,
      unlockRequirementNode: "180nm",
      unlockRequirementYield: 100,
      maxSlots: 12,
      maxPerCategory: 4,
      yieldBonusPercent: 10,
      slots: Array.from({ length: 12 }, (_, i) => ({ index: i, machineInstanceId: null })),
    },
    {
      id: "fab_4",
      name: "4號極紫外光旗艦廠",
      unlocked: false,
      unlockCostUsd: 5000000,
      unlockRequirementNode: "90nm",
      unlockRequirementYield: 100,
      maxSlots: 16,
      maxPerCategory: 5,
      yieldBonusPercent: 15,
      slots: Array.from({ length: 16 }, (_, i) => ({ index: i, machineInstanceId: null })),
    },
  ],
  inventory: [
    {
      instanceId: "inst_etch_1",
      equipmentId: "etch_reactor",
      name: "Dry Etch Reactor",
      roleCategory: "etch",
      health: 100,
      level: 0,
    },
    {
      instanceId: "inst_depo_1",
      equipmentId: "cvd_tool",
      name: "CVD Deposition System",
      roleCategory: "depo",
      health: 100,
      level: 0,
    },
    {
      instanceId: "inst_litho_1",
      equipmentId: "litho_scanner",
      name: "DUV Lithography Scanner",
      roleCategory: "litho",
      health: 100,
      level: 0,
    },
  ],
  equipmentMastery: [
    { category: "litho", level: 0, masteryYieldPercent: 60 },
    { category: "etch", level: 0, masteryYieldPercent: 60 },
    { category: "depo", level: 0, masteryYieldPercent: 60 },
    { category: "implant", level: 0, masteryYieldPercent: 60 },
    { category: "clean", level: 0, masteryYieldPercent: 60 },
    { category: "insp", level: 0, masteryYieldPercent: 60 },
    { category: "pack", level: 0, masteryYieldPercent: 60 },
  ],
  techNodes: [
    { id: "350nm", name: "350 nm", level: 3, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "180nm", name: "180 nm", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "90nm", name: "90 nm", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "28nm", name: "28 nm", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "7nm", name: "7 nm", level: 0, costUsd: 500, yieldPercent: 40, yieldLevel: 0 },
    { id: "3nm", name: "3 nm", level: 0, costUsd: 1200, yieldPercent: 40, yieldLevel: 0 },
    { id: "2nm", name: "2 nm", level: 0, costUsd: 2500, yieldPercent: 40, yieldLevel: 0 },
    { id: "a16", name: "A16 (CFET)", level: 0, costUsd: 5000, yieldPercent: 40, yieldLevel: 0 },
    { id: "wafer6", name: "6吋晶圓", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "wafer8", name: "8吋晶圓", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "wafer12", name: "12吋晶圓", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "gansic", name: "GaN/SiC", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "siliconphotonics", name: "矽光子", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "wirebond", name: "引線封裝", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "flipchip", name: "覆晶封裝", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "cowos", name: "2.5D CoWoS", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "hybridbond", name: "3D Hybrid Bonding", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "spc", name: "SPC 統計製程控制", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "aoi", name: "AOI 自動光學檢測", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
    { id: "ai_defect", name: "AI 缺陷預測", level: 0, costUsd: 0, yieldPercent: 40, yieldLevel: 0 },
  ],
  contracts: [
    {
      id: "contract_180nm",
      name: "180 nm GPU 預訂",
      targetNode: "180nm",
      diesRequired: 600,
      rewardUsd: 350,
      progress: 0,
      status: "available",
    },
    {
      id: "contract_7nm",
      name: "7 nm 加速卡",
      targetNode: "7nm",
      diesRequired: 1500,
      rewardUsd: 1000,
      progress: 0,
      status: "available",
    },
    {
      id: "contract_a16",
      name: "A16 製程晶圓",
      targetNode: "a16",
      diesRequired: 4000,
      rewardUsd: 2500,
      progress: 0,
      status: "available",
    },
  ],
  economy: {
    revenue: 0,
    materials: 0,
    opex: 0,
    depreciation: 0,
    netProfit: 0,
  },
};
// -----------------------------------------------------------------
// Core Engine
// -----------------------------------------------------------------
export class GameEngine {
  private state: StateSnapshot;
  private pendingMs: number = 0;
  private bottleneckWarning: string | null = null;
  private offlineSummary: { elapsedMs: number; gameDays: number; wafers: number; cashDelta: number } | null = null;
  private hasOfflineSummary: boolean = false;

  constructor(initialState?: StateSnapshot) {
    const src = initialState ?? seedState;
    this.state = {
      ...src,
      fabs: src.fabs.map((f) => ({
        ...f,
        slots: f.slots.map((s) => ({ ...s })),
      })),
      inventory: src.inventory.map((i) => ({ ...i })),
      equipmentMastery: src.equipmentMastery.map((e) => ({ ...e })),
      economy: { ...src.economy },
      techNodes: src.techNodes.map((n) => ({ ...n })),
      contracts: src.contracts.map((c) => ({ ...c })),
      day: src.day ?? 1,
      lastSavedTimestamp: src.lastSavedTimestamp ?? Date.now(),
      producedWafers: src.producedWafers ?? 0,
      producedDies: src.producedDies ?? 0,
    };

    const now = Date.now();
    const last = this.state.lastSavedTimestamp;
    const elapsedMs = Math.max(0, now - last);
    if (elapsedMs > 60_000) {
      const beforeWafers = this.state.producedWafers;
      const beforeCash = this.state.cash;
      const gameDays = elapsedMs / (3600 * 1000);
      const fullDays = Math.floor(gameDays);
      this.pendingMs = elapsedMs - fullDays * 3600 * 1000;
      for (let i = 0; i < fullDays; i++) this.runSecond();
      this.offlineSummary = {
        elapsedMs,
        gameDays,
        wafers: this.state.producedWafers - beforeWafers,
        cashDelta: this.state.cash - beforeCash,
      };
      this.hasOfflineSummary = true;
    } else {
      this.pendingMs = elapsedMs;
    }
    this.state.lastSavedTimestamp = Date.now();
  }
  private runSecond(): void {
    const nodeCycleMultiplier: Record<string, number> = {
      "350nm": 1.0, "180nm": 1.1, "90nm": 1.3, "28nm": 1.6,
      "7nm": 2.2, "3nm": 3.0, "2nm": 4.0, a16: 5.5,
    };
    const diesPerWaferByNode: Record<string, number> = {
      "350nm": 120, "180nm": 180, "90nm": 300, "28nm": 500,
      "7nm": 900, "3nm": 1400, "2nm": 2200, a16: 3500,
    };

    let totalGoodDies = 0;
    let totalScrapDies = 0;
    let totalRevenue = 0;
    let totalMaterials = 0;
    let totalOPEX = 0;
    let totalDepreciation = 0;
    let totalRP = 0;

    for (const fab of this.state.fabs) {
      if (!fab.unlocked) continue;

      const deployed = fab.slots
        .filter((s) => s.machineInstanceId)
        .map((s) => this.state.inventory.find((i) => i.instanceId === s.machineInstanceId))
        .filter((i): i is InventoryMachine => i !== undefined);

      const counts: Record<RoleCategory, number> = {
        litho: 0, etch: 0, depo: 0, implant: 0, clean: 0, insp: 0, pack: 0,
      };
      for (const m of deployed) {
        if (m.roleCategory in counts) counts[m.roleCategory as RoleCategory] += 1;
      }

      const litho = counts.litho;
      const etch = counts.etch;
      const depo = counts.depo;
      const implant = counts.implant;
      const clean = counts.clean;
      const insp = counts.insp;
      const pack = counts.pack;

      let completenessMult = 0;
      if (litho === 0) {
        completenessMult = 0;
      } else if (etch === 0 || depo === 0) {
        completenessMult = 0.25;
      } else if (implant >= 1 && clean >= 1) {
        completenessMult = 1.35;
      } else {
        completenessMult = 1.0;
      }

      const support = etch + depo;
      const required = litho * 2;
      let bottleneckMult = 1.0;
      if (litho > 0 && support < required) bottleneckMult = support / required;

      let grossDies = 0;
      for (const m of deployed) {
        if (m.roleCategory !== "litho") continue;
        const eq = EQUIPMENT_CATALOG.find((e) => e.id === m.equipmentId);
        if (!eq) continue;
        const targetNode = this.state.techNodes.find((n) => n.level >= 2)?.id ?? "350nm";
        const baseSeconds = 3600 / Math.max(eq.throughputWph ?? 100, 1);
        const secPerWafer = Math.max(8, baseSeconds * (nodeCycleMultiplier[targetNode] ?? 1.0));
        const dies = diesPerWaferByNode[targetNode] ?? 120;
        grossDies += (1 / secPerWafer) * dies;
      }
      grossDies *= 1 + depo * 0.35;
      grossDies *= completenessMult * bottleneckMult;

      const node = this.state.techNodes.find((n) => n.level >= 2) ?? this.state.techNodes[0];
      let masterySum = 0, masteryCnt = 0;
      for (const m of deployed) {
        const mas = this.state.equipmentMastery.find((em) => em.category === m.roleCategory);
        if (mas) { masterySum += mas.masteryYieldPercent; masteryCnt += 1; }
      }
      const avgMastery = masteryCnt > 0 ? masterySum / masteryCnt : 60;

      let yieldPct = node.yieldPercent * (avgMastery / 100) + clean * 10 + fab.yieldBonusPercent;
      yieldPct = Math.max(10, Math.min(100, yieldPct));
      if (insp > 0) yieldPct = Math.min(100, yieldPct * 1.12);

      const goodDies = grossDies * (yieldPct / 100);
      const scrapDies = grossDies * (1 - yieldPct / 100);

      const aspMult = 1 + implant * 0.25 + pack * 0.50;
      const revenue = goodDies * 0.1 * aspMult;
      const materials = grossDies * 0.005;

      totalGoodDies += goodDies;
      totalScrapDies += scrapDies;
      totalRevenue += revenue;
      totalMaterials += materials;
      totalOPEX += 0.01;
      totalDepreciation += 0.005;
      totalRP += insp;

      for (const slot of fab.slots) {
        if (!slot.machineInstanceId) continue;
        const inst = this.state.inventory.find((i) => i.instanceId === slot.machineInstanceId);
        if (!inst) continue;
        inst.health = Math.max(0, inst.health - (0.005 + Math.random() * 0.005));
      }
    }

    this.state.cash += totalRevenue;
    this.state.cash -= totalOPEX + totalMaterials + totalDepreciation;
    this.state.researchPoints += totalRP;

    this.state.economy = {
      revenue: totalRevenue,
      materials: totalMaterials,
      opex: totalOPEX,
      depreciation: totalDepreciation,
      netProfit: totalRevenue - totalOPEX - totalMaterials - totalDepreciation,
    };
    this.state.producedDies += totalGoodDies;

    if (this.state.cash >= 5000 && this.state.stage === "startup") this.state.stage = "growth";
    if (this.state.cash >= 20000 && this.state.stage === "growth") this.state.stage = "massProduction";
    this.state.day = ((this.state.day ?? 1) % 30) + 1;
  }
  tick(_deltaMs?: number): void {
    const now = Date.now();
    const elapsed = (this.pendingMs ?? 0) + (now - this.state.lastSavedTimestamp);
    const gameDays = elapsed / (3600 * 1000);
    const fullDays = Math.floor(gameDays);
    this.pendingMs = elapsed - fullDays * 3600 * 1000;
    for (let i = 0; i < fullDays; i++) this.runSecond();
    this.state.lastSavedTimestamp = Date.now();
  }

  getState(): StateSnapshot {
    return {
      ...this.state,
      fabs: this.state.fabs.map((f) => ({
        ...f,
        slots: f.slots.map((s) => ({ ...s })),
      })),
      inventory: this.state.inventory.map((i) => ({ ...i })),
      equipmentMastery: this.state.equipmentMastery.map((e) => ({ ...e })),
      economy: { ...this.state.economy },
      techNodes: this.state.techNodes.map((n) => ({ ...n })),
      contracts: this.state.contracts.map((c) => ({ ...c })),
    };
  }

  getFinancials(): Financials {
    return {
      cash: this.state.cash,
      revenue: this.state.economy.revenue,
      materials: this.state.economy.materials,
      opex: this.state.economy.opex,
      depreciation: this.state.economy.depreciation,
      netProfit: this.state.economy.netProfit,
      assets: this.state.cash,
      liabilities: 0,
    };
  }

  getBottleneckWarning(): string | null {
    return this.bottleneckWarning;
  }

  getDiesPerSecond(): number {
    return 0;
  }

  getCashPerSecond(): number {
    return this.state.economy.netProfit;
  }

  getFabDiagnostics(fabId: string): any {
    const fab = this.state.fabs.find((f) => f.id === fabId);
    if (!fab) return null;
    const deployed = fab.slots
      .filter((s) => s.machineInstanceId)
      .map((s) => {
        const instId = s.machineInstanceId!;
        const eqId = instId.replace(/^inst_/, "").replace(/_\\d+$/, "");
        const eq = EQUIPMENT_CATALOG.find((e) => e.id === eqId);
        return eq ? { instanceId: instId, roleCategory: (eq.roleCategory ?? "litho") as RoleCategory } : null;
      })
      .filter((i): i is { instanceId: string; roleCategory: RoleCategory } => i !== null);
    const counts: Record<RoleCategory, number> = {
      litho: 0, etch: 0, depo: 0, implant: 0, clean: 0, insp: 0, pack: 0,
    };
    for (const m of deployed) {
      if (m.roleCategory in counts) counts[m.roleCategory as RoleCategory] += 1;
    }
    return { fab, deployed, counts };
  }

  consumeOfflineSummary(): { elapsedMs: number; gameDays: number; wafers: number; cashDelta: number } | null {
    if (!this.hasOfflineSummary) return null;
    const s = this.offlineSummary;
    this.hasOfflineSummary = false;
    this.offlineSummary = null;
    return s;
  }

  save(): void {
    this.state.lastSavedTimestamp = Date.now();
  }

  // ------------------------------------------------------------------
  // Equipment & Fabs
  // ------------------------------------------------------------------
  getAvailableEquipment(): { id: string; name: string; priceUsd: number; health: number; roleCategory?: RoleCategory }[] {
    return EQUIPMENT_CATALOG.map((e) => ({
      id: e.id,
      name: e.name,
      priceUsd: e.priceUsd,
      health: 100,
      roleCategory: e.roleCategory,
    }));
  }

  buyEquipment(eqId: string): { ok: boolean; message: string } {
    const equipment = EQUIPMENT_CATALOG.find((e) => e.id === eqId);
    if (!equipment) return { ok: false, message: "找不到此機台" };
    const price = equipment.priceUsd;
    if (this.state.cash < price) return { ok: false, message: `現金不足，需要 ${price}K` };
    this.state.cash -= price;
    const instanceId = `inst_${eqId}_${Date.now()}`;
    this.state.inventory.push({
      instanceId,
      equipmentId: eqId,
      name: equipment.name,
      roleCategory: equipment.roleCategory ?? "litho",
      health: 100,
      level: 0,
    });
    return { ok: true, message: `已購入 ${equipment.name}` };
  }

  deployMachineToFab(fabId: string, instanceId: string, slotIndex: number): { ok: boolean; message: string } {
    const fab = this.state.fabs.find((f) => f.id === fabId);
    if (!fab || !fab.unlocked) return { ok: false, message: "廠房未解鎖" };
    const slot = fab.slots[slotIndex];
    if (!slot) return { ok: false, message: "無效槽位" };
    if (slot.machineInstanceId) return { ok: false, message: "槽位已被佔用" };
    const inv = this.state.inventory.find((i) => i.instanceId === instanceId);
    if (!inv) return { ok: false, message: "找不到機台" };
    const deployed = fab.slots
      .filter((s) => s.machineInstanceId)
      .map((s) => this.state.inventory.find((i) => i.instanceId === s.machineInstanceId))
      .filter((i): i is InventoryMachine => i !== undefined);
    const sameCat = deployed.filter((m) => m.roleCategory === inv.roleCategory).length;
    if (sameCat >= fab.maxPerCategory) return { ok: false, message: "此類別機台已達上限" };
    slot.machineInstanceId = instanceId;
    this.state.inventory = this.state.inventory.filter((i) => i.instanceId !== instanceId);
    return { ok: true, message: `已部署 ${inv.name}` };
  }

  removeMachineFromFab(fabId: string, slotIndex: number): { ok: boolean; message: string } {
    const fab = this.state.fabs.find((f) => f.id === fabId);
    if (!fab) return { ok: false, message: "找不到廠房" };
    const slot = fab.slots[slotIndex];
    if (!slot || !slot.machineInstanceId) return { ok: false, message: "槽位為空" };
    const instanceId = slot.machineInstanceId;
    slot.machineInstanceId = null;
    if (!this.state.inventory.find((i) => i.instanceId === instanceId)) {
      this.state.inventory.push({
        instanceId,
        equipmentId: "unknown",
        name: "Machine",
        roleCategory: "litho",
        health: 100,
        level: 0,
      });
    }
    return { ok: true, message: "已移除機台" };
  }

  unlockFab(fabId: string): { ok: boolean; message: string } {
    const fab = this.state.fabs.find((f) => f.id === fabId);
    if (!fab) return { ok: false, message: "找不到廠房" };
    if (fab.unlocked) return { ok: false, message: "已解鎖" };
    if (fab.unlockRequirementNode) {
      const node = this.state.techNodes.find((n) => n.id === fab.unlockRequirementNode);
      if (!node || node.level < 2) return { ok: false, message: `需要解鎖 ${fab.unlockRequirementNode}` };
    }
    if (fab.unlockRequirementYield !== null) {
      const node = this.state.techNodes.find((n) => n.level >= 2);
      if (node && node.yieldPercent < (fab.unlockRequirementYield ?? 0)) {
        return { ok: false, message: "良率不足" };
      }
    }
    if (this.state.cash < fab.unlockCostUsd) return { ok: false, message: `現金不足，需要 ${fab.unlockCostUsd}K` };
    this.state.cash -= fab.unlockCostUsd;
    fab.unlocked = true;
    return { ok: true, message: `${fab.name} 已解鎖` };
  }

  // ------------------------------------------------------------------
  // Tech & Yield
  // ------------------------------------------------------------------
  upgradeNodeYield(nodeId: string): { ok: boolean; message: string } {
    const node = this.state.techNodes.find((n) => n.id === nodeId);
    if (!node) return { ok: false, message: "找不到節點" };
    const cost = (node.yieldLevel + 1) * 100;
    if (this.state.cash < cost) return { ok: false, message: `現金不足，需要 ${cost}K` };
    this.state.cash -= cost;
    node.yieldLevel = (node.yieldLevel ?? 0) + 1;
    node.yieldPercent = Math.min(100, node.yieldPercent + 5);
    return { ok: true, message: `良率提升至 ${node.yieldPercent}%` };
  }

  unlockNextNode(nodeId: string): { ok: boolean; message: string } {
    const node = this.state.techNodes.find((n) => n.id === nodeId);
    if (!node) return { ok: false, message: "找不到節點" };
    if (node.level >= 2) return { ok: false, message: "已解鎖" };
    const cost = node.costUsd;
    if (this.state.cash < cost) return { ok: false, message: `現金不足，需要 ${cost}K` };
    this.state.cash -= cost;
    node.level = 2;
    return { ok: true, message: `${node.name} 已解鎖` };
  }

  upgradeEquipmentMastery(category: RoleCategory): { ok: boolean; message: string } {
    const mas = this.state.equipmentMastery.find((e) => e.category === category);
    if (!mas) return { ok: false, message: "找不到類別" };
    const cost = (mas.level + 1) * 200;
    if (this.state.cash < cost) return { ok: false, message: `現金不足，需要 ${cost}K` };
    this.state.cash -= cost;
    mas.level += 1;
    mas.masteryYieldPercent = Math.min(100, mas.masteryYieldPercent + 5);
    return { ok: true, message: `${category} 精通提升至 ${mas.masteryYieldPercent}%` };
  }

  researchNode(nodeId: string): { ok: boolean; message: string } {
    return this.unlockNextNode(nodeId);
  }
  // ------------------------------------------------------------------
  // Contracts
  // ------------------------------------------------------------------
  getContracts(): Contract[] {
    return this.state.contracts.map((c) => ({ ...c }));
  }

  acceptContract(contractId: string): { ok: boolean; message: string } {
    const contract = this.state.contracts.find((c) => c.id === contractId);
    if (!contract) return { ok: false, message: "找不到此合約" };
    if (contract.status !== "available") return { ok: false, message: "此合約已接取" };
    const node = this.state.techNodes.find((n) => n.id === contract.targetNode);
    if (!node || node.level < 2) return { ok: false, message: `需要先解鎖 ${contract.targetNode} 製程` };
    contract.status = "accepted";
    contract.progress = 0;
    return { ok: true, message: `已接取合約：${contract.name}` };
  }

  completeContract(contractId: string): { ok: boolean; message: string } {
    const contract = this.state.contracts.find((c) => c.id === contractId);
    if (!contract) return { ok: false, message: "找不到此合約" };
    if (contract.status !== "accepted") return { ok: false, message: "此合約尚未接取" };
    contract.status = "completed";
    contract.progress = 100;
    this.state.cash += contract.rewardUsd;
    this.state.reputation += 5;
    return { ok: true, message: `合約完成，獲得 ${contract.rewardUsd}K` };
  }
}

// -----------------------------------------------------------------
// Export singleton
// -----------------------------------------------------------------
export const engine = new GameEngine();

export type { Contract, Financials, StateSnapshot };