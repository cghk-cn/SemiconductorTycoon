/**
 * Shared game-state types for SemiWorld.
 *
 * Both the interactive CLI (`scripts/interactiveGame.ts`) and the HTTP server
 * (`scripts/server.ts`) are thin shells over the same {@link GameState},
 * defined in `src/game/`. This module holds the state shape plus the
 * serialisable view shapes used by both front-ends.
 */

import type { TechnologyNode } from '../domain/enums.ts';
import type { Equipment } from '../domain/equipment.ts';
import type { ProductRecipe } from '../domain/recipe.ts';
import type { LotYieldResult } from '../domain/yield.ts';
import type { Factory } from '../factory/index.ts';
import type {
  BalanceSheet,
  ClientBook,
  ContractBoard,
  FinancialSystem,
  IncomeStatement,
  MarketEnvironment,
  MaterialCostResult,
} from '../economy/index.ts';
import type { AdvancedTechTree } from '../advanced/techTree.ts';
import type {
  AdvancedPackagingLine,
  PackagingLineSpec,
} from '../advanced/packaging.ts';
import type {
  DataCenterFacility,
  ComputeRevenueStream,
} from '../advanced/dataCenter.ts';

// ---------------------------------------------------------------------------
// Mutable game state
// ---------------------------------------------------------------------------

/** One lot released to the factory, tracked against a contract. */
export interface GameLot {
  readonly lotId: string;
  readonly contractId: string;
  readonly recipeId: string;
  /** Day the lot was released. */
  readonly releaseDay: number;
  /** Day the lot completed (null if not yet). */
  readonly completedDay: number | null;
  /** Yield result (set when completed). */
  readonly yieldResult: LotYieldResult | null;
  /** Material cost (set when completed). */
  readonly materialCost: MaterialCostResult | null;
  /** Backend cost USD (set when completed). */
  readonly backendUsd: number;
  /** Whether the lot has been delivered/settled. */
  readonly delivered: boolean;
}

/** An in-progress R&D project. */
export interface ResearchJob {
  readonly node: TechnologyNode;
  readonly startDay: number;
  readonly daysRemaining: number;
  readonly costUsd: number;
}

/** The complete mutable state of the player's semiconductor company. */
export interface GameState {
  /** Game month counter (1-based). */
  month: number;
  /** Sim day counter. */
  day: number;
  /** Whether the game is over. */
  gameOver: boolean;
  /** Game over reason, if any. */
  gameOverReason: string | null;

  /** The factory (machines, zones, recipes, lots). */
  factory: Factory;
  /** Financial ledger + assets. */
  financials: FinancialSystem;
  /** Market environment (pricing, cycle phase). */
  market: MarketEnvironment;
  /** Client relationship book. */
  clientBook: ClientBook;
  /** Contract board (offers + active contracts). */
  board: ContractBoard;
  /** Technology tree (R&D unlocks). */
  techTree: AdvancedTechTree;

  /** Equipment the player owns (for CapEX and manufacturability checks). */
  ownedEquipment: Equipment[];

  /** Recipes the player has access to (registered with factory). */
  recipes: Map<string, ProductRecipe>;

  /** Unit prices the fab pays per material (USD). */
  materialPrices: Map<string, number>;

  /** Game lots in flight / completed. */
  lots: GameLot[];

  /** Optional packaging line. */
  packagingLine: AdvancedPackagingLine | null;

  /** Optional data center facility. */
  dataCenter: DataCenterFacility | null;

  /** Optional compute revenue stream. */
  computeStream: ComputeRevenueStream | null;

  /** In-progress research (null when idle). */
  currentResearch: ResearchJob | null;

  /** Cache of last income statement / balance sheet. */
  lastIncome: IncomeStatement | null;
  lastBalance: BalanceSheet | null;

  /** PRNG seed offset for market/settlement determinism. */
  seed: number;
}

// ---------------------------------------------------------------------------
// Command results
// ---------------------------------------------------------------------------

/**
 * Outcome of a gameplay command.
 *
 * `code` is a stable machine-readable identifier (used by the HTTP API to
 * pick a status code); `message` is the human-readable text the CLI prints
 * verbatim.
 */
export interface CommandResult {
  readonly ok: boolean;
  readonly code: CommandCode;
  readonly message: string;
}

/** Stable command outcome codes. */
export type CommandCode =
  | 'OK'
  | 'GAME_OVER'
  | 'NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'INSUFFICIENT_FUNDS'
  | 'PRECONDITION_FAILED'
  | 'CONFLICT'
  | 'INTERNAL_ERROR';

/** Build a successful {@link CommandResult}. */
export function ok(message: string, code: CommandCode = 'OK'): CommandResult {
  return Object.freeze({ ok: true, code, message });
}

/** Build a failed {@link CommandResult}. */
export function fail(code: CommandCode, message: string): CommandResult {
  return Object.freeze({ ok: false, code, message });
}
