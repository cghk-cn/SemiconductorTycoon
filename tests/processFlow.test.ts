import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { ProcessType, TechnologyNode } from '../src/domain/enums.ts';
import {
  ORDERED_PROCESS_FLOW,
  PROCESS_FLOW,
  PROCESS_FLOW_LENGTH,
  PROCESS_FLOW_STATS,
  ProcessNodeId,
  computeProcessFlowStats,
  getProcessNode,
  nextProcessNode,
  stagesByProcessType,
  stagesUnlockedAt,
} from '../src/domain/processFlow.ts';

describe('process flow — structure', () => {
  it('has exactly 15 stages', () => {
    assert.equal(PROCESS_FLOW_LENGTH, 15);
    assert.equal(ORDERED_PROCESS_FLOW.length, 15);
    assert.equal(PROCESS_FLOW.length, 15);
  });

  it('orders stages by a strictly increasing 1-based sequence', () => {
    ORDERED_PROCESS_FLOW.forEach((s, i) => {
      assert.equal(s.sequence, i + 1, `${s.nodeId} should sit at position ${i + 1}`);
    });
  });

  it('uses unique node ids', () => {
    const ids = new Set(ORDERED_PROCESS_FLOW.map((s) => s.nodeId));
    assert.equal(ids.size, 15);
  });

  it('starts at incoming inspection and ends at final inspection', () => {
    assert.equal(ORDERED_PROCESS_FLOW[0]!.nodeId, ProcessNodeId.INCOMING_INSPECTION);
    assert.equal(ORDERED_PROCESS_FLOW[14]!.nodeId, ProcessNodeId.FINAL_INSPECTION);
  });

  it('covers every ProcessNodeId constant exactly once', () => {
    const all = Object.values(ProcessNodeId);
    assert.equal(all.length, 15);
    for (const id of all) {
      assert.ok(PROCESS_FLOW.some((s) => s.nodeId === id), `${id} missing from flow`);
    }
  });

  it('reuses the 11 existing process types rather than inventing new ones', () => {
    const used = new Set(ORDERED_PROCESS_FLOW.map((s) => s.processType));
    const allTypes = new Set(Object.values(ProcessType));
    for (const t of used) {
      assert.ok(allTypes.has(t), `${t} is not a domain ProcessType`);
    }
    assert.ok(used.size <= 11, 'flow should not need more than 11 tool classes');
  });

  it('assigns every stage a positive cycle time and a yield in [0,100]', () => {
    for (const s of ORDERED_PROCESS_FLOW) {
      assert.ok(s.cycleTimeMinutes > 0, `${s.nodeId} cycle time`);
      assert.ok(s.yieldPercent >= 0 && s.yieldPercent <= 100, `${s.nodeId} yield`);
      assert.ok(s.defectDensityPerCm2 >= 0, `${s.nodeId} defect density`);
    }
  });

  it('flags exactly two inspection gates and both of them are inspection-typed', () => {
    const gates = ORDERED_PROCESS_FLOW.filter((s) => s.isInspection);
    assert.equal(gates.length, 2);
    for (const g of gates) {
      assert.equal(g.processType, ProcessType.INSPECTION);
    }
  });

  it('uses exactly two mask layers', () => {
    assert.equal(ORDERED_PROCESS_FLOW.filter((s) => s.usesMask).length, 2);
    assert.equal(PROCESS_FLOW_STATS.maskCount, 2);
  });

  it('gives every stage a zh-TW display name', () => {
    for (const s of ORDERED_PROCESS_FLOW) {
      assert.ok(s.nameZh.length > 0, `${s.nodeId} missing nameZh`);
      assert.ok(s.name.length > 0, `${s.nodeId} missing name`);
      assert.ok(s.description.length > 0, `${s.nodeId} missing description`);
    }
  });
});

