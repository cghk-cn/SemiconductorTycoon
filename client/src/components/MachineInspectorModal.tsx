import { useState } from "react";

export interface FabMachine {
  id: string;
  name: string;
  category: string;
  health: number;
  status: "IDLE" | "PROCESSING" | "DOWN" | "MAINTENANCE";
  currentLotId?: string;
  lotProgress?: number;
  lotRecipe?: string;
  qTimeAtRisk?: boolean;
}

interface MachineInspectorModalProps {
  machine: FabMachine;
  isOpen: boolean;
  onClose: () => void;
  onRepair: (id: string) => void;
  onUpgrade: (id: string) => void;
}

export function MachineInspectorModal({
  machine,
  isOpen,
  onClose,
  onRepair,
  onUpgrade,
}: MachineInspectorModalProps) {
  if (!isOpen) return null;

  const healthColor =
    machine.health > 60 ? "text-neonGreen" : machine.health > 30 ? "text-neonOrange" : "text-neonPink";
  const statusColor =
    machine.status === "PROCESSING"
      ? "bg-neonGreen/20 text-neonGreen border-neonGreen/40"
      : machine.status === "IDLE"
        ? "bg-neonBlue/20 text-neonBlue border-neonBlue/40"
        : machine.status === "MAINTENANCE"
          ? "bg-neonOrange/20 text-neonOrange border-neonOrange/40"
          : "bg-neonPink/20 text-neonPink border-neonPink/40";

  const [toast, setToast] = useState<{ message: string; tone: "success" | "error" } | null>(null);

  const handleRepair = () => {
    onRepair(machine.id);
    setToast({ message: `已派遣維修工程師前往 ${machine.name}`, tone: "success" });
    setTimeout(() => setToast(null), 2000);
  };

  const handleUpgrade = () => {
    onUpgrade(machine.id);
    setToast({ message: `${machine.name} 零件升級已啟用`, tone: "success" });
    setTimeout(() => setToast(null), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="機台詳情"
    >
      <div
        className="bg-darker rounded-2xl p-6 max-w-md w-full border border-neonBlue/40 shadow-[0_0_40px_rgba(0,212,255,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display text-white">{machine.name}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dark/50 border border-gray-600 hover:border-neonBlue text-gray-400 hover:text-neonBlue transition-colors"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-3 bg-dark/30 rounded-xl border border-gray-700">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">機号狀態</p>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded ${statusColor}`}>
              {machine.status === "PROCESSING" ? "●" : "○"} {machine.status}
            </span>
          </div>
          <div className="p-3 bg-dark/30 rounded-xl border border-gray-700">
            <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">即時健康度</p>
            <div className="flex items-center gap-2">
              <span className={`text-sm font-mono font-bold ${healthColor}`}>
                {machine.health.toFixed(1)}%
              </span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">健康標範</span>
            <span className={`text-xs font-mono ${healthColor}`}>{machine.health.toFixed(1)}%</span>
          </div>
          <div className="h-3 bg-dark rounded-full overflow-hidden border border-gray-700">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${machine.health}%`, backgroundColor: machine.health > 60 ? "#00ff88" : machine.health > 30 ? "#ff6b35" : "#ff2e88" }}
            />
          </div>
        </div>

        {machine.currentLotId && machine.lotProgress !== undefined && (
          <div className="mb-6">
            <div className="flex justify-between mb-1">
              <span className="text-xs text-gray-400">當前智圖払次</span>
              <span className="text-xs text-neonBlue">{machine.currentLotId}</span>
            </div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-gray-400">{machine.lotRecipe ?? "未知裝程"}</span>
              {machine.qTimeAtRisk && (
                <span className="text-[10px] bg-neonPink/20 text-neonPink px-1.5 py-0.5 rounded animate-pulse-neon">
                  ⚠ Q-Time 風險
                </span>
              )}
            </div>
            <div className="h-2 bg-dark rounded-full overflow-hidden border border-gray-700">
              <div className="h-full bg-neonBlue rounded-full transition-all duration-500" style={{ width: `${machine.lotProgress}%` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1">進度 {machine.lotProgress.toFixed(0)}%</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-800">
          <button
            onClick={handleRepair}
            disabled={machine.status === "DOWN"}
            className={`min-h-[44px] bg-dark text-gray-300 rounded-xl px-4 py-2 font-display font-semibold transition-colors border border-gray-600 hover:bg-gray-700 hover:border-neonBlue ${machine.status === "DOWN" ? "opacity-50 cursor-not-allowed" : "hover:text-white"}`}
          >
            🤧 按判網報
          </button>
          <button
            onClick={handleUpgrade}
            className="min-h-[44px] bg-neonBlue text-darker rounded-xl px-4 py-2 font-display font-semibold transition-all active:scale-[0.97] hover:bg-neonBlue/90 hover:shadow-neon-blue"
          >
            ⬆ 升級零件
          </button>
        </div>

        {toast && (
          <div
            className={`mt-4 p-3 rounded-lg border text-sm flex items-center gap-2 ${toast.tone === "success" ? "bg-neonGreen/10 border-neonGreen/30 text-neonGreen" : "bg-neonPink/10 border-neonPink/30 text-neonPink"}`}
          >
            {toast.tone === "success" ? "✓" : "✗"} {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
