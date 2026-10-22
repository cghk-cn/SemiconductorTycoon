# SemiWorld — Semiconductor Tycoon

The pure-TypeScript foundation for **Semiconductor Tycoon**, a hardcore
semiconductor-fab simulation/management game (later extensible to data
centers). Everything is **engine- and GUI-agnostic**: standard TypeScript with
full type definitions and defensive runtime validation — no game engine, no
framework, no runtime dependencies.

- **Step 1 — Core domain models & data schemas** (`src/domain/`): equipment,
  recipes, wafer lots, yield models, capability gates, validation.
- **Step 2 — Factory simulation engine** (`src/factory/`): mutable machines,
  cleanroom zones, input/output buffers, Q-Time limits, scheduling policies,
  tick progression, breakdowns & repair, defect accumulation.

## Why TypeScript on Node 24

- Runs directly with **native type-stripping** (`node file.ts`) — no build step
  to run or test. Code uses only *erasable* syntax (`const`-object "enums",
  interfaces, type aliases), so `erasableSyntaxOnly` is enabled.
- Ships a built-in test runner (`node:test`), so the whole project is
  dependency-free at runtime.
- Strict typing keeps a clean seam for a later engine/UI layer.

## Quick start

```bash
npm install        # dev-only: typescript (pinned 5.8.3) + @types/node
npm run typecheck  # tsc --noEmit (strict)
npm test           # node --test "tests/*.test.ts"  → 74 tests
npm run demo       # walk a 25-wafer 180nm GPU lot through the fab (Step 1)
npm run sim        # 100-tick live factory simulation (Step 2)
```

`npm run demo` prints every process step, the running defect density, and the
final net-good-die count from the Murphy yield model.

`npm run sim` runs the Step 2 engine: it releases a lot, dispatches it through
lithography → etch, streams a live event feed with machine health, injects a
fault, dispatches a repair crew, and prints the final yield and event tally.


## Architecture

```
src/domain/
  enums.ts        ProcessType, TechnologyNode, WaferSize, ComponentCategory,
                  LotStatus, MaintenanceState, PackagingType, MaterialCategory,
                  LithoSource (const-objects + union types)
  validation.ts   ValidationError + require* guards + deepFreeze (defensive layer)
  nodeSpecs.ts    Per-node metadata: rank, year, litho source, mask count,
                  mature defect density, wafer sizes, cost, complexity
  constants.ts    FAB_CONVENTIONS (25-wafer FOUP, thresholds), wafer geometry
                  (area in cm²), real-world brand catalog
  equipment.ts    Equipment schema + validating factory + capability gates
                  (node/wafer/operational) + wear-scaled effective defect rate
  recipe.ts       ProductRecipe: materials, ordered ProcessStep[], packaging
                  spec (+ companion MLCC requirement), and a CMOS pipeline
                  builder that unrolls the FEOL/BEOL mask loops
  waferLot.ts     WaferLot tracking: step index, accumulated defect density,
                  status, per-step log; pure transitions (completeStep/scrap)
  yield.ts        Gross-dies-per-wafer geometry + Murphy's yield model (default)
                  + Poisson/Seeds alternates + computeLotYield aggregate
  lotRunner.ts    Dispatches each step to a machine, validates capability,
                  accumulates intrinsic + wear-scaled machine defects
  index.ts        Barrel export
src/samples/
  sampleEquipment.ts  ASML TWINSCAN NXT:2000i (immersion) + Lam Research Kiyo FX
                      (the two briefed flagships) + a full 180nm-era toolset
                      (ASML PAS 5500/550, Lam TCP 9400, Applied Centura CVD /
                      VIISta / Mirra, TEL furnace + cleaner, KLA 2130)
  sampleRecipes.ts    "Retro 180nm Discrete GPU" — 6 metal layers, ~140 mm² die,
                      BGA package requiring ≥6 MLCC decoupling caps
tests/domain.test.ts  48 unit tests across every Step 1 module
scripts/demo.ts       End-to-end lot traversal + yield computation
```

