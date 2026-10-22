import { useState } from "react";
import type { StateSnapshot } from "../types";

interface ResearchTreeViewProps {
  state: StateSnapshot;
  researchNode: (nodeId: string) => void;
}

// Full technology chain from mature to advanced nodes.
const TECH_CHAIN = [
  { id: "350nm", name: "350 nm", family: "Bulk CMOS", cost: 0, prereq: null },
  { id: "180nm", name: "180 nm", family: "Bulk CMOS", cost: 0, prereq: "350nm" },
  { id: "90nm", name: "90 nm", family: "Bulk CMOS", cost: 0, prereq: "180nm" },
  { id: "28nm", name: "28 nm", family: "Bulk CMOS", cost: 0, prereq: "90nm" },
  { id: "7nm", name: "7 nm", family: "FinFET", cost: 500, prereq: "28nm" },
  { id: "3nm", name: "3 nm", family: "FinFET (EUV)", cost: 1200, prereq: "7nm" },
  { id: "2nm", name: "2 nm", family: "GAA", cost: 2500, prereq: "3nm" },
  { id: "a16", name: "A16 (CFET)", family: "CFET (High-NA EUV)", cost: 5000, prereq: "2nm" },
];

// Map engine tech node IDs to chain IDs where possible.
const ENGINE_NODE_MAP: Record<string, string> = {
  wafers_500mm: "350nm",
  "7nm": "7nm",
  a16: "a16",
};

function getNodeStatus(
  chainId: string,
  state: StateSnapshot
): { level: number; costUsd: number } {
  // Try direct match first
  const direct = state.techNodes.find((n) => n.id === chainId);
  if (direct) return { level: direct.level, costUsd: direct.costUsd };
  // Try mapped engine node
  const engineId = Object.keys(ENGINE_NODE_MAP).find((k) => ENGINE_NODE_MAP[k] === chainId);
  if (engineId) {
    const mapped = state.techNodes.find((n) => n.id === engineId);
    if (mapped) return { level: mapped.level, costUsd: mapped.costUsd };
  }
  // Default: locked with chain cost
  const chain = TECH_CHAIN.find((c) => c.id === chainId);
  return { level: 0, costUsd: chain?.cost ?? 0 };
}

function getEngineNodeId(chainId: string): string | null {
  const entry = Object.entries(ENGINE_NODE_MAP).find(([, v]) => v === chainId);
  return entry ? entry[0] : null;
}

export function ResearchTreeView({ state, researchNode }: ResearchTreeViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  return (
    <section className="panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display text-neonPurple">🌳 研發科技樹</h2>
        <span className="text-xs text-gray-400">{state.techNodes.filter((n) => n.level >= 2).length} / {state.techNodes.length} 已解鎖</span>
      </div>

      {/* Horizontal scrollable tree */}
      <div className="overflow-x-auto pb-4">
        <div className="flex items-center gap-2 min-w-max px-2">
          {TECH_CHAIN.map((node, idx) => {
            const { level, costUsd } = getNodeStatus(node.id, state);
            const unlocked = level >= 2;
            const researching = level === 1;
            const locked = level === 0;
            const affordable = state.cash >= costUsd;
            const engineId = getEngineNodeId(node.id);
            const canResearch = !!engineId && !unlocked && affordable;
            const prereqNode = node.prereq ? TECH_CHAIN.find((c) => c.id === node.prereq) : null;
            const prereqStatus = node.prereq ? getNodeStatus(node.prereq, state) : null;
            const prereqUnlocked = prereqStatus ? prereqStatus.level >= 2 : true;

            return (
              <div key={node.id} className="flex items-center">
                {/* Node card */}
                <div
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                  className={`relative w-36 rounded-xl border p-3 cursor-pointer transition-all hover:scale-[1.02] ${
                    unlocked
                      ? "bg-neonGreen/10 border-neonGreen/50 shadow-neon-green"
                      : researching
                        ? "bg-neonBlue/10 border-neonBlue/50 animate-pulse-neon"
                        : locked
                          ? "bg-dark/50 border-gray-700 grayscale"
                          : "bg-dark border-neonBlue/20"
                  }`}
                >
                  <div className="text-center">
                    <div className={`text-sm font-display font-bold ${
                      unlocked ? "text-neonGreen" : researching ? "text-neonBlue" : "text-gray-500"
                    }`}>
                      {node.name}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-1">{node.family}</div>
                    <div className={`text-xs mt-2 font-mono ${
                      unlocked ? "text-neonGreen" : researching ? "text-neonBlue" : "text-gray-500"
                    }`}>
                      {unlocked ? "✅ 已解鎖" : researching ? "🔬 研發中" : "🔒 鎖定"}
                    </div>
                    {!unlocked && (
                      <div className="text-[10px] text-gray-500 mt-1">${costUsd}K</div>
                    )}
                  </div>

                  {/* Progress bar for researching */}
                  {researching && (
                    <div className="mt-2 h-1.5 bg-dark rounded-full overflow-hidden border border-gray-700/50">
                      <div className="h-full bg-neonBlue rounded-full animate-pulse" style={{ width: "50%" }} />
                    </div>
                  )}

                  {/* Selected detail panel */}
                  {selectedNode === node.id && (
                    <div className="absolute top-full left-0 mt-2 w-48 bg-darker border border-neonBlue/30 rounded-lg p-3 z-10 shadow-lg">
                      <p className="text-xs text-gray-300 mb-2">
                        前置節點: {prereqNode ? prereqNode.name : "無（根節點）"}
                      </p>
                      {!prereqUnlocked && prereqNode && (
                        <p className="text-xs text-neonPink mb-2">⚠ 需先解鎖 {prereqNode.name}</p>
                      )}
                      <p className="text-xs text-gray-400 mb-2">研發成本: ${costUsd}K</p>
                      {!unlocked && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (engineId) researchNode(engineId);
                          }}
                          disabled={!canResearch || !prereqUnlocked}
                          className={`w-full min-h-[32px] text-xs rounded-lg transition-all ${
                            canResearch && prereqUnlocked
                              ? "bg-neonBlue/20 text-neonBlue hover:bg-neonBlue/30 active:scale-[0.98]"
                              : "bg-gray-800 text-gray-500 cursor-not-allowed"
                          }`}
                        >
                          {unlocked ? "已解鎖" : researching ? "研發中…" : "開始研發"}
                        </button>
                      )}
                      {!engineId && !unlocked && (
                        <p className="text-[10px] text-gray-500 mt-1">此節點暫未開放</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Connector arrow */}
                {idx < TECH_CHAIN.length - 1 && (
                  <div className="flex items-center mx-1">
                    <div className={`w-6 h-0.5 ${
                      getNodeStatus(TECH_CHAIN[idx + 1].id, state).level >= 2 || getNodeStatus(node.id, state).level >= 2
                        ? "bg-neonGreen/50"
                        : "bg-gray-700"
                    }`} />
                    <div className={`w-0 h-0 border-t-4 border-b-4 border-l-4 border-transparent ${
                      getNodeStatus(TECH_CHAIN[idx + 1].id, state).level >= 2
                        ? "border-l-neonGreen/50"
                        : "border-l-gray-700"
                    }`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-400 mt-2">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-neonGreen/30 border border-neonGreen/50" /> 已解鎖</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-neonBlue/30 border border-neonBlue/50 animate-pulse-neon" /> 研發中</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-dark border border-gray-700 grayscale" /> 鎖定</span>
      </div>
    </section>
  );
}
