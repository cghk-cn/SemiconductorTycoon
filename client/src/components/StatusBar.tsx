import { useState } from "react";
import type { StateSnapshot } from "../types";
import { HowToPlayModal } from "./HowToPlayModal";

export const StatusBar = ({ state }: { state: StateSnapshot }) => {
  const [guideOpen, setGuideOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 bg-slate-900/90 backdrop-blur-md border-b border-slate-700/60" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <h1 className="text-lg sm:text-xl font-display font-bold text-slate-100 truncate">🏭 Semiconductor Tycoon</h1>
          <div className="flex items-center gap-3 text-xs sm:text-sm shrink-0">
            <button onClick={() => setGuideOpen(true)} className="text-[10px] px-2 py-1 rounded border border-indigo-500/40 bg-indigo-500/10 text-indigo-300">📖 營運指南</button>
            <span className="font-mono text-emerald-500">{state.cash.toLocaleString()}K</span>
          </div>
        </div>
      </header>
      <HowToPlayModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
    </>
  );
};
