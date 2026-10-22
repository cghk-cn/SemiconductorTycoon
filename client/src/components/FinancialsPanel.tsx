import type { Financials } from "../types";

export interface FinancialsPanelProps {
  state: Financials;
  onAdvanceMonth: () => void;
}

export function FinancialsPanel({ state, onAdvanceMonth }: FinancialsPanelProps) {
  const rows: { label: string; value: number; tone: string }[] = [
    { label: "收益", value: state.revenue, tone: "text-neonGreen" },
    { label: "材料成本", value: state.materials, tone: "text-neonOrange" },
    { label: "營運費用 (OPEX)", value: state.opex, tone: "text-neonBlue" },
    { label: "折舊", value: state.depreciation, tone: "text-neonPink" },
  ];

  const balanceRows: { label: string; value: number; tone: string }[] = [
    { label: "現金", value: state.cash, tone: "text-neonGreen" },
    { label: "資產", value: state.assets, tone: "text-neonOrange" },
    { label: "負債", value: state.liabilities, tone: "text-neonPink" },
    { label: "淨值", value: state.assets - state.liabilities, tone: "text-neonBlue" },
  ];

  return (
    <section className="panel">
      {/* Profit & Loss */}
      <div>
        <h2 className="text-base font-display text-neonBlue mb-3">📊 損益明細</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="bg-dark/50 rounded-lg px-3 py-2">
              <span className="block text-xs text-gray-400">{r.label}</span>
              <span className={`font-mono font-semibold ${r.tone}`}>
                {r.value.toLocaleString()}K
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-neonBlue/20">
          <p
            className={`text-lg font-display font-bold ${
              state.netProfit >= 0 ? "text-neonGreen" : "text-neonPink"
            }`}
          >
            稅後淨利: {state.netProfit >= 0 ? "+" : ""}
            {state.netProfit.toLocaleString()}K
          </p>
        </div>
      </div>

      {/* Cash & Assets */}
      <div>
        <h2 className="text-base font-display text-neonBlue mb-3">💰 現金與資產</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {balanceRows.map((r) => (
            <div key={r.label} className="bg-dark/50 rounded-lg px-3 py-2">
              <span className="block text-xs text-gray-400">{r.label}</span>
              <span className={`font-mono font-semibold ${r.tone}`}>
                {r.value.toLocaleString()}K
              </span>
            </div>
          ))}
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
