/**
 * Semiconductor Tycoon — the 15-node front-end-of-line process flow.
 *
 * This module is the canonical description of *how a wafer moves through the
 * fab*. Every other subsystem (recipes, equipment catalog, weekly scheduler,
 * the React fab-floor UI) derives from this single table:
 *
 *   processFlow.ts  ──►  processCatalog.ts  (equipment + recipes)
 *                 └──►  factory/weekly.ts    (weekly schedule + WIP)
 *                 └──►  client/src            (fab-floor visualisation)
 *
 * The flow is deliberately expressed as 15 *stages* rather than 15 distinct
 * `ProcessType`s: the domain already models 11 physical process types, and
 * several stages legitimately share one (three implantation stages, two
 * lithography stages, two inspection stages). The factory router maps a
 * process type to a machine, so stages that share a type share a tool class —
 * exactly like a real fab, where one implanter platform runs well, source/drain
 * and LDD recipes in sequence.
 *
 * Pure, deterministic, no I/O. Browser-safe (no Node imports).
 */

import { ProcessType, TechnologyNode } from './enums.ts';
import { deepFreeze, requireNonNegativeNumber, requirePositiveNumber } from './validation.ts';

// ---------------------------------------------------------------------------
// Stage identity
// ---------------------------------------------------------------------------

/** Stable identifiers for the 15 process-flow stages. */
export const ProcessNodeId = {
  INCOMING_INSPECTION: 'INCOMING_INSPECTION',
  PRE_PROCESS_CLEAN: 'PRE_PROCESS_CLEAN',
  FIELD_OXIDATION: 'FIELD_OXIDATION',
  N_WELL_IMPLANT: 'N_WELL_IMPLANT',
  P_WELL_IMPLANT: 'P_WELL_IMPLANT',
  GATE_STACK_DEPOSITION: 'GATE_STACK_DEPOSITION',
  GATE_LITHOGRAPHY: 'GATE_LITHOGRAPHY',
  GATE_ETCH: 'GATE_ETCH',
  SOURCE_DRAIN_IMPLANT: 'SOURCE_DRAIN_IMPLANT',
  ACTIVATION_ANNEAL: 'ACTIVATION_ANNEAL',
  INTERLAYER_DIELECTRIC: 'INTERLAYER_DIELECTRIC',
  CONTACT_LITHOGRAPHY: 'CONTACT_LITHOGRAPHY',
  CONTACT_ETCH: 'CONTACT_ETCH',
  METAL_INTERCONNECT: 'METAL_INTERCONNECT',
  FINAL_INSPECTION: 'FINAL_INSPECTION',
} as const;
export type ProcessNodeId = (typeof ProcessNodeId)[keyof typeof ProcessNodeId];

// ---------------------------------------------------------------------------
// Stage specification
// ---------------------------------------------------------------------------

/**
 * One stage of the 15-node flow.
 *
 * The numbers here are the primary balance knobs of the whole game:
 * `cycleTimeMinutes` sets the fab's throughput ceiling, `yieldPercent` sets
 * how much value a lot keeps per stage, and `unlockNode` sets the pacing at
 * which the player unlocks new capability.
 */
export interface ProcessNodeSpec {
  /** Stable id (see {@link ProcessNodeId}). */
  readonly nodeId: ProcessNodeId;
  /** English display name. */
  readonly name: string;
  /** Traditional-Chinese display name (the client UI is zh-TW). */
  readonly nameZh: string;
  /** 1-based position in the flow. The sequence is strictly increasing. */
  readonly sequence: number;
  /** Which class of tool runs this stage. */
  readonly processType: ProcessType;
  /** Cycle time for one full lot, in minutes. */
  readonly cycleTimeMinutes: number;
  /** Probability (0–100) that a wafer survives this stage unscraped. */
  readonly yieldPercent: number;
  /** Intrinsic defect density this stage adds, in defects/cm². */
  readonly defectDensityPerCm2: number;
  /** Max minutes a lot may wait *before* this stage (Q-Time), or null. */
  readonly queueTimeLimitMinutes: number | null;
  /** True when the stage is a metrology/inspection gate. */
  readonly isInspection: boolean;
  /** Technology node that must be unlocked before this stage can run. */
  readonly unlockNode: TechnologyNode;
  /** Material ids consumed per wafer at this stage. */
  readonly consumesMaterialIds: readonly string[];
  /** Short player-facing description of what the stage does. */
  readonly description: string;
  /** True when the stage uses a photomask (lithography). */
  readonly usesMask: boolean;
}

