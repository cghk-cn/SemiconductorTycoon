import type { StateSnapshot } from "../types";

export interface ResearchPanelProps {
  state: StateSnapshot;
    researchNode: (nodeId: string) => void;
}

const LEVEL_LABEL = ["鎖定", "研發中", "已解鎖"];

export function ResearchPanel({ state, researchNode }: ResearchPanelProps) {
  return (
    <section className="panel">
      <div>
        <h2 className="text-base font-display text-neonBlue mb-3">🔬 製程研發</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {state.techNodes.map((node) => {
            const unlocked = node.level >= 2;
            const researching = node.level === 1;
            const affordable = state.cash >= node.costUsd;

            return (
              <div
                key={node.id}
                className={`p-4 rounded-xl border flex flex-col items-center text-center
                  ${
                    unlocked
                      ? "bg-neonGreen/10 border-neonGreen/50"
                      : researching
                        ? "bg-neonOrange/10 border-neonOrange/40"
                        : "bg-dark border-neonBlue/20"
                  }`}
              >
                <h3 className="text-sm font-medium text-neonGreen mb-1">{node.name}</h3>
                <p className="text-xs text-gray-400">成本: {node.costUsd}K</p>

                <button
                  onClick={() => researchNode(node.id)}
                  disabled={unlocked || !affordable}
                  className={`mt-3 w-full min-h-[40px] px-3 py-2 text-sm rounded-lg transition-all
                    ${
                      unlocked
                        ? "bg-neonGreen/20 text-neonGreen opacity-70 cursor-not-allowed"
                        : affordable
                          ? "bg-neonBlue/20 text-neonBlue hover:bg-neonBlue/30 active:scale-[0.98]"
                          : "bg-gray-800 text-gray-500 cursor-not-allowed"
                    }`}
                  aria-label={`${node.name} ${unlocked ? "已解鎖" : "開始研發"}`}
                >
                  {unlocked ? "已解鎖" : researching ? "研發中…" : "開始研發"}
                </button>

                <p
                  className={`text-xs mt-2 ${
                    unlocked
                      ? "text-neonGreen"
                      : researching
                        ? "text-neonOrange animate-pulse-neon"
                        : "text-gray-500"
                  }`}
                >
                  {LEVEL_LABEL[node.level] ?? "鎖定"}
                </p>
              </div>
            );
          })}
        </div>
      </div>

{/* Advance Month removed - real-time engine */}
    </section>
  );
}
