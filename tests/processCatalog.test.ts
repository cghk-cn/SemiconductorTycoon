import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ComponentCategory,
  LithoSource,
  MaterialCategory,
  PackagingType,
  ProcessType,
  TechnologyNode,
  WaferSize,
} from '../src/domain/enums.ts';
import {
  EQUIPMENT_BY_ID,
  EQUIPMENT_CATALOG,
  MATERIAL_BY_ID,
  MATERIAL_CATALOG,
  buildFlowRecipe,
  expectedFlowYield,
  getCatalogEquipment,
  platformsForStage,
  platformsUnlockedAt,
  recommendedPlatform,
  uncoveredStages,
} from '../src/domain/processCatalog.ts';
import { ORDERED_PROCESS_FLOW, ProcessNodeId, stagesUnlockedAt } from '../src/domain/processFlow.ts';
import { NODE_SPECS } from '../src/domain/nodeSpecs.ts';

describe('material catalog', () => {
  it('has unique ids and positive prices', () => {
    const ids = new Set(MATERIAL_CATALOG.map((m) => m.materialId));
    assert.equal(ids.size, MATERIAL_CATALOG.length);
    for (const m of MATERIAL_CATALOG) {
      assert.ok(m.pricePerUnitUsd > 0, `${m.materialId} price`);
      assert.ok(m.quantityPerWafer > 0, `${m.materialId} quantity`);
      assert.ok(m.nameZh.length > 0, `${m.materialId} nameZh`);
    }
  });

  it('covers every material referenced by the 15-stage flow', () => {
    for (const stage of ORDERED_PROCESS_FLOW) {
      for (const id of stage.consumesMaterialIds) {
        assert.ok(MATERIAL_BY_ID[id], `flow stage ${stage.nodeId} references unknown material ${id}`);
      }
    }
  });

  it('spans the expected material categories', () => {
    const cats = new Set(MATERIAL_CATALOG.map((m) => m.category));
    for (const c of [
      MaterialCategory.WAFER_SUBSTRATE,
      MaterialCategory.PHOTORESIST,
      MaterialCategory.PHOTO_MASK,
      MaterialCategory.PRECURSOR_GAS,
      MaterialCategory.CVD_PRECURSOR,
      MaterialCategory.IMPLANT_DOPANT,
      MaterialCategory.TARGET_METAL,
      MaterialCategory.CMP_SLURRY,
    ]) {
      assert.ok(cats.has(c), `missing material category ${c}`);
    }
  });
});

