export function OfflineSummaryModal({ summary, onClose }: { summary: any; onClose: () => void }) {
  if (!summary) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-darker rounded-2xl p-6 max-w-md w-full border border-neonBlue/40">
        <h2 className="text-xl font-display text-neonBlue mb-4">離線經營結算戰報</h2>
        <ul className="text-sm space-y-2 text-gray-300">
          <li>離線時長：{Math.round(summary.elapsedMs / 60000)} 分鐘</li>
          <li>換算遊戲天數：{summary.gameDays.toFixed(2)} 天</li>
          <li>總產出晶圓：{summary.wafers}</li>
          <li>淨營收變化：{summary.cashDelta}K</li>
        </ul>
        <button onClick={onClose} className="mt-4 w-full min-h-[40px] bg-neonBlue text-darker rounded-lg">關閉</button>
      </div>
    </div>
  );
}