## Step 2 — factory simulation engine

```
src/factory/
  enums.ts        MachineState (IDLE/PROCESSING/DOWN/MAINTENANCE) and
                  SchedulingPolicy (FIFO/SHORTEST_JOB_FIRST/URGENT_FIRST)
  zone.ts         CleanroomZone: ISO-class validation + ambient defect rate
  machine.ts      MachineInstance: live state, health/wear, PM & repair helpers
  lot.ts          FactoryLot: wraps a Step 1 WaferLot with scheduling metadata
  events.ts       FactoryEvent / EventLogger — the engine's only output channel
  policy.ts       Queue ranking (FIFO, SJF, urgent-first) with eligibility gates
  buffer.ts       Input/output buffers, routing eligibility, Q-Time rules, scrap sweep
  simulation.ts   createFactory, releaseLot, factoryTick, breakdown/repair actions
  index.ts        Barrel export
tests/factory.test.ts  26 unit tests across every Step 2 module
scripts/factorySim.ts  100-tick integration run with a live event feed
```

### The tick loop

`factoryTick(f)` advances the fab by one time step (`tickMinutes`, default 1
minute) in four phases:

1. **Progress** — `PROCESSING` machines tick down their `progressTimer` and
   accrue wear. A machine that reaches zero completes the step, accrues
   defects, and routes the lot to the next step's machine.
2. **Breakdowns** — a machine at or below `breakdownHealthThresholdPercent`
   (default 8%) hard-fails, and a seeded RNG can inject random faults scaled
   by poor health. A machine that dies mid-process scraps its lot.
3. **Preventive maintenance** — machines in `MAINTENANCE` are restored to
   `IDLE` when their PM window elapses.
4. **Dispatch** — idle machines pull the next eligible lot from their input
   buffer according to the active scheduling policy, then all buffers are swept
   for Q-Time violations.

Process time is derived from the tool's throughput:
`(wafersPerLot / throughputWph) × 60` minutes, so a 25-wafer lot on a
1500-wph tool takes exactly one minute.

### Defect accumulation

Each completed step adds three contributions to the lot's running defect
density (defects/cm², the unit the Step 1 yield models consume):

- the step's **intrinsic** process defect density,
- the machine's **live health-scaled** defect rate
  (`base × (1 + (100 − health)/100)`), so a worn tool makes worse wafers,
- the **cleanroom ambient** rate of the zone the machine sits in.

### Q-Time

Q-Time limits are declared per routing hop (`{ after, before, maxWaitMinutes }`).
When a lot is enqueued for the next step, it receives a deadline derived from
the matching rule. Every tick, buffered lots past their deadline are removed
from the queue and marked `SCRAPPED` with a Q-Time reason — the classic fab
failure mode where a lot dies in a queue.

### Scheduling policies

`SchedulingPolicy` is the player's main lever. All three policies respect
*eligibility* (the machine's process type must match the lot's next step) and
differ only in how they rank the eligible set:

| Policy | Orders by | Gameplay role |
| --- | --- | --- |
| `FIFO` | oldest arrival first | default, order-preserving, no starvation |
| `SHORTEST_JOB_FIRST` | smallest lot first | maximizes throughput |
| `URGENT_FIRST` | highest priority, then FIFO | honors VIP orders / expedites |

### Determinism

Breakdown RNG is a seeded mulberry32 (`rngSeed`, default 42), so a given seed
replays the same fault sequence exactly. This keeps the simulation testable and
lets a future save/load feature reproduce runs.

### Player actions

The engine exposes two explicit actions that the game layer will call:
`forceBreakdownAction(f, machineId)` (inject a fault) and
`dispatchRepairAction(f, machineId, restoreHealthPercent, costUsd)` (send a
repair crew). `scheduleMaintenance` on a machine opens a PM window.


