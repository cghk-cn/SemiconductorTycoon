/**
 * Semiconductor Tycoon — Step 5: the production-to-accounting pipeline.
 *
 * One function wires the whole chain together:
 *
 *   PRODUCTION → YIELD → [PACKAGING] → [DATA_CENTER] → SETTLEMENT → FINANCIAL
 *
 * Optional stages run only when configured. Settlement always runs before the
 * financial statements are cut, so the income statement always includes the
 * contract revenue and any penalties.
 */

import {
  ValidationError,
  requireNonEmptyString,
  requireNonNegativeInteger,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from '../domain/validation.ts';
import { createWaferLot } from '../domain/waferLot.ts';
import { computeLotYield, type LotYieldResult } from '../domain/yield.ts';
import { factoryTick, releaseLot } from '../factory/index.ts';
import type { Factory } from '../factory/simulation.ts';
import {
  LedgerCategory,
  SettlementEngine,
  type LotDelivery,
  type MaterialCostInput,
} from '../economy/index.ts';
import {
  IntegrationStage,
  PipelineStatus,
  type LotOutcome,
  type MaterialChargeView,
  type PipelineOptions,
  type PipelineResult,
  type StageOutcome,
} from './types.ts';

/** Default cap on factory ticks before the pipeline gives up. */
const DEFAULT_MAX_TICKS = 20_000;
/** Default settlement RNG seed (keeps runs reproducible). */
const DEFAULT_SETTLEMENT_SEED = 4242;
/** Default packaging failure-rate sensitivity to wafer defect density. */
const DEFAULT_DEFECT_SENSITIVITY = 0.05;

/** Mutable accumulator used while the pipeline runs. */
interface RunState {
  readonly stages: StageOutcome[];
  readonly lots: LotOutcome[];
  readonly failures: string[];
  totalGoodDies: number;
  packaging: PipelineResult['packaging'];
  compute: PipelineResult['compute'];
  settlement: PipelineResult['settlement'];
}


/** Validate the caller's options before any money or wafers are touched. */
function validateOptions(options: PipelineOptions): void {
  if (!options.factory) throw new ValidationError('pipeline.factory', 'a factory is required');
  if (!options.financials) throw new ValidationError('pipeline.financials', 'financials are required');
  if (!options.board) throw new ValidationError('pipeline.board', 'a contract board is required');
  if (!options.clientBook) throw new ValidationError('pipeline.clientBook', 'a client book is required');
  if (!options.market) throw new ValidationError('pipeline.market', 'a market is required');
  if (!options.contract) throw new ValidationError('pipeline.contract', 'a contract is required');
  if (!options.recipe) throw new ValidationError('pipeline.recipe', 'a recipe is required');
  requirePositiveNumber(options.lotCount, 'pipeline.lotCount');
  requirePositiveNumber(options.wafersPerLot, 'pipeline.wafersPerLot');
  requireNonNegativeNumber(options.backendUsdPerDie, 'pipeline.backendUsdPerDie');
  requireNonEmptyString(options.contract.id, 'pipeline.contract.id');
  requireNonEmptyString(options.recipe.recipeId, 'pipeline.recipe.recipeId');
  if (!options.factory.recipes.has(options.recipe.recipeId)) {
    throw new ValidationError(
      'pipeline.recipe',
      `recipe '${options.recipe.recipeId}' is not registered with the factory`,
    );
  }
  const known = new Set(options.recipe.materials.map((m) => m.materialId));
  for (const price of options.materialPrices) {
    requireNonEmptyString(price.materialId, 'pipeline.materialPrices.materialId');
    requireNonNegativeNumber(price.unitPriceUsd, 'pipeline.materialPrices.unitPriceUsd');
    if (!known.has(price.materialId)) {
      throw new ValidationError(
        'pipeline.materialPrices',
        `material '${price.materialId}' is not consumed by recipe '${options.recipe.recipeId}'`,
      );
    }
  }
  if (options.packaging) {
    requireNonNegativeInteger(options.packaging.interposers, 'pipeline.packaging.interposers');
    requireNonNegativeInteger(options.packaging.substrates, 'pipeline.packaging.substrates');
    requireNonNegativeInteger(options.packaging.hbmStacks, 'pipeline.packaging.hbmStacks');
    if (options.packaging.defectSensitivityPerCm2 !== undefined) {
      requireNonNegativeNumber(
        options.packaging.defectSensitivityPerCm2,
        'pipeline.packaging.defectSensitivityPerCm2',
      );
    }
  }
  if (options.dataCenter) {
    requirePositiveNumber(options.dataCenter.hours, 'pipeline.dataCenter.hours');
  }
}

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

/**
 * Run one order end to end: release lots to the factory, run production,
 * compute yield, optionally package and monetise data-center compute,
 * settle the contract, and close the financial period.
 */
export function runProductionPipeline(options: PipelineOptions): PipelineResult {
  const state: RunState = {
    stages: [],
    lots: [],
    failures: [],
    totalGoodDies: 0,
    packaging: null,
    compute: null,
    settlement: null,
  };

  const {
    factory,
    financials,
    board,
    clientBook,
    market,
    contract,
    recipe,
    lotCount,
    wafersPerLot,
    materialPrices,
    backendUsdPerDie,
    packaging,
    dataCenter,
    settlement: settlementOptions = {},
    settlementSeed = DEFAULT_SETTLEMENT_SEED,
    maxTicks = DEFAULT_MAX_TICKS,
    lotIdPrefix = 'LOT',
  } = options;

  const addStage = (name: IntegrationStage, ok: boolean, skipped: boolean, message: string): void => {
    state.stages.push({ stage: name, ok, skipped, message });
  };

  // ── 1. Production: release lots and run the factory ──
  const releasedLotIds: string[] = [];
  const completedLotIds = new Set<string>();
  const scrappedLotIds = new Set<string>();

  for (let i = 0; i < lotCount; i++) {
    const lotId = `${lotIdPrefix}-${String(i + 1).padStart(4, '0')}`;
    const domainLot = createWaferLot({
      lotId,
      recipeId: recipe.recipeId,
      waferSize: recipe.waferSize,
      targetNode: recipe.targetNode,
      wafersPerLot,
    });
    releaseLot(factory, domainLot, i);
    releasedLotIds.push(lotId);
  }

  addStage(IntegrationStage.PRODUCTION, true, false, `Released ${lotCount} lot(s) to the factory.`);

  let ticks = 0;
  let lastChargedDay = Math.floor(factory.now / 1440);

  while (ticks < maxTicks) {
    factoryTick(factory);
    ticks += 1;

    const day = Math.floor(factory.now / 1440);
    while (day > lastChargedDay) {
      lastChargedDay += 1;
      financials.chargePower(lastChargedDay);
      financials.chargeOpex(lastChargedDay);
      financials.accrueDepreciation(lastChargedDay);
    }

    for (const lot of factory.completed) {
      completedLotIds.add(lot.domainLot.lotId);
    }
    for (const lot of factory.scrapped) {
      scrappedLotIds.add(lot.domainLot.lotId);
    }

    if (completedLotIds.size + scrappedLotIds.size >= releasedLotIds.length) break;
  }

  const settledCount = completedLotIds.size + scrappedLotIds.size;
  if (settledCount < releasedLotIds.length) {
    const remaining = releasedLotIds.length - settledCount;
    state.failures.push(`Factory did not settle ${remaining} lot(s) within ${maxTicks} ticks.`);
    addStage(IntegrationStage.PRODUCTION, false, false, `Incomplete: ${remaining} lot(s) still in flight after ${ticks} ticks.`);
  } else {
    addStage(IntegrationStage.PRODUCTION, true, false, `All ${lotCount} lot(s) settled in ${ticks} ticks.`);
  }

  // ── 2. Yield: compute yield for each completed lot ──
  const priceByMaterial = new Map<string, number>();
  for (const p of materialPrices) {
    priceByMaterial.set(p.materialId, p.unitPriceUsd);
  }

  const dayNow = Math.floor(factory.now / 1440);
  for (const lotId of releasedLotIds) {
    const domainLot = factory.completed.find((l) => l.domainLot.lotId === lotId)?.domainLot
      ?? factory.scrapped.find((l) => l.domainLot.lotId === lotId)?.domainLot;
    if (!domainLot) continue;

    const isScrapped = scrappedLotIds.has(lotId);
    const shipDay = isScrapped ? null : dayNow;

    let yieldResult: LotYieldResult;
    let materialCostUsd = 0;
    let materialCharges: MaterialChargeView[] = [];
    let backendUsd = 0;

    if (!isScrapped) {
      yieldResult = computeLotYield({
        waferSize: recipe.waferSize,
        dieSizeMm2: recipe.dieSizeMm2,
        defectDensityPerCm2: domainLot.accumulatedDefectDensityPerCm2,
        wafersPerLot,
      });

      const matInputs: MaterialCostInput[] = recipe.materials.map((m) => ({
        materialId: m.materialId,
        name: m.name,
        unitPriceUsd: priceByMaterial.get(m.materialId) ?? 0,
        quantityPerWafer: m.quantityPerWafer,
        wafersPerLot,
      }));
      const costResult = financials.chargeMaterials(lotId, matInputs, dayNow);
      materialCostUsd = costResult.totalUsd;
      materialCharges = costResult.charges.map((c) => ({
        materialId: c.materialId,
        name: c.name,
        quantity: c.quantity,
        totalUsd: c.totalUsd,
      }));

      backendUsd = yieldResult.netGoodDies * backendUsdPerDie;
      financials.chargeBackend(lotId, backendUsd, dayNow);

      state.totalGoodDies += yieldResult.netGoodDies;
    } else {
      yieldResult = computeLotYield({
        waferSize: recipe.waferSize,
        dieSizeMm2: recipe.dieSizeMm2,
        defectDensityPerCm2: domainLot.accumulatedDefectDensityPerCm2 ?? 0,
        wafersPerLot,
      });
    }

    state.lots.push({
      lotId,
      shipDay,
      scrapped: isScrapped,
      scrapReason: isScrapped ? (domainLot.scrapReason ?? 'scrapped in factory') : null,
      yieldResult,
      materialCostUsd,
      materialCharges,
      backendUsd,
    });
  }

  addStage(IntegrationStage.YIELD, true, false, `Computed yield for ${completedLotIds.size} completed lot(s).`);

  // ── 3. Packaging (optional) ──
  if (packaging) {
    const totalGoodDies = state.totalGoodDies;
    const defectDensity = state.lots.reduce((s, l) => s + l.yieldResult.defectDensityPerCm2, 0) / Math.max(state.lots.length, 1);
    const sensitivity = packaging.defectSensitivityPerCm2 ?? DEFAULT_DEFECT_SENSITIVITY;
    const effectiveHbmStacks = Math.max(0, packaging.hbmStacks - Math.floor(defectDensity * sensitivity * 1000));

    const pkgResult = packaging.line.assemble({
      computeDies: totalGoodDies,
      hbmStacks: effectiveHbmStacks,
      interposers: packaging.interposers,
      substrates: packaging.substrates,
    });
    state.packaging = pkgResult;
    addStage(IntegrationStage.PACKAGING, true, false, `Packaged ${pkgResult.goodPackages}/${pkgResult.packagesAttempted} package(s).`);
  } else {
    addStage(IntegrationStage.PACKAGING, true, true, 'No packaging line configured.');
  }

  // ── 4. Data center (optional) ──
  if (dataCenter) {
    const computeResult = dataCenter.stream.run(dataCenter.hours);
    state.compute = computeResult;
    financials.post(LedgerCategory.REVENUE, 'Data-center compute revenue', computeResult.revenueUsd, dayNow);
    financials.post(LedgerCategory.OPEX, 'Data-center power cost', -computeResult.powerCostUsd, dayNow);
    addStage(IntegrationStage.DATA_CENTER, true, false, `Compute revenue $${computeResult.revenueUsd.toLocaleString()}.`);
  } else {
    addStage(IntegrationStage.DATA_CENTER, true, true, 'No data center configured.');
  }

  // ── 5. Settlement ──
  const deliveries: LotDelivery[] = state.lots
    .filter((l) => !l.scrapped && l.shipDay !== null)
    .map((l) => ({
      lotId: l.lotId,
      quality: {
        goodDies: l.yieldResult.netGoodDies,
        totalDies: l.yieldResult.totalGrossDies,
        yieldFraction: l.yieldResult.yieldFraction,
        defectDensityPerCm2: l.yieldResult.defectDensityPerCm2,
      },
      shipDay: l.shipDay!,
    }));

  const settlementEngine = new SettlementEngine(financials, clientBook, market, settlementOptions, settlementSeed);
  const settlementResult = settlementEngine.settle(board, contract.id, deliveries);
  state.settlement = settlementResult;

  const settled = settlementResult.finalStatus === 'SETTLED';
  addStage(
    IntegrationStage.SETTLEMENT,
    settled,
    false,
    `Settled ${contract.id}: grade=${settlementResult.grade} net=$${settlementResult.netPaymentUsd.toLocaleString()}.`,
  );

  // ── 6. Financial period close ──
  const income = financials.incomeStatement();
  const balance = financials.balanceSheet();
  addStage(IntegrationStage.FINANCIAL, true, false, `Period closed: net profit $${income.netProfitUsd.toLocaleString()}.`);

  const status = state.failures.length > 0 ? PipelineStatus.FAILED : PipelineStatus.COMPLETED;
  return Object.freeze({
    status,
    stages: Object.freeze([...state.stages]),
    lots: Object.freeze([...state.lots]),
    totalGoodDies: state.totalGoodDies,
    packaging: state.packaging,
    compute: state.compute,
    settlement: state.settlement,
    income,
    balance,
    failures: Object.freeze([...state.failures]),
  });
}