/** Factory helper that validates + freezes one stage specification. */
function stage(input: ProcessNodeSpec): ProcessNodeSpec {
  requirePositiveNumber(input.sequence, `stage.${input.nodeId}.sequence`);
  requirePositiveNumber(input.cycleTimeMinutes, `stage.${input.nodeId}.cycleTimeMinutes`);
  requireNonNegativeNumber(input.defectDensityPerCm2, `stage.${input.nodeId}.defectDensityPerCm2`);
  const y = requireNonNegativeNumber(input.yieldPercent, `stage.${input.nodeId}.yieldPercent`);
  if (y > 100) {
    throw new RangeError(`stage.${input.nodeId}.yieldPercent must be <= 100`);
  }
  return deepFreeze(input);
}

/**
 * The canonical 15-stage front-end-of-line flow.
 *
 * Balance rationale:
 *  - **Cycle times** are per-lot and follow real fab practice: cleans and
 *    oxidations are long-batch furnace steps (25-60 min), litho is fast but
 *    mask-limited (40-42 min), and final interconnect is the slowest step.
 *  - **Yields** compound multiplicatively across the flow, so a full 15-stage
 *    run lands near ~70% wafer survival at 350nm and ~55% at 90nm. The player
 *    must buy better inspection and process control to claw that back.
 *  - **Q-Time** (queue-time limit) is enforced on stages where real fabs
 *    impose a clock: resist that waits too long after coat will bake, and
 *    a queued wafer picks up contamination.
 */
