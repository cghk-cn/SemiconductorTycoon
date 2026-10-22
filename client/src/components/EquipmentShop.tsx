import { useState } from "react";
import type { StateSnapshot } from "../types";

interface EquipmentShopProps {
  state: StateSnapshot;
  onBuyEquipment: (eqId: string) => void;
}

interface ShopEquipment {
  id: string;
  name: string;
  category: string;
  priceUsd: number;
  health?: number;
  processType?: string;
  brand?: string;
  supportedNodes?: string;
  throughputWph?: number;
}

const SHOP_CATALOG: ShopEquipment[] = [
  { id: "litho_scanner", name: "KrF Litho Scanner", category: "fab", priceUsd: 2500, processType: "LITHOGRAPHY", brand: "ASML", supportedNodes: "180nm–350nm", throughputWph: 165 },
  { id: "etch_reactor", name: "Dry Etch Reactor", category: "fab", priceUsd: 300, processType: "ETCHING", brand: "Lam Research", supportedNodes: "180nm–350nm", throughputWph: 45 },
  { id: "cvd_tool", name: "CVD Deposition System", category: "fab", priceUsd: 1200, processType: "DEPOSITION", brand: "Applied Materials", supportedNodes: "90nm–350nm", throughputWph: 28 },
  { id: "cmp_tool", name: "CMP Polisher", category: "fab", priceUsd: 900, processType: "CMP", brand: "Applied Materials", supportedNodes: "130nm–350nm", throughputWph: 35 },
  { id: "implanter", name: "Ion Implanter", category: "fab", priceUsd: 1800, processType: "ION_IMPLANT", brand: "Applied Materials", supportedNodes: "90nm–350nm", throughputWph: 60 },
  { id: "furnace", name: "Thermal Furnace", category: "fab", priceUsd: 600, processType: "THERMAL", brand: "Tokyo Electron", supportedNodes: "90nm–350nm", throughputWph: 120 },
  { id: "clean_station", name: "Wet Clean Station", category: "fab", priceUsd: 450, processType: "CLEAN", brand: "Tokyo Electron", supportedNodes: "90nm–350nm", throughputWph: 90 },
  { id: "inspection", name: "Wafer Inspector", category: "fab", priceUsd: 750, processType: "INSPECTION", brand: "KLA", supportedNodes: "90nm–350nm", throughputWph: 20 },
  { id: "euv_scanner", name: "EUV Scanner NXE:3600D", category: "fab", priceUsd: 320000, processType: "LITHOGRAPHY", brand: "ASML", supportedNodes: "2nm–28nm", throughputWph: 115 },
  { id: "high_na_euv", name: "High-NA EUV EXE:5000", category: "fab", priceUsd: 380000, processType: "LITHOGRAPHY", brand: "ASML", supportedNodes: "1.6nm–28nm", throughputWph: 140 },
  { id: "hybrid_bonder", name: "Hybrid Bonder Xceed", category: "fab", priceUsd: 55000, processType: "PACKAGING", brand: "Besi", supportedNodes: "1.6nm–16nm", throughputWph: 45 },
  { id: "dicing_saw", name: "Dicing Saw DAD3351", category: "fab", priceUsd: 3800, processType: "PACKAGING", brand: "DISCO", supportedNodes: "all nodes", throughputWph: 150 },
];

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
                <h3 className="text-sm font-medium text-white">{eq.name}</h3>
                <span className={
                  affordable
                    ? "text-[10px] font-mono text-neonGreen"
                    : "text-[10px] font-mono text-neonPink"
                }>
                  ${eq.priceUsd.toLocaleString()}K
                </span>
              </div>
              <p className="text-xs text-gray-400 mb-2">{eq.brand} · {eq.processType}</p>
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-gray-500">{eq.supportedNodes}</span>
                <span className="text-[10px] font-mono text-gray-500">{eq.throughputWph} WPH</span>
              </div>
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