describe('equipment catalog', () => {
  it('has unique ids', () => {
    const ids = new Set(EQUIPMENT_CATALOG.map((e) => e.equipmentId));
    assert.equal(ids.size, EQUIPMENT_CATALOG.length);
  });

  it('covers every one of the 15 flow stages', () => {
    assert.deepEqual([...uncoveredStages()], []);
  });

  it('uses only real process types and gives every platform a description', () => {
    const types = new Set(Object.values(ProcessType));
    for (const e of EQUIPMENT_CATALOG) {
      assert.ok(types.has(e.processType), `${e.equipmentId} bad process type`);
      assert.ok(e.description.length > 0, `${e.equipmentId} missing description`);
      assert.ok(e.throughputWph > 0, `${e.equipmentId} throughput`);
      assert.ok(e.priceUsd > 0, `${e.equipmentId} price`);
      assert.ok(e.mostAdvancedNm <= e.mostMatureNm, `${e.equipmentId} nm window`);
    }
  });

  it('requires a litho source on lithography platforms and forbids it elsewhere', () => {
    for (const e of EQUIPMENT_CATALOG) {
      if (e.processType === ProcessType.LITHOGRAPHY) {
        assert.ok(e.lithoSource, `${e.equipmentId} litho needs a source`);
      } else {
        assert.equal(e.lithoSource, undefined, `${e.equipmentId} should not carry a litho source`);
      }
    }
  });

  it('has a serviceable tool for every stage at every technology node', () => {
    for (const node of Object.values(TechnologyNode)) {
      const nm = NODE_SPECS[node].nm;
      const size = NODE_SPECS[node].typicalWaferSizes.includes(WaferSize.WAFER_300MM)
        ? WaferSize.WAFER_300MM
        : WaferSize.WAFER_200MM;
      for (const stage of stagesUnlockedAt(node)) {
        const hits = EQUIPMENT_CATALOG.filter(
          (e) =>
            e.servesNodeIds.includes(stage.nodeId) &&
            nm >= e.mostAdvancedNm &&
            nm <= e.mostMatureNm &&
            e.supportedWaferSizes.includes(size),
        );
        assert.ok(hits.length > 0, `no platform serves ${stage.nodeId} at ${node}`);
      }
    }
  });

  it('prices advanced tiers above mature tiers', () => {
    for (const tier of [1, 2, 3] as const) {
      const prices = EQUIPMENT_CATALOG.filter((e) => e.tier === tier).map((e) => e.priceUsd);
      assert.ok(prices.length > 0, `tier ${tier} has no platforms`);
    }
    const avg = (tier: 1 | 2 | 3) => {
      const p = EQUIPMENT_CATALOG.filter((e) => e.tier === tier).map((e) => e.priceUsd);
      return p.reduce((a, b) => a + b, 0) / p.length;
    };
    assert.ok(avg(1) < avg(2), 'tier 1 should be cheaper on average than tier 2');
    assert.ok(avg(2) < avg(3), 'tier 2 should be cheaper on average than tier 3');
  });

  it('makes each tier better than the last on defect rate', () => {
    const defectAvg = (tier: 1 | 2 | 3) => {
      const d = EQUIPMENT_CATALOG.filter((e) => e.tier === tier).map((e) => e.baseDefectRatePerCm2);
      return d.reduce((a, b) => a + b, 0) / d.length;
    };
    assert.ok(defectAvg(1) > defectAvg(2), 'tier 1 should defect more than tier 2');
    assert.ok(defectAvg(2) > defectAvg(3), 'tier 2 should defect more than tier 3');
  });

  it('exposes the EUV scanner only at tier 3', () => {
    const euv = EQUIPMENT_CATALOG.filter((e) => e.lithoSource === LithoSource.EUV);
    assert.ok(euv.length > 0, 'there must be an EUV platform');
    for (const e of euv) assert.equal(e.tier, 3);
  });
});

describe('catalog lookups', () => {
  it('finds platforms by stage', () => {
    const litho = platformsForStage(ProcessNodeId.GATE_LITHOGRAPHY);
    assert.ok(litho.length >= 3, 'gate litho should have multiple platforms');
    for (const e of litho) {
      assert.ok(e.servesNodeIds.includes(ProcessNodeId.GATE_LITHOGRAPHY));
    }
  });

  it('recommends the cheapest viable platform for a stage', () => {
    const pick = recommendedPlatform(
      ProcessNodeId.GATE_LITHOGRAPHY,
      350,
      WaferSize.WAFER_200MM,
    );
    assert.ok(pick);
    assert.ok(pick.priceUsd > 0);
    const viable = EQUIPMENT_CATALOG.filter(
      (e) =>
        e.servesNodeIds.includes(ProcessNodeId.GATE_LITHOGRAPHY) &&
        350 >= e.mostAdvancedNm &&
        350 <= e.mostMatureNm &&
        e.supportedWaferSizes.includes(WaferSize.WAFER_200MM),
    );
    assert.equal(pick.priceUsd, Math.min(...viable.map((e) => e.priceUsd)));
  });

  it('returns null when no platform can serve a stage', () => {
    assert.equal(recommendedPlatform(ProcessNodeId.GATE_LITHOGRAPHY, 1, WaferSize.WAFER_200MM), null);
  });

  it('throws on an unknown equipment id', () => {
    assert.throws(() => getCatalogEquipment('EQP-DOES-NOT-EXIST'), RangeError);
    assert.equal(getCatalogEquipment(EQUIPMENT_CATALOG[0]!.equipmentId), EQUIPMENT_CATALOG[0]);
  });

  it('grows the purchasable catalog as nodes advance', () => {
    const counts = (Object.values(TechnologyNode) as TechnologyNode[]).map(
      (n) => platformsUnlockedAt(n).length,
    );
    for (let i = 1; i < counts.length; i += 1) {
      assert.ok(counts[i]! >= counts[i - 1]!);
    }
    assert.ok(counts[0]! > 0 && counts[0]! < counts[counts.length - 1]!);
  });
});

