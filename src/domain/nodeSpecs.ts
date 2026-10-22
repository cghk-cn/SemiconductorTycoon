import { LithoSource, TechnologyNode, type WaferSize } from './enums.ts';

/** Rich per-node metadata used by game logic, yield defaults, and economy. */
export interface NodeSpec {
  node: TechnologyNode;
  /** Physical feature size in nm — smaller = more advanced. */
  nm: number;
  /** Ordering rank: 0 = most advanced, larger = more mature. */
  rank: number;
  /** Calendar year the node reached volume production (approx.). */
  yearIntroduced: number;
  /** Lithography light source(s) that define this node. */
  primaryLithoSource: LithoSource;
  /** Typical mask/pattern layers in a mainstream SoC at this node. */
  typicalMaskCount: number;
  /** Mature-fab intrinsic defect density D0 in defects/cm² (yield input). */
  matureDefectDensityPerCm2: number;
  /** Wafer sizes realistically available for this node. */
  typicalWaferSizes: readonly WaferSize[];
  /** Indicative cost of one processed wafer in USD (game economy seed). */
  indicativeWaferCostUsd: number;
  /** Relative process-complexity multiplier vs. a 180nm baseline of 1.0. */
  complexityFactor: number;
}

/**
 * Metadata table for every node shipped in the game. Values are realistic
 * industry approximations chosen to double as game-balance knobs.
 */