export const PROCESS_FLOW: readonly ProcessNodeSpec[] = deepFreeze([
  stage({
    nodeId: ProcessNodeId.INCOMING_INSPECTION,
    name: 'Incoming Wafer Inspection',
    nameZh: '進料晶圓檢測',
    sequence: 1,
    processType: ProcessType.INSPECTION,
    cycleTimeMinutes: 20,
    yieldPercent: 99.5,
    defectDensityPerCm2: 0.02,
    queueTimeLimitMinutes: null,
    isInspection: true,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: [],
    description: 'Optical and resistivity mapping of incoming bare wafers. Rejects out-of-spec boule.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.PRE_PROCESS_CLEAN,
    name: 'Pre-Process Clean',
    nameZh: '前段清洗',
    sequence: 2,
    processType: ProcessType.CLEAN,
    cycleTimeMinutes: 25,
    yieldPercent: 99.7,
    defectDensityPerCm2: 0.03,
    queueTimeLimitMinutes: 720,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_clean_rca', 'mat_clean_hf'],
    description: 'RCA and dilute HF organic strip. The cleanest possible surface before oxidation.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.FIELD_OXIDATION,
    name: 'Field Oxidation',
    nameZh: '場氧化',
    sequence: 3,
    processType: ProcessType.THERMAL,
    cycleTimeMinutes: 55,
    yieldPercent: 99.4,
    defectDensityPerCm2: 0.05,
    queueTimeLimitMinutes: 1440,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_gas_o2', 'mat_gas_n2'],
    description: 'Wet-oxygen furnace grows the field oxide that isolates the transistor.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.N_WELL_IMPLANT,
    name: 'N-Well Implant',
    nameZh: 'N井離子注入',
    sequence: 4,
    processType: ProcessType.ION_IMPLANT,
    cycleTimeMinutes: 35,
    yieldPercent: 99.2,
    defectDensityPerCm2: 0.04,
    queueTimeLimitMinutes: 720,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_gas_ph3', 'mat_gas_arsine'],
    description: 'Deep phosphorus implant forms the n-well for PMOS devices.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.P_WELL_IMPLANT,
    name: 'P-Well Implant',
    nameZh: 'P井離子注入',
    sequence: 5,
    processType: ProcessType.ION_IMPLANT,
    cycleTimeMinutes: 35,
    yieldPercent: 99.2,
    defectDensityPerCm2: 0.04,
    queueTimeLimitMinutes: 720,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_gas_bf3'],
    description: 'Boron implant forms the p-well and punch-through region for NMOS devices.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.GATE_STACK_DEPOSITION,
    name: 'Gate Stack Deposition',
    nameZh: '閘極堆疊沉積',
    sequence: 6,
    processType: ProcessType.DEPOSITION,
    cycleTimeMinutes: 45,
    yieldPercent: 99,
    defectDensityPerCm2: 0.06,
    queueTimeLimitMinutes: 720,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_gas_sih4', 'mat_gas_nh3'],
    description: 'Gate oxide (grown or high-k) plus polysilicon gate electrode.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.GATE_LITHOGRAPHY,
    name: 'Gate Lithography',
    nameZh: '閘極光罩曝光',
    sequence: 7,
    processType: ProcessType.LITHOGRAPHY,
    cycleTimeMinutes: 40,
    yieldPercent: 98.5,
    defectDensityPerCm2: 0.08,
    queueTimeLimitMinutes: 120,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_resist_iline', 'mat_mask_gate'],
    description: 'First critical mask layer. Resist coat, expose, develop, and hard-bake.',
    usesMask: true,
  }),
  stage({
    nodeId: ProcessNodeId.GATE_ETCH,
    name: 'Gate Etch',
    nameZh: '閘極刻蝕',
    sequence: 8,
    processType: ProcessType.ETCHING,
    cycleTimeMinutes: 30,
    yieldPercent: 99.3,
    defectDensityPerCm2: 0.04,
    queueTimeLimitMinutes: 480,
    isInspection: false,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: ['mat_gas_cf4', 'mat_gas_cl2'],
    description: 'Plasma etch transfers the gate pattern down into the stack.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.SOURCE_DRAIN_IMPLANT,
    name: 'Source / Drain Implant',
    nameZh: '源漏離子注入',
    sequence: 9,
    processType: ProcessType.ION_IMPLANT,
    cycleTimeMinutes: 38,
    yieldPercent: 98.9,
    defectDensityPerCm2: 0.05,
    queueTimeLimitMinutes: 720,
    isInspection: false,
    unlockNode: TechnologyNode.NM_180,
    consumesMaterialIds: ['mat_gas_arsine', 'mat_gas_bf3'],
    description: 'Self-aligned source/drain implants plus lightly-doped drain extensions.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.ACTIVATION_ANNEAL,
    name: 'Activation Anneal',
    nameZh: '活化退火',
    sequence: 10,
    processType: ProcessType.THERMAL,
    cycleTimeMinutes: 50,
    yieldPercent: 99.1,
    defectDensityPerCm2: 0.05,
    queueTimeLimitMinutes: 1440,
    isInspection: false,
    unlockNode: TechnologyNode.NM_180,
    consumesMaterialIds: ['mat_gas_n2', 'mat_gas_h2'],
    description: 'Rapid thermal anneal activates the dopants and repairs implant damage.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.INTERLAYER_DIELECTRIC,
    name: 'Interlayer Dielectric',
    nameZh: '層間介電質',
    sequence: 11,
    processType: ProcessType.CMP,
    cycleTimeMinutes: 42,
    yieldPercent: 98.8,
    defectDensityPerCm2: 0.07,
    queueTimeLimitMinutes: 1440,
    isInspection: false,
    unlockNode: TechnologyNode.NM_90,
    consumesMaterialIds: ['mat_precursor_sio', 'mat_slurry_cmp'],
    description: 'Low-k dielectric deposition followed by CMP planarization.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.CONTACT_LITHOGRAPHY,
    name: 'Contact Lithography',
    nameZh: '接觸孔光罩曝光',
    sequence: 12,
    processType: ProcessType.LITHOGRAPHY,
    cycleTimeMinutes: 42,
    yieldPercent: 98.2,
    defectDensityPerCm2: 0.09,
    queueTimeLimitMinutes: 120,
    isInspection: false,
    unlockNode: TechnologyNode.NM_90,
    consumesMaterialIds: ['mat_resist_ar', 'mat_mask_contact'],
    description: 'Via and contact mask layer. The second-highest defect contributor in the flow.',
    usesMask: true,
  }),
  stage({
    nodeId: ProcessNodeId.CONTACT_ETCH,
    name: 'Contact Etch',
    nameZh: '接觸孔刻蝕',
    sequence: 13,
    processType: ProcessType.ETCHING,
    cycleTimeMinutes: 32,
    yieldPercent: 99.2,
    defectDensityPerCm2: 0.04,
    queueTimeLimitMinutes: 480,
    isInspection: false,
    unlockNode: TechnologyNode.NM_90,
    consumesMaterialIds: ['mat_gas_cf4', 'mat_gas_hbr'],
    description: 'Opens the vias down to the device layer with high selectivity.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.METAL_INTERCONNECT,
    name: 'Metal Interconnect',
    nameZh: '金屬互連',
    sequence: 14,
    processType: ProcessType.DEPOSITION,
    cycleTimeMinutes: 60,
    yieldPercent: 97.8,
    defectDensityPerCm2: 0.12,
    queueTimeLimitMinutes: 2880,
    isInspection: false,
    unlockNode: TechnologyNode.NM_28,
    consumesMaterialIds: ['mat_target_cu', 'mat_precursor_sio'],
    description: 'Copper damascene fill, barrier and seed layers, and final metal CMP.',
    usesMask: false,
  }),
  stage({
    nodeId: ProcessNodeId.FINAL_INSPECTION,
    name: 'Final Wafer Inspection',
    nameZh: '最終晶圓檢測',
    sequence: 15,
    processType: ProcessType.INSPECTION,
    cycleTimeMinutes: 25,
    yieldPercent: 98.5,
    defectDensityPerCm2: 0.02,
    queueTimeLimitMinutes: null,
    isInspection: true,
    unlockNode: TechnologyNode.NM_350,
    consumesMaterialIds: [],
    description: 'Electrical sort and KLA defect scan. The gate that decides what ships.',
    usesMask: false,
  }),
]);

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

