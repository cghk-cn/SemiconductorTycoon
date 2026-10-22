import type { Contract, StateSnapshot } from "../types";

export interface ContractsPanelProps {
  state: StateSnapshot;
  onAdvanceMonth: () => void;
  researchNode: (nodeId: string) => void;
  onAcceptContract: (contractId: string) => void;
  onCompleteContract: (contractId: string) => void;
}

const STATUS_LABEL: Record<Contract["status"], string> = {
  available: "可接取",
  accepted: "進行中",
  completed: "已完成",
};

const STATUS_STYLE: Record<Contract["status"], string> = {
  available: "text-neonBlue",
  accepted: "text-neonOrange animate-pulse-neon",
  completed: "text-neonGreen",
};

export function ContractsPanel({
  state,
  onAdvanceMonth,
  onAcceptContract,
  onCompleteContract,
}: ContractsPanelProps) {
  const contracts = state.contracts;
  const nodeName = (nodeId: string) =>
    state.techNodes.find((n) => n.id === nodeId)?.name ?? nodeId;

  return (
    <section className="panel">
      {/* Active Contract */}
      {contracts
        .filter((c) => c.status === "accepted")
        .map((c) => (
          <div
            key={c.id}
            className="bg-neonBlue/10 rounded-xl border border-neonBlue/30 p-4 animate-in fade-in-0"
          >
            <h2 className="text-base font-display text-neonBlue mb-3">📝 進行中的合約</h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-gray-400 text-xs">合約名稱</p>
                <p className="font-medium">{c.name}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">目標節點</p>
                <p className="font-medium">{nodeName(c.targetNode)}</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">獎勵</p>
                <p className="font-medium text-neonGreen">{c.rewardUsd}K</p>
              </div>
              <div>
                <p className="text-gray-400 text-xs">進度</p>
                <p className="font-medium">{c.progress}%</p>
              </div>
            </div>
            <button
              onClick={() => onCompleteContract(c.id)}
              className="btn-neon-green w-full mt-4"
            >
              ✅ 完成交付
            </button>
          </div>
        ))}

      {/* Available Contracts List */}
      <div>
        <h2 className="text-base font-display text-neonBlue mb-3">📋 合約列表</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {contracts.map((contract) => {
            const target = state.techNodes.find((n) => n.id === contract.targetNode);
            const unlocked = (target?.level ?? 0) >= 2;

            return (
              <div
                key={contract.id}
                className="p-4 rounded-xl border border-neonBlue/20 bg-neonBlue/5 flex flex-col"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-neonGreen">{contract.name}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      目標: {nodeName(contract.targetNode)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-neonOrange font-medium font-mono">
                      {contract.rewardUsd}K
                    </p>
                    <p className="text-[10px] text-gray-400">獎勵</p>
                  </div>
                </div>

                <p className={`text-xs mt-2 ${STATUS_STYLE[contract.status]}`}>
                  {STATUS_LABEL[contract.status]}
                </p>

                <div className="mt-3">
                  {contract.status === "available" && (
                    <button
                      onClick={() => onAcceptContract(contract.id)}
                      disabled={!unlocked}
                      className="btn-neon w-full text-sm"
                    >
                      {unlocked ? "接取合約" : `需先解鎖 ${nodeName(contract.targetNode)}`}
                    </button>
                  )}
                  {contract.status === "accepted" && (
                    <button
                      onClick={() => onCompleteContract(contract.id)}
                      className="btn-neon-green w-full text-sm"
                    >
                      完成交付
                    </button>
                  )}
                  {contract.status === "completed" && (
                    <div className="text-center text-sm text-neonGreen py-2">
                      🎉 已完成交付
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advance Month */}
      <div className="pt-4 border-t border-neonBlue/20">
        <button onClick={onAdvanceMonth} className="btn-neon w-full text-lg sm:text-xl">
          📅 推進下個月
        </button>
      </div>
    </section>
  );
}
