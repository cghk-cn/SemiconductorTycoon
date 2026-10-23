/**
 * Domain bridge — connects the React client to the canonical domain model that
 * lives in the repository root (`/src/domain`).
 *
 * The canonical `PROCESS_FLOW` (15 stages, each with a real process type,
 * cycle time, yield, defect density and Q-Time limit) is the single source of
 * truth for "where is a lot right now". The client used to fake this with a
 * hard-coded `defaultLot`; instead we derive every lot's stage breakdown from
 * the real flow so the fab floor and the lot inspector always agree.
 *
 * Everything here is pure and browser-safe (the domain layer has no Node-only
 * dependencies).
 */

import {
  ORDERED_PROCESS_FLOW,
  stagesUnlockedAt as domainStagesUnlockedAt,
  type ProcessNodeSpec,
} from "../../../src/domain/processFlow";
import { EQUIPMENT_CATALOG as DOMAIN_EQUIPMENT_CATALOG } from "../../../src/domain/processCatalog";
import { ProcessType, TechnologyNode } from "../../../src/domain/enums";

export { ProcessType, TechnologyNode };
export type { ProcessNodeSpec };
export { DOMAIN_EQUIPMENT_CATALOG as EQUIPMENT_CATALOG };

/** Shared inspection-data shape used by the lot inspector modal. */
export interface LotInspectionData {
  lotId: string;
  recipeName: string;
  currentStep: number;
  totalSteps: number;
  overallProgress: number;
  maskLayers: Array<{
    layer: number;
    name: string;
    progress: number;
    defectDensity: number;
    completed: boolean;
  }>;
  defectHeatmap: number[][];
  qTimeAtRisk: boolean;
  qTimeMinutesRemaining?: number;
}

/** Map a canonical ProcessType to the client's fab-floor category string. */
export function machineCategoryFromProcessType(processType: ProcessType): string {
  switch (processType) {
    case ProcessType.LITHOGRAPHY: return "litho";
    case ProcessType.ETCHING: return "etch";
    case ProcessType.DEPOSITION: return "depo";
    case ProcessType.CMP: return "cmp";
    case ProcessType.ION_IMPLANT: return "impl";
    case ProcessType.THERMAL: return "thermal";
    case ProcessType.CLEAN: return "clean";
    case ProcessType.INSPECTION: return "insp";
    case ProcessType.PACKAGING: return "pack";
    default: return "other";
  }
}

/**
 * Given a lot's overall progress (0-100) and the ordered flow stages, return the
 * zero-based index of the stage the lot is currently in, plus the stage spec.
 * Progress is clamped to 0-100 and divided evenly across all stages.
 */
export function lotStageAtProgress(
  stages: readonly ProcessNodeSpec[],
  progress: number,
): { index: number; stage: ProcessNodeSpec | null } {
  const clamped = Math.max(0, Math.min(100, progress ?? 0));
  const perStage = 100 / Math.max(stages.length, 1);
  const index = Math.min(stages.length - 1, Math.floor(clamped / perStage));
  return { index, stage: stages[index] ?? null };
}

/**
 * Build a fallback LotInspectionData from the real lot id / recipe / progress,
 * deriving the stage breakdown from the canonical flow. Used when the runtime
 * has not actually assigned a lot to a piece of equipment.
 */
export function fallbackLotData(
  lotId: string,
  recipeName: string,
  progress: number,
  stages: readonly ProcessNodeSpec[] = ORDERED_PROCESS_FLOW,
  qTimeAtRisk = false,
): LotInspectionData {
  const { index } = lotStageAtProgress(stages, progress);
  const overallProgress = Math.max(0, Math.min(100, progress ?? 0));
  const currentStep = index + 1;
  const totalSteps = stages.length;
  const layers = maskStages(stages).map(({ layer, stage: s }) => ({
    layer,
    name: s.nameZh,
    progress: layer === currentStep ? overallProgress : layer < currentStep ? 100 : 0,
    defectDensity: s.defectDensityPerCm2,
    completed: layer < currentStep,
  }));
  const heatmap = Array.from({ length: 10 }, () =>
    Array.from({ length: 10 }, () => Math.random()),
  );
  return {
    lotId,
    recipeName,
    currentStep,
    totalSteps,
    overallProgress,
    maskLayers: layers,
    defectHeatmap: heatmap,
    qTimeAtRisk,
  };
}

