import { useState } from "react";
import type { StateSnapshot } from "../types";
import { MachineInspectorModal } from "./MachineInspectorModal";
import { LotInspectorModal } from "./LotInspectorModal";
import { AnimatedEquipmentIcon } from "./AnimatedEquipmentIcons";

interface FabFloorViewProps {
  state: StateSnapshot;
  onBuyEquipment: (eqId: string) => void;
}

interface FabMachine {
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

function deriveMachines(state: StateSnapshot): FabMachine[] {
  const templates: FabMachine[] = [
    { id: "m1", name: "KrF Stepper #1", category: "litho", health: 96, status: "PROCESSING", currentLotId: "LOT-2024-014", lotProgress: 68, lotRecipe: "180nm GPU", qTimeAtRisk: false },
    { id: "m2", name: "ArF Immersion Scanner", category: "litho", health: 88, status: "IDLE" },
    { id: "m3", name: "Conductor Etch #3", category: "etch", health: 72, status: "PROCESSING", currentLotId: "LOT-2024-015", lotProgress: 34, lotRecipe: "28nm SoC", qTimeAtRisk: false },
    { id: "m4", name: "CVD Dielectric", category: "depo", health: 61, status: "IDLE" },
    { id: "m5", name: "CMP Polisher #2", category: "cmp", health: 44, status: "MAINTENANCE" },
    { id: "m6", name: "High-NA EUV #1", category: "litho", health: 92, status: "PROCESSING", currentLotId: "LOT-2024-016", lotProgress: 12, lotRecipe: "7nm CPU", qTimeAtRisk: true },
    { id: "m7", name: "Ion Implanter", category: "impl", health: 89, status: "IDLE" },
    { id: "m8", name: "Rapid Thermal Anneal", category: "thermal", health: 94, status: "IDLE" },
    { id: "m9", name: "Wet Clean Station", category: "clean", health: 87, status: "IDLE" },
    { id: "m10", name: "Defect Inspector", category: "insp", health: 95, status: "IDLE" },
    { id: "m11", name: "Hybrid Bonder", category: "pack", health: 78, status: "IDLE" },
    { id: "m12", name: "Dicing Saw", category: "pack", health: 91, status: "DOWN" },
  ];
  return templates.map((m) => {
    const factory = state.factories.find((f) => f.id === m.id);
    if (factory) return { ...m, health: factory.health };
    return m;
  });
}

function machineCategoryColor(cat: string): string {
  switch (cat) {
    case "litho": return "bg-neonPurple/20 text-neonPurple border-neonPurple/40";
    case "etch": return "bg-neonOrange/20 text-neonOrange border-neonOrange/40";
    case "depo": return "bg-neonGreen/20 text-neonGreen border-neonGreen/40";
    case "cmp": return "bg-neonPink/20 text-neonPink border-neonPink/40";
    case "pack": return "bg-gray-600/20 text-gray-300 border-gray-600/40";
    default: return "bg-neonBlue/20 text-neonBlue border-neonBlue/40";
  }
}

function healthBarColor(h: number): string {
  return h > 60 ? "#00ff88" : h > 30 ? "#ff6b35" : "#ff2e88";
}

function healthTextColor(h: number): string {
  return h > 60 ? "text-neonGreen" : h > 30 ? "text-neonOrange" : "text-neonPink";
}

interface LotInspectionData {
  lotId: string;
  recipeName: string;
  currentStep: number;
  totalSteps: number;
  overallProgress: number;
  maskLayers: Array<{ layer: number; name: string; progress: number; defectDensity: number; completed: boolean }>;
  defectHeatmap: number[][];
  qTimeAtRisk: boolean;
  qTimeMinutesRemaining?: number;
}

const defaultLot: LotInspectionData = {
  lotId: "LOT-2024-014",
  recipeName: "Retro 180nm Discrete GPU",
  currentStep: 7,
  totalSteps: 15,
  overallProgress: 46,
  maskLayers: [
    { layer: 1, name: "N-Well Patterning", progress: 100, defectDensity: 0.012, completed: true },
    { layer: 2, name: "Gate Patterning", progress: 100, defectDensity: 0.008, completed: true },
    { layer: 3, name: "Contact Patterning", progress: 100, defectDensity: 0.015, completed: true },
    { layer: 4, name: "Metal1 Patterning", progress: 100, defectDensity: 0.011, completed: true },
    { layer: 5, name: "Via1 Patterning", progress: 68, defectDensity: 0.023, completed: false },
    { layer: 6, name: "Metal2 Patterning", progress: 0, defectDensity: 0, completed: false },
  ],
  defectHeatmap: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => Math.random())),
  qTimeAtRisk: false,
};

