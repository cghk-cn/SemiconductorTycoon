
export function HowToPlayModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;
  const sections = [
    { title: "⚡ 30 秒快速上手", body: "① 去商城買設備 → ② 從底部倉庫拖曳進廠房插槽 → ③ 湊齊「微影+刻蝕+沉積」啟動閉環產線 → ④ 升級良率至 100% 突破下一代製程。" },
    { title: "🛠️ 七大設備角色", body: "微影（基礎產量）、刻蝕（產速）、沉積（規模放大）、注入（提高售價）、清洗（提升良率）、檢測（良率乘數+研發點）、封裝（高階溢價）。" },
    { title: "🏭 廠房容量與協同", body: "廠房有總槽位與同類上限；殘缺產線 25%、標準閉環 100%、五站黃金共鳴 135%。" },
    { title: "🔬 良率 100% 突破", body: "把良率升到 100% 可同時拉高產量、消滅廢片原料虧損並解鎖新世代。" },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#131B2E] rounded-2xl p-6 max-w-2xl w-full border border-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display text-slate-100">📖 晶圓廠營運指南</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300">✕</button>
        </div>
        <div className="space-y-3">
          {sections.map((s) => (
            <div key={s.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <div className="text-sm font-medium text-indigo-300 mb-1">{s.title}</div>
              <div className="text-xs text-slate-300 leading-relaxed">{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