## Key domain decisions

- **Enums as const objects.** TypeScript `enum`/`namespace` are *not* erasable,
  so they would break Node's native type-stripping. Const-object unions give the
  same literal-type narrowing plus real runtime values.
- **Defensive validation.** Every `create*` factory validates its inputs and
  throws a field-named `ValidationError`. This matters most at the future
  save-file / JSON boundary where data is `any`. Entities are deep-frozen.
- **Node capability windows** are expressed by feature size
  (`mostAdvancedNm` ≤ node ≤ `mostMatureNm`), matching how fabs talk about tool
  support; node *ordering* uses a numeric rank (2nm = most advanced).
- **Defect accumulation** is in **defects/cm²** (the unit yield models consume),
  so a lot's running `accumulatedDefectDensityPerCm2` feeds Murphy directly.
  Each step contributes its intrinsic rate plus the machine's base rate scaled
  by a wear multiplier (poorer health ⇒ more defects), making maintenance
  mechanically meaningful. (Cleaners are modeled as near-zero, not net-negative
  — defect *removal* is a v2 concern.)
- **Yield model.** Murphy: `Y = [ (1 − e^(−D₀·A)) / (D₀·A) ]²`. Gross dies per
  wafer uses the standard circular-wafer approximation with an edge-exclusion
  band: `N = π(Deff/2)²/A − πDeff/√(2A)`. `computeLotYield` combines both into
  net good dies for the whole lot.
- **Immutable domain, mutable runtime.** Step 1 records (`WaferLot`,
  `Equipment`, `ProductRecipe`) stay frozen and functional; Step 2 keeps its
  live state (`MachineInstance`, `Factory`, buffers) in separate mutable
  objects. The two layers meet only at explicit boundaries — `completeStep` /
  `scrapLot` return a *new* domain lot, which the runtime swaps in.
- **Events are the only output channel.** The engine never prints or writes
  anything itself. Every state change becomes a `FactoryEvent` appended to
  `factory.events` and handed to an optional `EventLogger` callback, so the
  same engine drives both the CLI script and a future GUI.

## Realism notes / simplifications

- The CMOS pipeline builder emits a representative FEOL+BEOL flow (well → gate
  → contact → metal/via stack → passivation). Mask count is derived from the
  structure (2·metalLayers + 4), intentionally a little below a full industrial
  flow (which adds Vt/halo/salicide/edge-seal masks).
- Equipment brands/models are real (ASML, Lam Research, Applied Materials,
  Tokyo Electron, KLA); node windows and prices are realistic approximations
  tuned as game-balance knobs (`NODE_SPECS`, `FAB_CONVENTIONS`).
- **Step 1:** step durations are *processing* time only. Step 2 adds the
  queue/hold time that makes real cycle time days-to-weeks.

## Step 2 limitations (known, for later steps)

- **Routing is one tool per process type.** `Factory.routing` maps a
  `ProcessType` to a single machine (last one registered wins), so parallel
  identical tools, tool choice by recipe, and capacity balancing are not yet
  modeled. Duplicate machine *IDs* are rejected.
- **No economics yet.** `dispatchRepairAction` takes a `costUsd` and logs it,
  but nothing tracks spend, revenue, or a balance.
- **No operator/labor model.** A repair crew is instantaneous and free apart
  from the passed-in cost; there is no queue of technicians.
- **No per-lot reticle/alignment or chamber-contamination model.** Defects are
  a lump sum per step, not Poisson-sampled per wafer.
- **PM is a scheduled window, not a policy.** The engine will end a PM window
  on time, but nothing yet decides *when* to schedule one based on load.
- **No multi-lot-per-machine concurrency.** A machine processes exactly one lot
  at a time; setup/changeover time is not modeled separately.
- **Save/load is not implemented.** Determinism via `rngSeed` is designed to
  make it reproducible, but the factory state is not serializable yet.