export const NODE_SPECS: Readonly<Record<TechnologyNode, NodeSpec>> = Object.freeze({
  '350nm': {
    node: '350nm',
    nm: 350,
    rank: 14,
    yearIntroduced: 1993,
    primaryLithoSource: LithoSource.I_LINE,
    typicalMaskCount: 18,
    matureDefectDensityPerCm2: 0.6,
    typicalWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    indicativeWaferCostUsd: 600,
    complexityFactor: 0.6,
  },
  '250nm': {
    node: '250nm',
    nm: 250,
    rank: 13,
    yearIntroduced: 1997,
    primaryLithoSource: LithoSource.I_LINE,
    typicalMaskCount: 20,
    matureDefectDensityPerCm2: 0.55,
    typicalWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    indicativeWaferCostUsd: 750,
    complexityFactor: 0.75,
  },
  '180nm': {
    node: '180nm',
    nm: 180,
    rank: 12,
    yearIntroduced: 1998,
    primaryLithoSource: LithoSource.KRF,
    typicalMaskCount: 24,
    matureDefectDensityPerCm2: 0.45,
    typicalWaferSizes: ['WAFER_150MM', 'WAFER_200MM'],
    indicativeWaferCostUsd: 1000,
    complexityFactor: 1.0,
  },
  '130nm': {
    node: '130nm',
    nm: 130,
    rank: 11,
    yearIntroduced: 2000,
    primaryLithoSource: LithoSource.KRF,
    typicalMaskCount: 28,
    matureDefectDensityPerCm2: 0.40,
    typicalWaferSizes: ['WAFER_200MM'],
    indicativeWaferCostUsd: 1400,
    complexityFactor: 1.25,
  },
  '90nm': {
    node: '90nm',
    nm: 90,
    rank: 10,
    yearIntroduced: 2003,
    primaryLithoSource: LithoSource.ARF_DRY,
    typicalMaskCount: 30,
    matureDefectDensityPerCm2: 0.35,
    typicalWaferSizes: ['WAFER_200MM', 'WAFER_300MM'],
    indicativeWaferCostUsd: 2000,
    complexityFactor: 1.6,
  },
  '65nm': {
    node: '65nm',
    nm: 65,
    rank: 9,
    yearIntroduced: 2006,
    primaryLithoSource: LithoSource.ARF_DRY,
    typicalMaskCount: 34,
    matureDefectDensityPerCm2: 0.30,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 2800,
    complexityFactor: 2.0,
  },
  '45nm': {
    node: '45nm',
    nm: 45,
    rank: 8,
    yearIntroduced: 2008,
    primaryLithoSource: LithoSource.ARF_IMMERSION,
    typicalMaskCount: 38,
    matureDefectDensityPerCm2: 0.28,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 3600,
    complexityFactor: 2.4,
  },
  '28nm': {
    node: '28nm',
    nm: 28,
    rank: 7,
    yearIntroduced: 2011,
    primaryLithoSource: LithoSource.ARF_IMMERSION,
    typicalMaskCount: 42,
    matureDefectDensityPerCm2: 0.25,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 4500,
    complexityFactor: 2.8,
  },
  '16nm_finfet': {
    node: '16nm_finfet',
    nm: 16,
    rank: 6,
    yearIntroduced: 2013,
    primaryLithoSource: LithoSource.ARF_IMMERSION,
    typicalMaskCount: 55,
    matureDefectDensityPerCm2: 0.22,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 6000,
    complexityFactor: 4.0,
  },
  '7nm': {
    node: '7nm',
    nm: 7,
    rank: 5,
    yearIntroduced: 2018,
    primaryLithoSource: LithoSource.ARF_IMMERSION, // + EUV single/partial layers
    typicalMaskCount: 80,
    matureDefectDensityPerCm2: 0.18,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 9500,
    complexityFactor: 5.5,
  },
  '5nm': {
    node: '5nm',
    nm: 5,
    rank: 4,
    yearIntroduced: 2020,
    primaryLithoSource: LithoSource.EUV,
    typicalMaskCount: 85,
    matureDefectDensityPerCm2: 0.16,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 13000,
    complexityFactor: 6.8,
  },
  '3nm': {
    node: '3nm',
    nm: 3,
    rank: 3,
    yearIntroduced: 2022,
    primaryLithoSource: LithoSource.EUV,
    typicalMaskCount: 90,
    matureDefectDensityPerCm2: 0.14,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 16000,
    complexityFactor: 8.0,
  },
  '2nm_gaa': {
    node: '2nm_gaa',
    nm: 2,
    rank: 2,
    yearIntroduced: 2025,
    primaryLithoSource: LithoSource.EUV,
    typicalMaskCount: 100,
    matureDefectDensityPerCm2: 0.12,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 20000,
    complexityFactor: 10.0,
  },
  '2nm': {
    node: '2nm',
    nm: 2,
    rank: 1,
    yearIntroduced: 2026,
    primaryLithoSource: LithoSource.EUV, // High-NA EUV ready
    typicalMaskCount: 105,
    matureDefectDensityPerCm2: 0.11,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 23000,
    complexityFactor: 11.0,
  },
  'A16': {
    node: 'A16',
    /** Marketed "16 angstrom" class (~1.6 nm physical equivalent). */
    nm: 1.6,
    rank: 0,
    yearIntroduced: 2027,
    primaryLithoSource: LithoSource.EUV,
    typicalMaskCount: 112,
    matureDefectDensityPerCm2: 0.10,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 26000,
    complexityFactor: 13.0,
  },
  'a16_cfet': {
    node: 'a16_cfet',
    nm: 1.6,
    rank: -1,
    yearIntroduced: 2028,
    primaryLithoSource: LithoSource.EUV,
    typicalMaskCount: 118,
    matureDefectDensityPerCm2: 0.09,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 30000,
    complexityFactor: 15.0,
  },
  'a10': {
    node: 'a10',
    nm: 1.0,
    rank: -2,
    yearIntroduced: 2030,
    primaryLithoSource: LithoSource.EUV,
    typicalMaskCount: 130,
    matureDefectDensityPerCm2: 0.08,
    typicalWaferSizes: ['WAFER_300MM'],
    indicativeWaferCostUsd: 38000,
    complexityFactor: 18.0,
  },
} as const satisfies Record<TechnologyNode, NodeSpec>);

/** Feature size in nm for a node. */
export function nodeNm(node: TechnologyNode): number {
  return NODE_SPECS[node].nm;
}

/**
 * True when `node` falls inside a capability window, expressed as a feature
 * size range. `mostAdvancedNm` is the smaller number (e.g. 7) and
 * `mostMatureNm` the larger (e.g. 90): a tool supporting 7nm–90nm handles any
 * node whose nm value sits between them.
 */
export function nodeWithinRange(
  node: TechnologyNode,
  mostAdvancedNm: number,
  mostMatureNm: number,
): boolean {
  const nm = nodeNm(node);
  return nm >= mostAdvancedNm && nm <= mostMatureNm;
}

/** Sort nodes most-advanced-first (2nm → 350nm). */
export function nodesAdvancedFirst(nodes: readonly TechnologyNode[]): TechnologyNode[] {
  return [...nodes].sort((a, b) => NODE_SPECS[a].rank - NODE_SPECS[b].rank);
}
