import { useState } from "react";
import type { StateSnapshot } from "../types";
import { EQUIPMENT_CATALOG } from "../equipmentCatalog";
import type { ShopEquipment } from "../equipmentCatalog";

const ROLE_META: Record<string, { label: string; badge: string; color: string; desc: string }> = {
  litho: { label: "微影", badge: "核心圖案引擎", color: "border-indigo-500/50 bg-indigo-500/10 text-indigo-300", desc: "提供基礎毛產量；若微影機數量為 0，產出必為 0。" },
  etch: { label: "刻蝕", badge: "產速推進器", color: "border-amber-500/50 bg-amber-500/10 text-amber-300", desc: "決定產線流轉速度乘數。" },
  depo: { label: "沉積", badge: "結構放大器", color: "border-sky-500/50 bg-sky-500/10 text-sky-300", desc: "每台 +35% 產量規模加成。" },
  implant: { label: "注入/熱處理", badge: "單價增幅器", color: "border-cyan-500/50 bg-cyan-500/10 text-cyan-300", desc: "每台 +25% ASP 單價。" },
  clean: { label: "CMP/清洗", badge: "良率守護者", color: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300", desc: "每台 +10% Yield 並降低廢片率。" },
  insp: { label: "檢測/量測", badge: "全局乘數 & 研發", color: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300", desc: "提升最終良率 ×1.12 並產出 RP/s。" },
  pack: { label: "先進封裝", badge: "終端價值躍遷", color: "border-rose-500/50 bg-rose-500/10 text-rose-300", desc: "+50% ASP 與高級合約產速。" },
};

function roleOf(eq: ShopEquipment): string {
  return eq.roleCategory ?? "litho";
}

interface Props {
  state: StateSnapshot;
  isOpen: boolean;
  onClose: () => void;
  onBuyEquipment: (equipmentId: string) => void;
}

export function EquipmentCatalogModal({ state, isOpen, onClose, onBuyEquipment }: Props) {
  const [tab, setTab] = useState<string>("all");
  const [toast, setToast] = useState<{ message: string; ok: boolean } | null>(null);

  if (!isOpen) return null;

  const tabs = [
    { key: "all", label: "全部" },
    { key: "litho", label: "微影" },
    { key: "etch", label: "刻蝕" },
    { key: "depo", label: "沉積" },
    { key: "implant", label: "注入/熱處理" },
    { key: "clean", label: "CMP/清洗" },
    { key: "insp", label: "檢測/量測" },
    { key: "pack", label: "先進封裝" },
  ];

  const filtered = EQUIPMENT_CATALOG.filter((eq) => tab === "all" || roleOf(eq) === tab);

  const handleBuy = (eqId: string) => {
    const eq = EQUIPMENT_CATALOG.find((e) => e.id === eqId);
    if (!eq) return;
    onBuyEquipment(eqId);
    setToast({ message: `已採購 ${eq.name}`, ok: true });
    setTimeout(() => setToast(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#131B2E] rounded-2xl p-6 max-w-4xl w-full border border-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-display text-slate-100">🏭 設備採購商城</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 text-slate-300 hover:text-white">✕</button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`shrink-0 px-3 py-1.5 rounded-lg text-xs border ${tab === t.key ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300" : "bg-slate-900 border-slate-800 text-slate-400"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
          {filtered.map((eq) => {
            const meta = ROLE_META[roleOf(eq)];
            const canBuy = state.cash >= eq.priceUsd;
            return (
              <div key={eq.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="text-sm font-medium text-slate-100">{eq.name}</div>
                    <div className="text-[10px] text-slate-500">{eq.brand}</div>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border ${meta?.color}`}>【{meta?.badge}】</span>
                </div>
                <p className="text-[10px] text-slate-500 mb-2 line-clamp-2">{eq.description}</p>
                <div className="text-[10px] text-slate-400 mb-2">{meta?.desc}</div>
                <div className="text-[10px] text-slate-500 mb-3">{eq.roleDescription}</div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <span className="text-sm font-bold text-emerald-400">${eq.priceUsd.toLocaleString()}</span>
                  <button
                    onClick={() => handleBuy(eq.id)}
                    disabled={!canBuy}
                    className={`px-3 py-1 rounded text-xs font-semibold border ${canBuy ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/30" : "bg-slate-800 border-slate-700 text-slate-500 cursor-not-allowed"}`}
                  >
                    {canBuy ? "採購" : "餘額不足"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {toast && (
          <div className={`mt-4 p-3 rounded-lg border text-sm ${toast.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
            {toast.ok ? "✓" : "✗"} {toast.message}
          </div>
        )}
      </div>
    </div>
  );
}