export function FabFloorView({ state, onBuyEquipment }: FabFloorViewProps) {
  const machines = deriveMachines(state);
  const [selectedMachine, setSelectedMachine] = useState<FabMachine | null>(null);
  const [selectedLot, setSelectedLot] = useState<LotInspectionData | null>(null);

  const lithoMachines = machines.filter((m) => m.category === "litho");
  const etchDepoMachines = machines.filter((m) => m.category === "etch" || m.category === "depo");
  const otherMachines = machines.filter((m) => m.category !== "litho" && m.category !== "etch" && m.category !== "depo");

  const zoneGroups: Array<[string, FabMachine[]]> = [
    ["ISO-3 (先進微影)", lithoMachines],
    ["ISO-5 (刻蝕/沉積)", etchDepoMachines],
    ["ISO-6 (其他前段)", otherMachines],
  ];

  return (
    <section className="panel">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-display text-neonBlue">🏭 視覺化無塵室廠房</h2>
        <div className="flex gap-2">
          <button
            onClick={() => onBuyEquipment("litho_scanner")}
            className="min-h-[40px] px-3 py-1.5 text-xs bg-neonGreen/10 border border-neonGreen/30 text-neonGreen rounded hover:bg-neonGreen/20"
            disabled={state.cash < 2500}
          >
            🛒 購買微影機
          </button>
          <button
            onClick={() => onBuyEquipment("etch_reactor")}
            className="min-h-[40px] px-3 py-1.5 text-xs bg-neonOrange/10 border border-neonOrange/30 text-neonOrange rounded hover:bg-neonOrange/20"
            disabled={state.cash < 300}
          >
            🛒 購買刻蝕機
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {zoneGroups.map(([zoneName, zoneMachines]) => (
          <div key={zoneName} className="rounded-xl border p-3 bg-neonBlue/10 border-neonBlue/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-display text-white">{zoneName}</h3>
              <span className="text-[10px] text-gray-400">{zoneMachines.length} 機</span>
            </div>
            <div className="space-y-2">
              {zoneMachines.length === 0 && (
                <p className="text-xs text-gray-500 text-center py-3">暫無機台</p>
              )}
              {zoneMachines.map((machine) => (
                <div
                  key={machine.id}
                  onClick={() => {
                    setSelectedMachine(machine);
                    if (machine.currentLotId) setSelectedLot(defaultLot);
                  }}
                  className={
                    machine.status === "PROCESSING"
                      ? "group cursor-pointer rounded-lg p-2.5 border bg-neonBlue/20 border-neonBlue/40 transition-all hover:scale-[1.02]"
                      : machine.status === "DOWN"
                        ? "group cursor-pointer rounded-lg p-2.5 border bg-neonPink/10 border-neonPink/30 transition-all hover:scale-[1.02]"
                        : machine.status === "MAINTENANCE"
                          ? "group cursor-pointer rounded-lg p-2.5 border bg-neonOrange/10 border-neonOrange/30 transition-all hover:scale-[1.02]"
                          : "group cursor-pointer rounded-lg p-2.5 border bg-dark/30 border-gray-700 transition-all hover:scale-[1.02]"
                  }
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <AnimatedEquipmentIcon type={machine.category === "litho" ? "euv" : machine.category === "etch" ? "etch" : machine.category === "pack" ? "bonder" : "lot"} size={20} />
                      <span className="text-xs font-medium text-white truncate">{machine.name}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${machineCategoryColor(machine.category)}`}>
                      {machine.category}
                    </span>
                  </div>
                  <div className="h-1.5 bg-dark rounded-full overflow-hidden border border-gray-700/50 mb-1">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${machine.health}%`, backgroundColor: healthBarColor(machine.health) }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px]">
                    <span className={`font-mono ${healthTextColor(machine.health)}`}>
                      {machine.health.toFixed(0)}%
                    </span>
                    <span className={`text-[10px] ${machine.status === "PROCESSING" ? "text-neonGreen" : "text-gray-500"}`}>
                      {machine.status === "PROCESSING" ? "🔄" : machine.status === "DOWN" ? "⚠" : "●"}
                    </span>
                  </div>
                  {machine.currentLotId && machine.lotProgress !== undefined && (
                    <div className="mt-1.5">
                      <div className="h-1 bg-dark rounded-full overflow-hidden border border-gray-700/50">
                        <div className="h-full bg-neonBlue rounded-full" style={{ width: `${machine.lotProgress}%` }} />
                      </div>
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        {machine.lotRecipe ?? ""} {machine.lotProgress.toFixed(0)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {selectedMachine && (
        <MachineInspectorModal
          machine={selectedMachine}
          isOpen={true}
          onClose={() => setSelectedMachine(null)}
          onRepair={() => setSelectedMachine(null)}
          onUpgrade={() => setSelectedMachine(null)}
        />
      )}

      {selectedLot && (
        <LotInspectorModal
          lot={selectedLot}
          isOpen={true}
          onClose={() => setSelectedLot(null)}
        />
      )}
    </section>
  );
}
