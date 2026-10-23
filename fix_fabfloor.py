f = open('/Users/wongty99/SemiWorld/client/src/components/FabFloorView.tsx', 'r')
content = f.read()
f.close()

# Find the truncation point
idx = content.find('const st')
if idx >= 0:
    # Find end of line
    line_end = content.find('\n', idx)
    if line_end >= 0:
        # Keep everything up to end of line 85 (before 'const st')
        content = content[:line_end + 1]
        
        # Add the missing closing code
        missing = '''      const slotData = fallbackLotData(machine.lotRecipe ?? "");
      setSelectedLot(slotData);
    }
  };

  const zoneContents = zoneGroups.map(([zoneName, zoneMachines]) => (
    <div key={zoneName} className="p-4 rounded-lg border border-slate-700/60 bg-slate-900/80">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-display text-slate-300">{zoneName}</h3>
        <span className="text-[10px] text-slate-500">{zoneMachines.length} 台</span>
      </div>
      <div className="space-y-2">
        {zoneMachines.length === 0 && (
          <p className="text-xs text-slate-500 text-center py-3">暫無設備</p>
        )}
        {zoneMachines.map((machine) => (
          <div
            key={machine.id}
            onClick={() => handleMachineClick(machine)}
            className={machine.status === "PROCESSING"
              ? "group cursor-pointer rounded-lg p-2.5 border bg-slate-800/80 border-emerald-500/40 transition-all hover:scale-[1.02]"
              : machine.status === "DOWN"
                ? "group cursor-pointer rounded-lg p-2.5 border bg-slate-800/80 border-rose-500/40 transition-all hover:scale-[1.02]"
                : machine.status === "MAINTENANCE"
                  ? "group cursor-pointer rounded-lg p-2.5 border bg-slate-800/80 border-amber-500/40 transition-all hover:scale-[1.02]"
                  : "group cursor-pointer rounded-lg p-2.5 border bg-slate-800/80 border-gray-700/60 transition-all hover:scale-[1.02]"}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <AnimatedEquipmentIcon
                  type={machine.category === "litho" ? "euv" : machine.category === "etch" ? "etch" : machine.category === "pack" ? "bonder" : "lot"}
                  size={20}
                />
                <span className="text-xs font-medium text-slate-300 truncate">{machine.name}</span>
              </div>
              <span className={"text-[10px] px-1.5 py-0.5 rounded " + machineCategoryColor(machine.category)}>
                {machine.category}
              </span>
            </div>
            <div className="h-1.5 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50 mb-1">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${machine.health}%`, backgroundColor: healthBarColor(machine.health) }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className={"font-mono " + (machine.health > 60 ? "text-emerald-500" : machine.health > 30 ? "text-amber-500" : "text-rose-500")}>
                {machine.health.toFixed(0)}%
              </span>
              <span className={"text-[10px] " + (machine.status === "PROCESSING" ? "text-emerald-500" : machine.status === "DOWN" ? "text-rose-500" : machine.status === "MAINTENANCE" ? "text-amber-500" : "text-slate-500")}>
                {machine.status === "PROCESSING" ? "🔄" : machine.status === "DOWN" ? "⚠" : "●"}
              </span>
            </div>
            {machine.currentLotId && machine.lotProgress !== undefined && (
              <div className="mt-1.5">
                <div className="h-1 bg-slate-800/80 rounded-full overflow-hidden border border-slate-700/50">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${machine.lotProgress}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500 mt-0.5 block">
                  {machine.lotRecipe ?? ""} {machine.lotProgress.toFixed(0)}%
                </span>
              </div>
            ))
          }))
        )}
      </div>
    </div>
  ));

  return (
    <section className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700/60">
      <div className="space-y-4">
        {zoneContents}
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
        <EquipmentCatalogModal
          state={state}
          isOpen={catalogOpen}
          onClose={() => setCatalogOpen(false)}
          onBuyEquipment={onBuyEquipment}
        />
      </div>
    </section>
  );
}
'''
        content = content + missing

f = open('/Users/wongty99/SemiWorld/client/src/components/FabFloorView.tsx', 'w')
f.write(content)
f.close()
print('Fixed FabFloorView.tsx')