describe('process flow — lookups', () => {
  it('finds a stage by id and throws on an unknown id', () => {
    assert.equal(getProcessNode(ProcessNodeId.GATE_ETCH).nodeId, ProcessNodeId.GATE_ETCH);
    assert.throws(() => getProcessNode('NOPE' as ProcessNodeId), RangeError);
  });

  it('walks the flow via nextProcessNode and terminates at the end', () => {
    let cursor: ProcessNodeId = ORDERED_PROCESS_FLOW[0]!.nodeId;
    let visited = 1;
    for (;;) {
      const next = nextProcessNode(cursor);
      if (!next) break;
      cursor = next.nodeId;
      visited += 1;
    }
    assert.equal(visited, 15);
    assert.equal(cursor, ProcessNodeId.FINAL_INSPECTION);
  });

  it('returns null when asked for the successor of the last stage', () => {
    assert.equal(nextProcessNode(ProcessNodeId.FINAL_INSPECTION), null);
    assert.equal(nextProcessNode('NOPE' as ProcessNodeId), null);
  });

  it('groups stages by tool class', () => {
    const etches = stagesByProcessType(ProcessType.ETCHING);
    assert.deepEqual(
      etches.map((s) => s.nodeId),
      [ProcessNodeId.GATE_ETCH, ProcessNodeId.CONTACT_ETCH],
    );
    assert.equal(stagesByProcessType(ProcessType.INSPECTION).length, 2);
    assert.equal(stagesByProcessType(ProcessType.ION_IMPLANT).length, 3);
  });

  it('unlocks progressively more stages as the node shrinks', () => {
    const counts = (Object.values(TechnologyNode) as TechnologyNode[]).map(
      (n) => stagesUnlockedAt(n).length,
    );
    for (let i = 1; i < counts.length; i += 1) {
      assert.ok(counts[i]! >= counts[i - 1]!, 'stage count must be monotonic across nodes');
    }
    assert.equal(counts[0]!, 9, '350nm starts with 9 stages');
    assert.equal(counts[counts.length - 1]!, 15, 'the most advanced node has all 15');
  });

  it('always includes the full flow once the node is advanced enough', () => {
    const all = ORDERED_PROCESS_FLOW.map((s) => s.nodeId);
    assert.deepEqual(
      stagesUnlockedAt(TechnologyNode.NM_28).map((s) => s.nodeId),
      all,
    );
  });
});

describe('process flow — statistics', () => {
  it('sums the cycle time of every stage', () => {
    const expected = ORDERED_PROCESS_FLOW.reduce((n, s) => n + s.cycleTimeMinutes, 0);
    assert.equal(PROCESS_FLOW_STATS.totalCycleTimeMinutes, expected);
    assert.equal(expected, 574);
  });

  it('compounds stage yields multiplicatively', () => {
    const expected = ORDERED_PROCESS_FLOW.reduce((n, s) => n * (s.yieldPercent / 100), 1);
    assert.ok(Math.abs(PROCESS_FLOW_STATS.compositeYield - expected) < 1e-12);
    assert.ok(
      Math.abs(PROCESS_FLOW_STATS.compositeYield - 0.854) < 0.005,
      `expected ~85.4% composite yield, got ${PROCESS_FLOW_STATS.compositeYield}`,
    );
  });

  it('counts tool classes and inspection gates', () => {
    assert.equal(PROCESS_FLOW_STATS.inspectionCount, 2);
    assert.ok(PROCESS_FLOW_STATS.toolClassCount >= 8);
    assert.ok(PROCESS_FLOW_STATS.toolClassCount <= 11);
  });

  it('aggregates intrinsic defect density', () => {
    const expected = ORDERED_PROCESS_FLOW.reduce((n, s) => n + s.defectDensityPerCm2, 0);
    assert.ok(Math.abs(PROCESS_FLOW_STATS.totalDefectDensityPerCm2 - expected) < 1e-9);
  });

  it('can compute stats for a partial flow', () => {
    const partial = ORDERED_PROCESS_FLOW.slice(0, 5);
    const stats = computeProcessFlowStats(partial);
    assert.equal(stats.inspectionCount, 1);
    assert.equal(stats.maskCount, 0);
    assert.ok(stats.totalCycleTimeMinutes < PROCESS_FLOW_STATS.totalCycleTimeMinutes);
  });
});
