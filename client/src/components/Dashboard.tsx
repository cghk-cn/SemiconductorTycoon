import { engine } from "../GameEngine";
import type { StateSnapshot } from "../types";

const STAGE_LABEL: Record<string, string> = {
  startup: "🏢 初創階段",
  growth: "📈 成長階段",
  massProduction: "🏭 量產階段",
  exit: "💼 退出階段",
};

export const Dashboard = ({
  state,
  buyEquipment,
}: {
  state: StateSnapshot;
  buyEquipment: (eqId: string) => void;
}) => {
  const availableEquipment = engine.getAvailableEquipment();
  const diesPerSec = engine.getDiesPerSecond?.() ?? 0;
  const cashPerSec = engine.getCashPerSecond?.() ?? 0;

  return (
    <section className="panel">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="stat-card bg-slate-800/80 border-slate-700/60">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">現金</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-emerald-500">
            {state.cash.toLocaleString()}K
          </p>
        </div>

        <div className="stat-card bg-slate-800/80 border-slate-700/60">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">晶粒 / 秒</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-emerald-500">
            {diesPerSec.toLocaleString(undefined, { maximumFractionDigits: 1 })}
          </p>
        </div>

        <div className="stat-card bg-slate-800/80 border-slate-700/60">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">現金流 / 秒</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-emerald-500">
            {cashPerSec >= 0 ? "+" : ""}{cashPerSec.toLocaleString(undefined, { maximumFractionDigits: 2 })}K
          </p>
        </div>

        <div className="stat-card bg-slate-800/80 border-slate-700/60">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">聲譽</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-amber-500">
            {state.reputation}
          </p>
        </div>

        <div className="stat-card bg-slate-800/80 border-slate-700/60">
          <p className="text-[10px] sm:text-xs text-slate-400 uppercase tracking-wider">階段</p>
          <p className="text-base sm:text-xl font-display font-bold text-slate-400">
            {STAGE_LABEL[state.stage] ?? state.stage}
          </p>
        </div>
      </div>

      <div className="space-y-4 mt-4">
        <h2 className="text-sm font-display text-emerald-500 mb-2">🛒 購買機台</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {availableEquipment.map((eq) => (
            <button
              key={eq.id}
              onClick={() => buyEquipment(eq.id)}
              className="min-h-[44px] bg-dark rounded-lg border border-slate-700/60 px-4 py-3 text-sm text-slate-300 hover:bg-slate-700/60 active:scale-[0.98] transition-all text-left"
            >
              🛒 {eq.name}
              <span className="block text-xs text-slate-500">${eq.priceUsd}K</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <h2 className="text-sm font-display text-slate-400 mb-2">🔬 製程節點</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {state.techNodes.map((node) => (
            <div key={node.id} className="p-3 bg-slate-800/80 rounded-xl border border-slate-700/60">
              <h3 className="text-sm font-medium text-emerald-500">{node.name}</h3>
              <p className="text-xs text-slate-400">成本: {node.costUsd}K</p>
              <p className="text-xs mt-1 text-slate-400">
                {node.level >= 2 ? "已解鎖" : node.level === 1 ? "研發中" : "鎖定"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};