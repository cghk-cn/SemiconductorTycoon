/**
 * Semiconductor Tycoon — Step 5: integration layer.
 *
 * Public types for the end-to-end pipeline that connects factory production,
 * wafer yield, packaging, optional data-center compute, contract settlement
 * and financial accounting.
 *
 *   import { runProductionPipeline } from './integration/index.ts';
 */

import type { ProductRecipe } from '../domain/recipe.ts';
import type { Factory } from '../factory/simulation.ts';
import type {
  FinancialSystem,
  IncomeStatement,
  BalanceSheet,
  Contract,
  ContractBoard,
  ClientBook,
  MarketEnvironment,
  SettlementOptions,
  SettlementResult,
} from '../economy/index.ts';
import type { LotYieldResult } from '../domain/yield.ts';
import type { AdvancedPackagingLine, PackagingResult } from '../advanced/packaging.ts';
import type {
  ComputeRevenueResult,
  ComputeRevenueStream,
  DataCenterFacility,
} from '../advanced/dataCenter.ts';

// ---------------------------------------------------------------------------
// Stages & status
// ---------------------------------------------------------------------------

/** The ordered stages of the production-to-accounting pipeline. */
export const IntegrationStage = {
  /** Lots are released and run through the factory. */
  PRODUCTION: 'PRODUCTION',
  /** Completed lots are converted into good dies via the yield model. */
  YIELD: 'YIELD',
  /** Optional advanced packaging of the good dies. */
  PACKAGING: 'PACKAGING',
  /** Optional data-center compute monetization. */
  DATA_CENTER: 'DATA_CENTER',
  /** The contract is settled against the deliveries. */
  SETTLEMENT: 'SETTLEMENT',
  /** The financial statements are produced. */
  FINANCIAL: 'FINANCIAL',
} as const;
export type IntegrationStage = (typeof IntegrationStage)[keyof typeof IntegrationStage];

/** Overall outcome of a pipeline run. */
export const PipelineStatus = {
  /** Every required stage completed. */
  COMPLETED: 'COMPLETED',
  /** The pipeline stopped early; `failures` explains why. */
  FAILED: 'FAILED',
} as const;
export type PipelineStatus = (typeof PipelineStatus)[keyof typeof PipelineStatus];

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** Unit price (USD) the fab pays for one unit of a recipe material. */
export interface MaterialPrice {
  readonly materialId: string;
  readonly unitPriceUsd: number;
}

/** Optional advanced-packaging stage. */
export interface PackagingPlan {
  /** The packaging line that assembles the packages. */
  readonly line: AdvancedPackagingLine;
  /** Silicon interposers available to the line. */
  readonly interposers: number;
  /** Organic package substrates available to the line. */
  readonly substrates: number;
  /** HBM stacks available to the line. */
  readonly hbmStacks: number;
  /**
   * How much one defect/cm² of wafer defect density adds to the packaging
   * failure rate (default 0.05). This is the link that makes the packaging
   * stage depend on the factory output.
   */
  readonly defectSensitivityPerCm2?: number;
}

/** Optional data-center compute stage. */
export interface DataCenterPlan {
  /** The facility that hosts the accelerator racks. */
  readonly facility: DataCenterFacility;
  /** The revenue stream that monetizes the deployed cards. */
  readonly stream: ComputeRevenueStream;
  /** How many hours of compute to run. */
  readonly hours: number;
}

// ---------------------------------------------------------------------------
// Inputs & results
// ---------------------------------------------------------------------------

/** Everything the pipeline needs to run one order end to end. */
export interface PipelineOptions {
  /** The fab that produces the dies. */
  readonly factory: Factory;
  /** The ledger the pipeline posts to. */
  readonly financials: FinancialSystem;
  /** The board holding the contract being fulfilled. */
  readonly board: ContractBoard;
  /** The client book (reputation is updated on settlement). */
  readonly clientBook: ClientBook;
  /** The market (drives settlement credit risk). */
  readonly market: MarketEnvironment;
  /** The contract to fulfil. */
  readonly contract: Contract;
  /** The recipe that defines the product. */
  readonly recipe: ProductRecipe;
  /** How many lots to produce for this order. */
  readonly lotCount: number;
  /** How many wafers per lot. */
  readonly wafersPerLot: number;
  /** Unit prices for every material the recipe consumes. */
  readonly materialPrices: readonly MaterialPrice[];
  /** Backend (assembly / test / freight) cost per good die, USD. */
  readonly backendUsdPerDie: number;
  /** Optional packaging stage. */
  readonly packaging?: PackagingPlan;
  /** Optional data-center stage. */
  readonly dataCenter?: DataCenterPlan;
  /** Settlement options (collection rate, default risk). */
  readonly settlement?: SettlementOptions;
  /** Seed for the settlement RNG (default 4242). */
  readonly settlementSeed?: number;
  /** Upper bound on factory ticks (default 20,000). */
  readonly maxTicks?: number;
  /** Prefix used to build lot ids (default `LOT`). */
  readonly lotIdPrefix?: string;
}

/** A single material charge, mirrored for reporting. */
export interface MaterialChargeView {
  readonly materialId: string;
  readonly name: string;
  readonly quantity: number;
  readonly totalUsd: number;
}

/** Result of one production lot. */
export interface LotOutcome {
  readonly lotId: string;
  /** Sim-day the lot shipped (null when the lot was scrapped). */
  readonly shipDay: number | null;
  /** True when the lot was scrapped in the fab. */
  readonly scrapped: boolean;
  /** Why the lot was scrapped (null when it completed). */
  readonly scrapReason: string | null;
  /** The yield model output for the lot. */
  readonly yieldResult: LotYieldResult;
  /** Material cost charged for the lot, USD. */
  readonly materialCostUsd: number;
  /** Itemised material charges. */
  readonly materialCharges: readonly MaterialChargeView[];
  /** Backend cost charged for the lot, USD. */
  readonly backendUsd: number;
}

/** Outcome of one pipeline stage. */
export interface StageOutcome {
  readonly stage: IntegrationStage;
  /** True when the stage completed (or was skipped by design). */
  readonly ok: boolean;
  /** True when the stage was optional and not configured. */
  readonly skipped: boolean;
  /** Human-readable summary. */
  readonly message: string;
}

/** The full result of a pipeline run. */
export interface PipelineResult {
  readonly status: PipelineStatus;
  /** Every stage that ran, in execution order. */
  readonly stages: readonly StageOutcome[];
  /** Per-lot production results. */
  readonly lots: readonly LotOutcome[];
  /** Good dies produced in total. */
  readonly totalGoodDies: number;
  /** Packaging result (null when the stage was not configured). */
  readonly packaging: PackagingResult | null;
  /** Data-center compute result (null when the stage was not configured). */
  readonly compute: ComputeRevenueResult | null;
  /** Settlement result (null when the pipeline failed before settlement). */
  readonly settlement: SettlementResult | null;
  /** Income statement at the end of the run. */
  readonly income: IncomeStatement;
  /** Balance sheet at the end of the run. */
  readonly balance: BalanceSheet;
  /** Human-readable failure reasons (empty when the run completed). */
  readonly failures: readonly string[];
}

