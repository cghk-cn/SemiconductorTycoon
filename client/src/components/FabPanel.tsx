import { useState } from "react";
import { engine } from "../GameEngine";
import type { StateSnapshot } from "../types";

export interface FabPanelProps {
  state: StateSnapshot;
  onAdvanceMonth: () => void;
  onBuyEquipment: (eqId: string) => void;
}

export function FabPanel({ state, onAdvanceMonth, onBuyEquipment }: FabPanelProps) {
  const available = engine.getAvailableEquipment();
  const [selectedEq, setSelectedEq] = useState<string | null>(null);

  const selected = available.find((e) => e.id === selectedEq);
  const affordable = selected ? state.cash >= selected.priceUsd : false;

  return (
    <section className="panel">
      {/* Machine Health Cards */}
      <div>
        <h2 className="text-sm font-display text-neonBlue mb-2">🏭 廠房健康度</h2>
        {state.factories.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center border border-dashed border-neonBlue/20 rounded-xl">
            尚未購買任何機台。請先於「總覽」購買設備以開始生產。
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {state.factories.map((f) => (
              <div key={f.id} className="bg-neonBlue/10 rounded-xl border border-neonBlue/20 p-4">
                <h3 className="text-sm font-medium text-neonBlue mb-2">{f.name}</h3>
                <p className="text-xs text-gray-300">健康度</p>
                <div
                  className="h-2 bg-dark rounded-full overflow-hidden mt-1"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={f.health}
                >
                  <div
                    className={`h-full rounded-full ${
                      f.health > 60 ? "bg-neonGreen" : f.health > 30 ? "bg-neonOrange" : "bg-neonPink"
                    }`}
                    style={{ width: `${f.health}%` }}
                  />
                </div>
                <p className="text-sm font-medium mt-2 text-neonGreen">
                  {f.health?.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase New Equipment Section */}
      <div className="p-4 bg-neonGreen/10 rounded-xl border border-neonGreen/20">
        <h2 className="text-base font-display text-neonGreen mb-3">🛒 購買新機台</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {available.map((eq) => (
            <button
              key={eq.id}
              onClick={() => setSelectedEq(eq.id)}
              className="min-h-[44px] flex items-center justify-between gap-2 text-sm
                         text-neonGreen hover:text-neonBlue active:scale-[0.98] transition-all
                         bg-dark/50 rounded-lg px-3 py-2 border border-neonGreen/20"
            >
              <span className="truncate">{eq.name}</span>
              <span className="shrink-0 font-mono">💰 {eq.priceUsd}K</span>
            </button>
          ))}
        </div>
      </div>

      {/* Purchase Confirmation Modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setSelectedEq(null)}
        >
          <div
            className="bg-darker rounded-xl p-6 max-w-sm w-full border border-neonBlue/30 shadow-neon-blue"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="購買機台確認"
          >
            <h2 className="text-xl font-display text-neonBlue mb-4">購買機台確認</h2>
            <p className="text-sm text-gray-300 mb-2">
              購買 <span className="text-neonGreen font-medium">{selected.name}</span>？
            </p>
            <p className="text-sm text-gray-400 mb-6">
              價格 ${selected.priceUsd}K ・ 目前現金 ${state.cash.toLocaleString()}K
            </p>
            {!affordable && (
              <p className="text-sm text-neonPink mb-4">⚠️ 現金不足，無法完成購買。</p>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  onBuyEquipment(selected.id);
                  setSelectedEq(null);
                }}
                disabled={!affordable}
                className="btn-neon flex-1"
              >
                確認購買
              </button>
              <button onClick={() => setSelectedEq(null)} className="btn-ghost flex-1">
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advance Month Button */}
      <div className="pt-4 border-t border-neonBlue/20">
        <button onClick={onAdvanceMonth} className="btn-neon w-full text-lg sm:text-xl">
          📅 推進下個月
        </button>
      </div>
    </section>
  );
}
