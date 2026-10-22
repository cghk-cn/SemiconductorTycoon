import { engine } from "../GameEngine";
import type { StateSnapshot } from "../types";

const STAGE_LABEL: Record<string, string> = {
  startup: "🏢 初創階段",
  growthature: "📈 成長階段",
  massProduction: "🏭 量產階段",
  exit: "💼 退出階段",
};

export const Dashboard = ({
  state,
  onAdvanceMonth,
  buyEquipment,
}: {
  state: StateSnapshot;
  onAdvanceMonth: () => void;
  researchNode: (nodeId: string) => void;
  buyEquipment: (eqId: string) => void;
}) => {
  const availableEquipment = engine.getAvailableEquipment();

  return (
    <section className="panel">
      {/* Core Values Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Cash */}
        <div className="stat-card bg-neonBlue/10 border-neonBlue/20">
          <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">現金</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-neonGreen">
            {state.cash.toLocaleString()}K
          </p>
        </div>

        {/* Reputation */}
        <div className="stat-card bg-neonGreen/10 border-neonGreen/20">
          <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">聲譽</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-neonOrange">
            {state.reputation}
          </p>
        </div>

        {/* Stage */}
        <div className="stat-card bg-neonOrange/10 border-neonOrange/20">
          <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">階段</p>
          <p className="text-base sm:text-xl font-display font-bold text-neonBlue">
            {STAGE_LABEL[state.stage] ?? state.stage}
          </p>
        </div>

        {/* Revenue */}
        <div className="stat-card bg-neonPurple/10 border-neonPurple/20">
          <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider">本月收益</p>
          <p className="text-2xl sm:text-3xl font-display font-bold text-neonGreen">
            {state.economy.revenue.toLocaleString()}K
          </p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <button onClick={onAdvanceMonth} className="btn-neon w-full text-lg sm:text-xl">
          📅 推進下個月
        </button>

        {/* Equipment Purchase Section */}
        <div>
          <h2 className="text-sm font-display text-neonGreen mb-2">🛒 購買機台</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {availableEquipment.map((eq) => (
              <button
                key={eq.id}
                onClick={() => buyEquipment(eq.id)}
                className="min-h-[44px] bg-dark rounded-lg border border-neonGreen/30 px-4 py-3
                           text-sm text-neonGreen hover:bg-neonGreen/10 active:scale-[0.98]
                           transition-all text-left"
              >
                🛒 {eq.name}
                <span className="block text-xs text-gray-400">${eq.priceUsd}K</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tech Nodes Summary */}
      <div>
        <h2 className="text-sm font-display text-neonBlue mb-2">🔬 製程節點</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {state.techNodes.map((node) => (
            <div key={node.id} className="p-3 bg-neonBlue/10 rounded-xl border border-neonBlue/20">
              <h3 className="text-sm font-medium text-neonGreen">{node.name}</h3>
              <p className="text-xs text-gray-300">成本: {node.costUsd}K</p>
              <p
                className={`text-xs mt-1 ${
                  node.level >= 2
                    ? "text-neonGreen"
                    : node.level === 1
                      ? "text-neonOrange animate-pulse-neon"
                      : "text-gray-500"
                }`}
              >
                {node.level >= 2 ? "已解鎖" : node.level === 1 ? "研發中" : "鎖定"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