describe('flow recipes', () => {
  const base = {
    recipeId: 'R-TEST-350',
    productName: 'Test Chip',
    category: ComponentCategory.GPU,
    targetNode: TechnologyNode.NM_350,
    waferSize: WaferSize.WAFER_200MM,
    dieSizeMm2: 10,
    packaging: {
      packagingType: PackagingType.QFP,
      assemblyFlowName: 'Test',
      companionComponents: [],
    },
  };

  it('builds one step per unlocked stage, in flow order', () => {
    const r = buildFlowRecipe(base);
    const expected = stagesUnlockedAt(TechnologyNode.NM_350);
    assert.equal(r.processSteps.length, expected.length);
    r.processSteps.forEach((s, i) => {
      assert.equal(s.processNodeId, expected[i]!.nodeId);
      assert.equal(s.name, expected[i]!.name);
    });
  });

  it('is a valid domain recipe', () => {
    const r = buildFlowRecipe(base);
    assert.equal(r.targetNode, TechnologyNode.NM_350);
    assert.equal(r.maskCount, 1);
    assert.ok(r.materials.length > 0);
    assert.ok(r.processSteps.some((s) => s.processType === ProcessType.LITHOGRAPHY));
  });

  it('aggregates materials consumed by the selected stages', () => {
    const r = buildFlowRecipe(base);
    const wanted = new Set(
      stagesUnlockedAt(TechnologyNode.NM_350).flatMap((s) => s.consumesMaterialIds),
    );
    for (const m of r.materials) {
      assert.ok(wanted.has(m.materialId));
      assert.ok(MATERIAL_BY_ID[m.materialId]);
    }
  });

  it('supports an explicit partial flow', () => {
    const r = buildFlowRecipe({
      ...base,
      stageNodeIds: [
        ProcessNodeId.INCOMING_INSPECTION,
        ProcessNodeId.PRE_PROCESS_CLEAN,
        ProcessNodeId.GATE_LITHOGRAPHY,
      ],
    });
    assert.equal(r.processSteps.length, 3);
    assert.equal(r.processSteps[2]!.processNodeId, ProcessNodeId.GATE_LITHOGRAPHY);
  });

  it('scales cycle time with the multiplier', () => {
    const a = buildFlowRecipe(base);
    const b = buildFlowRecipe({ ...base, cycleTimeMultiplier: 2 });
    const total = (r: typeof a) => r.processSteps.reduce((n, s) => n + s.durationMinutes, 0);
    assert.equal(total(b), total(a) * 2);
  });

  it('rejects a non-positive cycle time multiplier', () => {
    assert.throws(() => buildFlowRecipe({ ...base, cycleTimeMultiplier: 0 }), RangeError);
  });

  it('rejects an empty stage selection', () => {
    assert.throws(() => buildFlowRecipe({ ...base, stageNodeIds: [] }), RangeError);
  });

  it('matches the expected yield of the selected stages', () => {
    const ids = stagesUnlockedAt(TechnologyNode.NM_350).map((s) => s.nodeId);
    const r = buildFlowRecipe(base);
    assert.ok(expectedFlowYield(ids) > 0 && expectedFlowYield(ids) < 1);
  });
});
