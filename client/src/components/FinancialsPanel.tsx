import type { StateSnapshot } from "../types";
import { engine } from "../GameEngine";

export function FinancialsPanel({ state }: { state: StateSnapshot }) {
  const financials = engine.getFinancials();
  const diesPerSec = engine.getDiesPerSecond?.() ?? 0;
  return (
    <section className="space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        <h2 className="text-sm font-medium text-indigo-300 mb-2">📐 產能與損益公式</h2>
        <div className="text-xs text-slate-300">毛產速 {diesPerSec.toFixed(1)} dies/s × 良率 = 有效良品 + 報廢</div>
        <div className="text-xs text-emerald-300 mt-1">淨現金流 {financials.netProfit.toLocaleString()}K</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400">收益</div>
          <div className="text-emerald-300 font-mono">{financials.revenue.toLocaleString()}K</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400">材料成本</div>
          <div className="text-amber-300 font-mono">{financials.materials.toLocaleString()}K</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400">營運費用</div>
          <div className="text-amber-300 font-mono">{financials.opex.toLocaleString()}K</div>
        </div>
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
          <div className="text-slate-400">淨利</div>
          <div className="text-emerald-300 font-mono">{financials.netProfit.toLocaleString()}K</div>
        </div>
      </div>
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3">
        <h3 className="text-xs text-slate-400 mb-2">廠房排行</h3>
        {state.fabs.filter((f) => f.unlocked).map((f) => {
          const d = engine.getFabDiagnostics(f.id);
          return (
            <div key={f.id} className="flex justify-between text-xs text-slate-300 py-1 border-b border-slate-800">
              <span>{f.name}</span>
              <span className="font-mono text-indigo-300">{d?.goodDiesPerSecond?.toFixed(1) ?? 0} dies/s · Yield {d?.yieldPercent ?? 0}%</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
