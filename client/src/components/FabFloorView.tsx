import { useState } from "react";
import type { StateSnapshot, RoleCategory } from "../types";
import { engine } from "../GameEngine";
import { EquipmentCatalogModal } from "./EquipmentCatalogModal";
import { EQUIPMENT_CATALOG } from "../equipmentCatalog";

const ROLE_META: Record<RoleCategory, { label: string; badge: string; color: string }> = {
  litho: { label: "微影", badge: "核心圖案引擎", color: "border-indigo-500/50 bg-indigo-500/10 text-indigo-300" },
  etch: { label: "刻蝕", badge: "產速推進器", color: "border-amber-500/50 bg-amber-500/10 text-amber-300" },
  depo: { label: "沉積", badge: "結構放大器", color: "border-sky-500/50 bg-sky-500/10 text-sky-300" },
  implant: { label: "注入/熱處理", badge: "單價增幅器", color: "border-cyan-500/50 bg-cyan-500/10 text-cyan-300" },
  clean: { label: "CMP/清洗", badge: "良率守護者", color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" },
  insp: { label: "檢測/量測", badge: "全局乘數 & 研發", color: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300" },
  pack: { label: "先進封裝", badge: "終端價值躍遷", color: "border-rose-500/50 bg-rose-500/10 text-rose-300" },
};

const ROLE_ORDER: RoleCategory[] = ["litho", "etch", "depo", "implant", "clean", "insp", "pack"];

interface FabFloorViewProps {
  state: StateSnapshot;
  onBuyEquipment: (eqId: string) => void;
}

export function FabFloorView({ state, onBuyEquipment }: FabFloorViewProps) {
  const [selectedFabId, setSelectedFabId] = useState<string>(state.fabs.find((f) => f.unlocked)?.id ?? state.fabs[0].id);
  const [dragInstanceId, setDragInstanceId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [draggingDeployedSlot, setDraggingDeployedSlot] = useState<number | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const fab = state.fabs.find((f) => f.id === selectedFabId) ?? state.fabs[0];
  const diag = engine.getFabDiagnostics(fab.id);
  const diagCounts: Record<RoleCategory, number> = (diag?.counts as Record<RoleCategory, number>) ?? { litho:0,etch:0,depo:0,implant:0,clean:0,insp:0,pack:0 };

  const litho = diagCounts.litho ?? 0;
  const etch = diagCounts.etch ?? 0;
  const depo = diagCounts.depo ?? 0;
  const hasCore = litho > 0 && etch > 0 && depo > 0;
  const golden = hasCore && (diagCounts.implant ?? 0) >= 1 && (diagCounts.clean ?? 0) >= 1;

  let banner: { tone: string; text: string };
  if (litho === 0) {
    banner = { tone: "bg-rose-500/10 border-rose-500/40 text-rose-300", text: "⛔ 產線停擺（效率 0%）：廠房缺少【微影機】，無法進行晶圓曝光！請從下方倉庫拖入微影機。" };
  } else if (!hasCore) {
    banner = { tone: "bg-amber-500/10 border-amber-500/40 text-amber-300", text: "⚠️ 殘缺產線（效率 25%）：尚未湊齊「微影 + 刻蝕 + 沉積」三大基礎核心，產能嚴重受限！" };
  } else if (golden) {
    banner = { tone: "bg-yellow-500/10 border-yellow-500/40 text-yellow-300", text: "🌟 黃金全流程共鳴（效率 135%）：全站點完美協同！獲得額外 +35% 產速與良率加成！" };
  } else {
    banner = { tone: "bg-emerald-500/10 border-emerald-500/40 text-emerald-300", text: "✅ 標準閉環產線（效率 100%）：基礎產線運轉順暢！可再加入【清洗機】提升良率或【注入機】提高晶片售價。" };
  }

  const handleDrop = (slotIndex: number) => {
    if (!dragInstanceId) return;
    const inv = state.inventory.find((i) => i.instanceId === dragInstanceId);
    if (!inv) { setDragInstanceId(null); setDragOverSlot(null); return; }
    const sameCat = diagCounts[inv.roleCategory as RoleCategory] ?? 0;
    if (sameCat >= fab.maxPerCategory) {
      setDragInstanceId(null); setDragOverSlot(null); return;
    }
    engine.deployMachineToFab(fab.id, dragInstanceId, slotIndex);
    setDragInstanceId(null);
    setDragOverSlot(null);
    setDraggingDeployedSlot(null);
  };

  const handleRemove = (slotIndex: number) => {
    engine.removeMachineFromFab(fab.id, slotIndex);
  };

  const handleUnlock = (fabId: string) => {
    const res = engine.unlockFab(fabId);
    if (res.ok) setSelectedFabId(fabId);
  };

  return (
    <div className="space-y-4">
      {/* Fab Selector Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {state.fabs.map((f) => {
          const locked = !f.unlocked;
          const active = f.id === selectedFabId;
          const occ = f.slots.filter((s) => s.machineInstanceId).length;
          const diagF = engine.getFabDiagnostics(f.id);
          const condText = f.unlockRequirementNode
            ? `需資金 $${f.unlockCostUsd.toLocaleString()} + ${f.unlockRequirementNode} 良率 ≥ ${f.unlockRequirementYield ?? 0}%`
            : `需資金 $${f.unlockCostUsd.toLocaleString()}`;
          let ready = false;
          if (locked) {
            const node = f.unlockRequirementNode ? state.techNodes.find((n) => n.id === f.unlockRequirementNode) : null;
            const nodeOk = !f.unlockRequirementNode || (!!node && node.level >= 2);
            const yieldOk = f.unlockRequirementYield === null || (!!node && node.yieldPercent >= (f.unlockRequirementYield ?? 0));
            ready = state.cash >= f.unlockCostUsd && nodeOk && yieldOk;
          }
          return (
            <button
              key={f.id}
              onClick={() => (locked ? (ready ? handleUnlock(f.id) : undefined) : setSelectedFabId(f.id))}
              className={`shrink-0 min-w-[150px] px-3 py-2 rounded-xl border text-left transition-all ${
                active
                  ? "bg-slate-800 border-indigo-500/60 shadow-[0_0_12px_rgba(99,102,241,0.25)]"
                  : locked
                  ? "bg-slate-900/60 border-slate-800 opacity-70"
                  : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="text-xs font-medium text-slate-200">{f.name}</div>
              {locked ? (
                <div className="mt-1 text-[10px] text-slate-500">
                  🔒 {ready ? <span className="text-emerald-400">可解鎖</span> : condText}
                </div>
              ) : (
                <div className="mt-1 text-[10px] text-slate-400">
                  <div>{occ} / {f.maxSlots} 槽位 · Yield {diagF?.yieldPercent ?? (100 + f.yieldBonusPercent)}%</div>
                  <div className="font-mono text-indigo-300">{(diagF?.goodDiesPerSecond ?? 0).toFixed(1)} dies/s</div>
                </div>
              )}
              {locked && ready && (
                <div className="mt-1 text-[10px] text-emerald-400 font-semibold">🔓 立即解鎖廠房</div>
              )}
            </button>
          );
        })}
      </div>

      {/* Pipeline Synergy Diagnostic Banner */}
      <div className={`rounded-xl border p-3 ${banner.tone}`}>
        <div className="text-xs font-medium">{banner.text}</div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
          {ROLE_ORDER.map((r) => (
            <span key={r} className={`px-2 py-0.5 rounded border ${diagCounts[r] > 0 ? ROLE_META[r].color : "border-slate-700 bg-slate-900/60 text-slate-500"}`}>
              {diagCounts[r] > 0 ? "✓" : "✗"} {ROLE_META[r].label} ×{diagCounts[r]}
            </span>
          ))}
        </div>
        <div className="mt-2 text-[10px] text-slate-400">
          同類上限：{ROLE_ORDER.map((r) => `${ROLE_META[r].label} ${diagCounts[r]}/${fab.maxPerCategory}`).join(" · ")}
        </div>
      </div>

      {/* Pipeline flow indicator */}
      <div className="flex items-center gap-1 text-[10px] text-slate-400 overflow-x-auto">
        {[["微影曝光 (必修)", litho > 0, "border-indigo-500/50 bg-indigo-500/10 text-indigo-300"], ["結構刻蝕 (必修)", etch > 0, "border-amber-500/50 bg-amber-500/10 text-amber-300"], ["薄膜沉積 (必修)", depo > 0, "border-sky-500/50 bg-sky-500/10 text-sky-300"], ["注入/清洗/檢測 (強化)", (diagCounts.implant+diagCounts.clean+diagCounts.insp) > 0, "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"]].map((step, i, arr) => (
          <span key={String(step[0])} className="flex items-center gap-1 shrink-0">
            <span className={`px-2 py-1 rounded border ${step[1] ? String(step[2]) : "border-slate-700 text-slate-500"}`}>
              {i + 1}. {String(step[0])}
            </span>
            {i < arr.length - 1 && <span>➔</span>}
          </span>
        ))}
      </div>

      {/* Fab Slots Grid */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        <div className="text-xs text-slate-400 mb-2">{fab.name} · {fab.slots.filter((s) => s.machineInstanceId).length}/{fab.maxSlots} 槽位</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {fab.slots.map((slot, idx) => {
            const isOver = dragOverSlot === idx;
            const dragInv = dragInstanceId ? state.inventory.find((i) => i.instanceId === dragInstanceId) : null;
            const catFull = dragInv ? (diagCounts[dragInv.roleCategory as RoleCategory] ?? 0) >= fab.maxPerCategory : false;
            const highlight = isOver ? (catFull ? "border-rose-500/60 bg-rose-500/10" : "border-indigo-500/60 bg-indigo-500/10") : "";
            return (
              <div
                key={idx}
                onDragOver={(e) => { e.preventDefault(); setDragOverSlot(idx); }}
                onDragLeave={() => setDragOverSlot(null)}
                onDrop={(e) => { e.preventDefault(); handleDrop(idx); }}
                className={`min-h-[90px] rounded-lg border-2 border-dashed p-2 transition-all ${slot.machineInstanceId ? "border-slate-700 bg-slate-800/60" : `border-slate-700/60 bg-slate-900/40 ${highlight}`}`}
              >
                {slot.machineInstanceId ? (
                  <DeployedCard instanceId={slot.machineInstanceId} slotIndex={idx} onRemove={() => handleRemove(idx)} hasLitho={litho > 0} onDragStart={() => setDraggingDeployedSlot(idx)} />
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-[10px] text-slate-500">
                    <span>+ 拖曳設備至此部署</span>
                    <span className="text-slate-600">Slot #{idx + 1}</span>
                    {isOver && (
                      <span className={`mt-1 ${catFull ? "text-rose-400" : "text-indigo-400"}`}>
                        {catFull ? "本類已達上限" : "放開以部署"}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Equipment Dock */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (draggingDeployedSlot !== null) {
            engine.removeMachineFromFab(fab.id, draggingDeployedSlot);
            setDraggingDeployedSlot(null);
          }
        }}
        className="bg-slate-900/60 border border-slate-800 rounded-xl p-3"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-slate-400">📦 待部署設備倉庫（Equipment Dock）</div>
          <button
            onClick={() => setCatalogOpen(true)}
            className="text-[10px] px-2 py-1 rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"
          >
            🛒 前往設備採購商城
          </button>
        </div>
        {state.inventory.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">倉庫為空，請先採購設備。</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {state.inventory.map((m) => {
              const meta = ROLE_META[m.roleCategory as RoleCategory];
              const sameCat = diagCounts[m.roleCategory as RoleCategory] ?? 0;
              const full = sameCat >= fab.maxPerCategory;
              return (
                <div
                  key={m.instanceId}
                  draggable
                  onDragStart={() => setDragInstanceId(m.instanceId)}
                  onDragEnd={() => { setDragInstanceId(null); setDragOverSlot(null); }}
                  className={`rounded-lg border p-2 cursor-grab active:cursor-grabbing ${meta?.color ?? "border-slate-700 bg-slate-800/60 text-slate-300"}`}
                >
                  <div className="text-xs font-medium truncate">{m.name}</div>
                  <div className="text-[10px] opacity-80">{meta?.badge}</div>
                  <div className="mt-2 flex gap-1">
                    <button
                      disabled={full}
                      onClick={() => {
                        const emptyIdx = fab.slots.findIndex((s) => !s.machineInstanceId);
                        if (emptyIdx >= 0) engine.deployMachineToFab(fab.id, m.instanceId, emptyIdx);
                      }}
                      className={`flex-1 text-[10px] py-1 rounded border ${full ? "border-slate-700 text-slate-500 cursor-not-allowed" : "border-slate-600 text-slate-200 hover:bg-slate-700/60"}`}
                    >
                      {full ? "本廠同類已滿" : "⬆ 部署"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <EquipmentCatalogModal state={state} isOpen={catalogOpen} onClose={() => setCatalogOpen(false)} onBuyEquipment={onBuyEquipment} />
    </div>
  );
}

function DeployedCard({ instanceId, slotIndex, onRemove, hasLitho, onDragStart }: { instanceId: string; slotIndex: number; onRemove: () => void; hasLitho: boolean; onDragStart: () => void }) {
  const eqId = instanceId.replace(/^inst_/, "").replace(/_\d+$/, "");
  const eq = EQUIPMENT_CATALOG.find((e) => e.id === eqId);
  const role = (eq?.roleCategory ?? "litho") as RoleCategory;
  const meta = ROLE_META[role];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="h-full flex flex-col justify-between cursor-grab active:cursor-grabbing"
    >
      <div>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium text-slate-200 truncate">{eq?.name ?? instanceId}</span>
          <button onClick={onRemove} className="text-[10px] text-slate-400 hover:text-rose-400">⬇ 收回</button>
        </div>
        <div className={`text-[9px] mt-1 inline-block px-1.5 py-0.5 rounded border ${meta?.color ?? "border-slate-700 text-slate-400"}`}>
          【{meta?.badge}】
        </div>
        <div className="text-[9px] text-slate-500 mt-1">{eq?.roleDescription ?? eq?.description ?? ""}</div>
        <div className="text-[9px] text-slate-600 mt-1">Slot #{slotIndex + 1}</div>
      </div>
      <div className="mt-1">
        <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${hasLitho ? "bg-emerald-500/70 animate-pulse" : "bg-slate-600"}`} style={{ width: hasLitho ? "100%" : "0%" }} />
        </div>
        <div className="text-[9px] text-slate-500 mt-1">{hasLitho ? "🟢 加工中" : "⏸ 等待前段微影曝光"}</div>
      </div>
    </div>
  );
}