/**
 * All domain equipment catalog entries that can serve a given stage node id.
 * Convenience wrapper around the domain's `platformsForStage`.
 */
export function equipmentForStage(nodeId: string): readonly (typeof DOMAIN_EQUIPMENT_CATALOG)[number][] {
  return DOMAIN_EQUIPMENT_CATALOG.filter((e) => e.servesNodeIds.includes(nodeId as any));
}

/** Every stage of the canonical flow, in sequence order. */
export const FLOW_STAGES: readonly ProcessNodeSpec[] = ORDERED_PROCESS_FLOW;

/** Rank of a technology node inside the canonical node ordering. */
const NODE_ORDER: readonly TechnologyNode[] = Object.values(
  TechnologyNode,
) as readonly TechnologyNode[];

/**
 * Translate a client-side tech-node id (e.g. `"350nm"`, `"a16"`) into the
 * canonical `TechnologyNode` value. Returns `null` when the id is unknown.
 */
export function toTechnologyNode(id: string): TechnologyNode | null {
  const direct = NODE_ORDER.find((n) => n === id);
  if (direct) return direct;
  // The client uses lowercase ids for some nodes ("a16"); the domain uses
  // "A16". Compare case-insensitively as a fallback.
  const lower = id.toLowerCase();
  return NODE_ORDER.find((n) => n.toLowerCase() === lower) ?? null;
}

/**
 * The flow stages unlocked at `node`, i.e. the stages a recipe for that node
 * would actually contain. Mirrors the domain's `stagesUnlockedAt`.
 */
export function stagesUnlockedAt(node: TechnologyNode): readonly ProcessNodeSpec[] {
  return domainStagesUnlockedAt(node);
}

/**
 * The canonical flow stage list for a recipe targeting `node`.
 * Falls back to the full flow when the node is unknown to the domain model.
 */
export function flowStagesFor(node: TechnologyNode | null | undefined): readonly ProcessNodeSpec[] {
  if (!node) return FLOW_STAGES;
  const unlocked = stagesUnlockedAt(node);
  return unlocked.length > 0 ? unlocked : FLOW_STAGES;
}

/** 1-based index of a stage inside the given flow (0 when not found). */
export function stageOrdinal(
  stages: readonly ProcessNodeSpec[],
  nodeId: string,
): number {
  const idx = stages.findIndex((s) => s.nodeId === nodeId);
  return idx < 0 ? 0 : idx + 1;
}

/** Every stage that consumes a photomask, in flow order, with its mask ordinal. */
export function maskStages(
  stages: readonly ProcessNodeSpec[],
): Array<{ layer: number; stage: ProcessNodeSpec }> {
  const out: Array<{ layer: number; stage: ProcessNodeSpec }> = [];
  let layer = 0;
  for (const s of stages) {
    if (!s.usesMask) continue;
    layer += 1;
    out.push({ layer, stage: s });
  }
  return out;
}

/** All flow stages that a given class of tool can run, in flow order. */
export function stagesForProcessType(
  processType: string,
  stages: readonly ProcessNodeSpec[] = FLOW_STAGES,
): readonly ProcessNodeSpec[] {
  return stages.filter((s) => s.processType === processType);
}

/**
 * Client equipment id → canonical TechnologyNode required to unlock it.
 * Returns `null` when the equipment is available from the start (no gate).
 * This is a lightweight gate rule, not a duplicate of the full catalog.
 */
const EQUIPMENT_UNLOCK_NODE: Record<string, TechnologyNode> = {
  euv_scanner: TechnologyNode.NM_28,
  high_na_euv: TechnologyNode.NM_7,
  hybrid_bonder: TechnologyNode.NM_7,
};

/** Technology node required before `equipmentId` can be purchased, or null. */
export function getUnlockNodeForEquipment(
  equipmentId: string,
): TechnologyNode | null {
  return EQUIPMENT_UNLOCK_NODE[equipmentId] ?? null;
}

/** The flow stage a tool of this class runs first (its entry stage). */
export function primaryStageForProcessType(
  processType: string,
  stages: readonly ProcessNodeSpec[] = FLOW_STAGES,
): ProcessNodeSpec | null {
  return stagesForProcessType(processType, stages)[0] ?? null;
}
