import type { StateSnapshot } from "../types";

const STAGE_MAP: Record<string, string> = {
  startup: "🏢 初創階段",
  growthature: "📈 成長階段",
  massProduction: "🏭 量產階段",
  exit: "💼 退出階段",
};

export const StatusBar = ({ state }: { state: StateSnapshot }) => {
  return (
    <header
      className="sticky top-0 z-40 bg-darker/90 backdrop-blur-md border-b border-neonBlue/20"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-2 min-w-0">
          <h1 className="text-lg sm:text-xl font-display font-bold text-neonBlue truncate">
            🏭 Semiconductor Tycoon
          </h1>
        </div>

        <div className="flex items-center gap-3 sm:gap-4 text-xs sm:text-sm shrink-0">
          <div className="flex items-center gap-1">
            <span className="text-neonBlue" aria-hidden="true">
              📅
            </span>
            <span className="font-mono">{state.date}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-neonGreen" aria-hidden="true">
              💰
            </span>
            <span className="font-mono font-semibold text-neonGreen">
              {state.cash.toLocaleString()}K
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-neonOrange" aria-hidden="true">
              🌟
            </span>
            <span className="font-mono">{state.reputation}</span>
          </div>
          <div className="hidden sm:flex items-center gap-1">
            <span className="text-neonPurple" aria-hidden="true">
              📊
            </span>
            <span>{STAGE_MAP[state.stage] ?? state.stage}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
