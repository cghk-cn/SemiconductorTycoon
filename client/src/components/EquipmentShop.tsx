import { useState } from "react";
import type { StateSnapshot } from "../types";

interface EquipmentShopProps {
  state: StateSnapshot;
  onBuyEquipment: (eqId: string) => void;
}

import { EQUIPMENT_CATALOG as SHOP_CATALOG, type ShopEquipment } from "../equipmentCatalog";

interface CategoryFilter {
  id: string;
  label: string;
}

const CATEGORY_FILTERS: CategoryFilter[] = [
  { id: "all", label: "全部" },
  { id: "litho", label: "微影" },
  { id: "etch", label: "刻蝕" },
  { id: "depo", label: "沉積" },
  { id: "pack", label: "封裝" },
  { id: "other", label: "其他" },
];

export function EquipmentShop({ state, onBuyEquipment }: EquipmentShopProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<string>("price");

  const filtered = SHOP_CATALOG.filter((eq) => {
    const matchesCategory =
      categoryFilter === "all" ||
      (categoryFilter === "litho" && eq.processType === "LITHOGRAPHY") ||
      (categoryFilter === "etch" && eq.processType === "ETCHING") ||
      (categoryFilter === "depo" && eq.processType === "DEPOSITION") ||
      (categoryFilter === "pack" && eq.processType === "PACKAGING") ||
      (categoryFilter === "other" && eq.processType !== "LITHOGRAPHY" && eq.processType !== "ETCHING" && eq.processType !== "DEPOSITION" && eq.processType !== "PACKAGING");
    const matchesSearch = eq.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "price") return a.priceUsd - b.priceUsd;
    if (sortBy === "name") return a.name.localeCompare(b.name);
    return 0;
  });

  const canAfford = (eq: ShopEquipment) => state.cash >= eq.priceUsd;

  return (
    <section className="panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display text-neonGreen">🛒 設備商城</h2>
        <span className="text-xs text-gray-400">{sorted.length} 款設備</span>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
        {CATEGORY_FILTERS.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={
              categoryFilter === cat.id
                ? "whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium bg-neonGreen text-darker"
                : "whitespace-nowrap px-3 py-1.5 rounded-lg text-xs font-medium bg-dark text-gray-400 border border-gray-700 hover:text-neonGreen hover:border-neonGreen/50"
            }
          >
            {cat.label}
          </button>
        ))}
      </div>

      <div className="mb-4">
        <input
          type="text"
          placeholder="搜尋設備…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full min-h-[40px] bg-dark rounded-xl border border-gray-700 px-3 py-2 text-sm focus:border-neonBlue focus:outline-none transition-colors"
        />
      </div>

      <div className="flex justify-end mb-3">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="text-xs bg-dark border border-gray-700 rounded px-2 py-1 text-gray-300"
        >
          <option value="price">價格排序</option>
          <option value="name">名稱排序</option>
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((eq) => {
          const affordable = canAfford(eq);
          return (
            <div key={eq.id} className="bg-dark rounded-xl border p-3 hover:border-neonBlue/40 transition-colors">
              <div className="flex justify-between items-start mb-2">
<div className="flex items-center gap-2 mb-2">
                <img src={`/assets/sprites/tool_${eq.id}.png`} alt={eq.name} className="w-10 h-10 object-contain" />
                <h3 className="text-sm font-medium text-white">{eq.name}</h3>
              </div>
                <span className={
                  affordable
                    ? "text-[10px] font-mono text-neonGreen"
                    : "text-[10px] font-mono text-neonPink"
                }>
                  ${eq.priceUsd.toLocaleString()}K
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{eq.brand} · {eq.processType}</p>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-gray-500">{eq.supportedNodes}</span>
                <span className="text-[10px] font-mono text-gray-500">{eq.throughputWph} WPH</span>
              </div>
              <div className="text-[10px] text-gray-500 mb-2">耗電：{eq.powerKw} kW · 耗材：{eq.materialCostPerWafer}K/片 · MTBF：{eq.mtbfHours}h</div>
              <p className="text-[10px] text-gray-400 mb-3">{eq.description}</p>
              <button
                onClick={() => onBuyEquipment(eq.id)}
                disabled={!affordable}
                className={
                  affordable
                    ? "w-full min-h-[36px] bg-neonGreen text-darker rounded-lg px-3 py-1.5 font-display font-semibold transition-all active:scale-[0.97] hover:bg-neonGreen/90"
                    : "w-full min-h-[36px] bg-dark text-gray-500 rounded-lg px-3 py-1.5 font-display font-semibold border border-gray-600 opacity-50"
                }
              >
                {affordable ? "一鍵購置" : "現金不足"}
              </button>
            </div>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-6">沒有符合條件的設備。</p>
      )}
    </section>
  );
}
