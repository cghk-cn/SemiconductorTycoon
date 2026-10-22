/**
 * Semiconductor Tycoon — Technology Tree Data Layer (v2.0).
 *
 * Re-exports the canonical node specification table from the domain layer so
 * that both the backend simulation and the React frontend share a single
 * source of truth for all 14+ process technology nodes.
 *
 * Nodes (most mature → most advanced):
 *   350nm → 250nm → 180nm → 130nm → 90nm → 65nm → 45nm → 28nm →
 *   16nm_finfet → 7nm → 5nm → 3nm → 2nm_gaa → 2nm → A16 → a16_cfet → a10
 */
export {
  type NodeSpec,
  NODE_SPECS,
  nodeNm,
  nodeWithinRange,
  nodesAdvancedFirst,
} from '../domain/nodeSpecs.ts';
export type { TechnologyNode } from '../domain/enums.ts';