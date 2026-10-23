import type { StateSnapshot } from "../types";
import { engine } from "../GameEngine";

const ROLE_LABEL: Record<string, string> = {
  litho: "微影", etch: "刻蝕", depo: "沉積", implant: "注入", clean: "清洗", insp: "檢測", pack: "封裝",
};

export function ResearchTreeView({ state, researchNode }: { state: StateSnapshot; researchNode: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-400">RP: {state.researchPoints}</div>
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        <h2 className="text-sm font-medium text-indigo-300 mb-3">製程節點良率突破鏈</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {state.techNodes.map((node, idx) => {
            const prev = idx > 0 ? state.techNodes[idx - 1] : null;
            const unlocked = node.level >= 2;
            const canUnlock = !unlocked && (!prev || prev.yieldPercent >= 100);
            const yieldPct = node.yieldPercent;
            return (
              <div key={node.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="text-xs font-medium text-slate-100">{node.name}</div>
                <div className="text-[10px] text-slate-400 mt-1">{unlocked ? (yieldPct >= 100 ? "🟢 完美滿級 (100%)" : "🔵 當前研發主力") : "🔒 未解鎖"}</div>
                <div className="mt-2 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500" style={{ width: `${yieldPct}%` }} />
                </div>
                <div className="text-[10px] text-slate-400 mt-1">良率 {yieldPct}% · ASP 基礎</div>
                <div className="text-[10px] text-slate-500 mt-1">每 100 顆毛晶粒可產出 {yieldPct} 顆合格晶片</div>
                {unlocked && yieldPct < 100 && (
                  <button onClick={() => engine.upgradeNodeYield(node.id)} className="mt-2 w-full text-[10px] py-1 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300">🔬 精進製程良率 (+5%)</button>
                )}
                {canUnlock && (
                  <button onClick={() => researchNode(node.id)} className="mt-2 w-full text-[10px] py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">🚀 突破並解鎖 {node.name}</button>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        <h2 className="text-sm font-medium text-indigo-300 mb-3">七大設備專精升級鏈</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {state.equipmentMastery.map((m) => (
            <div key={m.category} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-xs font-medium text-slate-100">{ROLE_LABEL[m.category] ?? m.category}</div>
              <div className="text-[10px] text-slate-400 mt-1">Tier {m.level + 1} · 精準度 {m.masteryYieldPercent}%</div>
              <div className="mt-2 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${m.masteryYieldPercent}%` }} />
              </div>
              {m.masteryYieldPercent < 100 ? (
                <button onClick={() => engine.upgradeEquipmentMastery(m.category)} className="mt-2 w-full text-[10px] py-1 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">🔧 提升設備精準度</button>
              ) : (
                <button className="mt-2 w-full text-[10px] py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300">⚡ 100% 專精達成</button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
