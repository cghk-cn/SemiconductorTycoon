/**
 * Lot Inspector Modal — multi-layer mask progress + defect heatmap.
 */

interface LotInspectionData {
  lotId: string;
  recipeName: string;
  currentStep: number;
  totalSteps: number;
  overallProgress: number;
  maskLayers: Array<{
    layer: number;
    name: string;
    progress: number;
    defectDensity: number;
    completed: boolean;
  }>;
  defectHeatmap: number[][];
  qTimeAtRisk: boolean;
  qTimeMinutesRemaining?: number;
}

interface LotInspectorModalProps {
  lot: LotInspectionData;
  isOpen: boolean;
  onClose: () => void;
  onExpedite?: (lotId: string) => void;
}

export function LotInspectorModal({
  lot,
  isOpen,
  onClose,
}: LotInspectorModalProps) {
  if (!isOpen) return null;

  const avgDefectDensity =
    lot.maskLayers.reduce((sum, l) => sum + l.defectDensity, 0) /
    Math.max(lot.maskLayers.length, 1);

  const heatmapClass = (intensity: number) => {
    if (intensity > 0.7) return "bg-neonPink/70";
    if (intensity > 0.4) return "bg-neonOrange/50";
    if (intensity > 0.15) return "bg-neonBlue/30";
    return "bg-transparent";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-label="良率波向器"
    >
      <div
        className="bg-darker rounded-2xl p-6 max-w-lg w-full border border-neonPurple/40 shadow-[0_0_40px_rgba(157,78,221,0.25)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display text-white">💉 {lot.lotId}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-dark/50 border border-gray-600 hover:border-neonPurple text-gray-400 hover:text-neonPurple transition-colors"
            aria-label="關閉"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-300">{lot.recipeName}</p>
          <p className="text-xs text-gray-500 mt-1">
            工序 {lot.currentStep} / {lot.totalSteps} · 總進度 {lot.overallProgress.toFixed(0)}%
          </p>
        </div>

        <div className="mb-6">
          <div className="flex justify-between mb-1">
            <span className="text-xs text-gray-400">整體進度</span>
            <span className="text-xs font-mono text-neonBlue">{lot.overallProgress.toFixed(0)}%</span>
          </div>
          <div className="h-2.5 bg-dark rounded-full overflow-hidden border border-gray-700">
            <div
              className="h-full bg-gradient-to-r from-neonBlue to-neonPurple rounded-full transition-all duration-500"
              style={{ width: `${lot.overallProgress}%` }}
            />
          </div>
        </div>

        {lot.qTimeAtRisk && (
          <div className="mb-6 p-3 bg-neonPink/10 border border-neonPink/30 rounded-xl">
            <div className="flex items-start gap-2">
              <span className="text-neonPink">⚠</span>
              <div className="text-sm text-neonPink">
                Q-Time 逾期風險 · 剩餘 {lot.qTimeMinutesRemaining?.toFixed(0) ?? "--"} 分鐘
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-xs font-display text-neonPurple uppercase tracking-wider">
              光罩圖層進度
            </h3>
            {lot.maskLayers.map((layer) => (
              <div key={layer.layer} className="space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className={`font-medium ${layer.completed ? "text-neonGreen" : "text-gray-300"}`}>
                    第 {layer.layer} 層 · {layer.name}
                  </span>
                  <span className={`text-[10px] font-mono ${layer.completed ? "text-neonGreen" : "text-gray-300"}`}>
                    {layer.progress.toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 bg-dark rounded-full overflow-hidden border border-gray-700/50">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${layer.progress}%`, backgroundColor: layer.completed ? "#00ff88" : "#00d4ff" }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">
                  D₀ {layer.defectDensity.toFixed(3)} /cm²
                </span>
              </div>
            ))}
            <div className="pt-2 border-t border-gray-800/50">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>平均缺陷密度</span>
                <span className="font-mono">{avgDefectDensity.toFixed(3)} /cm²</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-display text-neonPurple uppercase tracking-wider">
              缺陷熱力圖
            </h3>
            <div className="grid grid-cols-10 gap-0.5 w-48 h-48 mx-auto">
              {lot.defectHeatmap.flat().map((intensity, idx) => (
                <div key={idx} className={`aspect-square ${heatmapClass(intensity)}`} />
              ))}
            </div>
            <p className="text-[10px] text-gray-500 text-center">
              較亮 = 較高缺陷密度區域
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full min-h-[44px] bg-neonPurple text-darker rounded-xl px-4 py-2 font-display font-semibold transition-all active:scale-[0.97] hover:bg-neonPurple/90"
          >
            關閉檢視
          </button>
        </div>
      </div>
    </div>
  );
}
