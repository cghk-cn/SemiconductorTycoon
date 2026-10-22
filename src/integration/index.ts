/**
 * Semiconductor Tycoon — Step 5: integration layer barrel.
 *
 *   import { runProductionPipeline } from './integration/index.ts';
 */

export { runProductionPipeline } from './pipeline.ts';
export type {
  IntegrationStage,
  PipelineStatus,
  MaterialPrice,
  PackagingPlan,
  DataCenterPlan,
  PipelineOptions,
  MaterialChargeView,
  LotOutcome,
  StageOutcome,
  PipelineResult,
} from './types.ts';