/** Fast id -> spec lookup for the 15 stages. */
export const PROCESS_NODE_BY_ID: Readonly<Record<ProcessNodeId, ProcessNodeSpec>> = deepFreeze(
  Object.fromEntries(PROCESS_FLOW.map((s) => [s.nodeId, s])) as Record<ProcessNodeId, ProcessNodeSpec>,
);

/** The stage list in strict flow order (sequence ascending). */
export const ORDERED_PROCESS_FLOW: readonly ProcessNodeSpec[] = deepFreeze(
  [...PROCESS_FLOW].sort((a, b) => a.sequence - b.sequence),
);

/** Number of stages in the flow. */
export const PROCESS_FLOW_LENGTH = ORDERED_PROCESS_FLOW.length;

/** Look up a stage by id. Throws if the id is unknown. */
export function getProcessNode(nodeId: ProcessNodeId): ProcessNodeSpec {
  const spec = PROCESS_NODE_BY_ID[nodeId];
  if (!spec) {
    throw new RangeError(`Unknown process node id: ${String(nodeId)}`);
  }
  return spec;
}

/**
 * The stage that follows `nodeId` in the flow, or `null` at the end of the line.
 */
export function nextProcessNode(nodeId: ProcessNodeId): ProcessNodeSpec | null {
  const idx = ORDERED_PROCESS_FLOW.findIndex((s) => s.nodeId === nodeId);
  if (idx < 0) return null;
  return ORDERED_PROCESS_FLOW[idx + 1] ?? null;
}

/** Every stage driven by a given tool class. */
export function stagesByProcessType(processType: ProcessType): readonly ProcessNodeSpec[] {
  return ORDERED_PROCESS_FLOW.filter((s) => s.processType === processType);
}

/** Every stage unlocked at a given technology node (inclusive of that node). */
export function stagesUnlockedAt(node: TechnologyNode): readonly ProcessNodeSpec[] {
  const order = Object.values(TechnologyNode) as TechnologyNode[];
  const rank = order.indexOf(node);
  if (rank < 0) return [];
  return ORDERED_PROCESS_FLOW.filter((s) => order.indexOf(s.unlockNode) <= rank);
}

// ---------------------------------------------------------------------------
// Flow-level statistics
// ---------------------------------------------------------------------------

/** Aggregate statistics describing the whole 15-stage line. */
export interface ProcessFlowStats {
  /** Total minutes for one wafer to traverse every stage (no queuing). */
  readonly totalCycleTimeMinutes: number;
  /** Combined wafer survival probability across all stages, as a fraction 0-1. */
  readonly compositeYield: number;
  /** Number of distinct tool classes the line requires. */
  readonly toolClassCount: number;
  /** Number of mask (lithography) layers in the flow. */
  readonly maskCount: number;
  /** Number of inspection gates. */
  readonly inspectionCount: number;
  /** Total intrinsic defect density added by the whole flow, in defects/cm². */
  readonly totalDefectDensityPerCm2: number;
}

/**
 * Compute aggregate statistics for the 15-stage line.
 *
 * `compositeYield` is the product of every stage's yield percentage: it is the
 * probability that a wafer entering the line comes out the far end unscraped
 * by process defects alone (before equipment wear and Q-Time violations).
 */
export function computeProcessFlowStats(
  flow: readonly ProcessNodeSpec[] = ORDERED_PROCESS_FLOW,
): ProcessFlowStats {
  let totalCycleTimeMinutes = 0;
  let compositeYield = 1;
  let totalDefectDensityPerCm2 = 0;
  let maskCount = 0;
  let inspectionCount = 0;
  const toolClasses = new Set<ProcessType>();

  for (const s of flow) {
    totalCycleTimeMinutes += s.cycleTimeMinutes;
    compositeYield *= s.yieldPercent / 100;
    totalDefectDensityPerCm2 += s.defectDensityPerCm2;
    toolClasses.add(s.processType);
    if (s.usesMask) maskCount += 1;
    if (s.isInspection) inspectionCount += 1;
  }

  return deepFreeze({
    totalCycleTimeMinutes,
    compositeYield,
    toolClassCount: toolClasses.size,
    maskCount,
    inspectionCount,
    totalDefectDensityPerCm2,
  });
}

/** Pre-computed statistics for the canonical flow. */
export const PROCESS_FLOW_STATS: ProcessFlowStats = computeProcessFlowStats();

// ---------------------------------------------------------------------------
// Q-Time rules derived from the flow
// ---------------------------------------------------------------------------

/**
 * A queue-time constraint between two consecutive tool classes.
 *
 * Structurally identical to the factory's `QTimeRule`, but declared here so
 * the domain owns the rule table and the factory merely consumes it.
 */
export interface FlowQTimeRule {
  /** Tool class the lot just came off. */
  readonly after: ProcessType;
  /** Tool class the lot must reach next. */
  readonly before: ProcessType;
  /** Maximum minutes the lot may wait between the two. */
  readonly maxWaitMinutes: number;
}

/**
 * Derive the Q-Time rules implied by the flow's own `queueTimeLimitMinutes`.
 *
 * A stage with a Q-Time limit constrains the wait *before* it — the time a
 * lot spends in the previous stage's output buffer. The rule is therefore
 * keyed by (previous stage's tool class → this stage's tool class).
 *
 * Stages whose previous stage shares the same tool class (e.g. two
 * consecutive lithography steps) collapse into one rule.
 */
export function buildFlowQTimeRules(
  flow: readonly ProcessNodeSpec[] = ORDERED_PROCESS_FLOW,
): readonly FlowQTimeRule[] {
  const rules = new Map<string, FlowQTimeRule>();
  for (let i = 1; i < flow.length; i += 1) {
    const prev = flow[i - 1]!;
    const cur = flow[i]!;
    if (cur.queueTimeLimitMinutes === null) continue;
    const key = `${prev.processType}->${cur.processType}`;
    const existing = rules.get(key);
    // Tightest constraint wins when several stages share a tool-class pair.
    if (!existing || cur.queueTimeLimitMinutes < existing.maxWaitMinutes) {
      rules.set(key, {
        after: prev.processType,
        before: cur.processType,
        maxWaitMinutes: cur.queueTimeLimitMinutes,
      });
    }
  }
  return deepFreeze([...rules.values()]);
}

/** Pre-computed Q-Time rules for the canonical flow. */
export const PROCESS_FLOW_QTIME_RULES: readonly FlowQTimeRule[] = buildFlowQTimeRules();
