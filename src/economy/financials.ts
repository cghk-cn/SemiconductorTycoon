import { LedgerCategory } from './enums.ts';
import {
  requireNonEmptyString,
  requireNonNegativeNumber,
  requirePositiveNumber,
} from '../domain/validation.ts';

/** One entry in the double-entry-ish cash ledger. */
export interface LedgerEntry {
  /** Monotonic sequence number. */
  readonly seq: number;
  /** Sim-day the entry was posted. */
  readonly day: number;
  readonly category: LedgerCategory;
  /** Human-readable memo (e.g. "materials for LOT-0001"). */
  readonly memo: string;
  /** Signed USD amount: positive = cash in, negative = cash out. */
  readonly amountUsd: number;
  /** Running cash balance after this entry. */
  readonly balanceAfterUsd: number;
}

/** A capital asset on the player's balance sheet. */
export interface CapitalAsset {
  readonly id: string;
  readonly name: string;
  /** Acquisition cost in USD. */
  readonly costUsd: number;
  /** Book value remaining (cost minus accumulated depreciation). */
  readonly bookValueUsd: number;
  /** Straight-line useful life in days. */
  readonly usefulLifeDays: number;
  /** Sim-day the asset was capitalised. */
  readonly acquiredDay: number;
  /** Accumulated depreciation so far. */
  readonly accumulatedDepreciationUsd: number;
  /** 0..1 — the share of the asset that draws power (0 for a building shell). */
  readonly powerDrawFactor: number;
  /** 0..1 — the share of the asset that needs staff (0 for a building shell). */
  readonly staffingFactor: number;
}

/** Recurring operating cost lines. */
export interface OpexLine {
  readonly id: string;
  readonly name: string;
  /** Fixed USD per day. */
  readonly usdPerDay: number;
}

/** Cost of consuming raw materials for one lot. */
export interface MaterialCostInput {
  /** Material id. */
  readonly materialId: string;
  readonly name: string;
  /** Unit price in USD per unit of the material. */
  readonly unitPriceUsd: number;
  /** Units consumed per wafer. */
  readonly quantityPerWafer: number;
  /** Wafers in the lot. */
  readonly wafersPerLot: number;
}

/** One material charge, itemised for the delivery log. */
export interface MaterialCharge {
  readonly materialId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unit: string;
  readonly unitPriceUsd: number;
  readonly totalUsd: number;
}

/** Result of costing a lot's raw materials. */
export interface MaterialCostResult {
  readonly charges: readonly MaterialCharge[];
  readonly totalUsd: number;
}

/** Money in / money out for a period. */
export interface CashFlowSummary {
  readonly inflowsUsd: number;
  readonly outflowsUsd: number;
  readonly netUsd: number;
  readonly byCategory: Readonly<Record<string, number>>;
}

/** The income statement for a period. */
export interface IncomeStatement {
  readonly revenueUsd: number;
  readonly materialCostUsd: number;
  readonly backendCostUsd: number;
  readonly opexUsd: number;
  readonly depreciationUsd: number;
  readonly penaltyUsd: number;
  readonly grossProfitUsd: number;
  readonly operatingProfitUsd: number;
  readonly netProfitUsd: number;
  readonly marginPercent: number;
}

/** The balance sheet. */
export interface BalanceSheet {
  readonly cashUsd: number;
  readonly grossAssetsUsd: number;
  readonly netAssetsUsd: number;
  readonly totalLiabilitiesUsd: number;
  readonly equityUsd: number;
  readonly netCashUsd: number;
}

/** Financial tuning knobs. */
export interface FinancialOptions {
  /** Starting cash. */
  readonly startingCashUsd?: number;
  /** Baseline power cost in USD per kWh. */
  readonly usdPerKwh?: number;
  /** Baseline cleanroom / facility OpEX in USD per day. */
  readonly facilityOpexUsdPerDay?: number;
  /** Engineer payroll in USD per day (per staffed FTE-equivalent). */
  readonly laborUsdPerDay?: number;
  /** Default useful life of a tool, in days. */
  readonly defaultUsefulLifeDays?: number;
}

/**
 * The player's financial system: cash, capital assets, operating costs, the
 * cash ledger, and period financial statements.
 *
 * Accounting rules:
 *  - CapEX capitalises a tool and depreciates it straight-line over its
 *    useful life (a floor of zero book value).
 *  - Materials, backend, power and OpEX are expensed as incurred.
 *  - Revenue is recognised on settlement of a contract.
 *  - Penalties are expensed as levied.
 */
export class FinancialSystem {
  private cash: number;
  private readonly ledger: LedgerEntry[] = [];
  private readonly assets = new Map<string, CapitalAsset>();
  private readonly opexLines = new Map<string, OpexLine>();
  private readonly options: Required<FinancialOptions>;
  private seq = 0;

  // Running period accumulators.
  private revenue = 0;
  private materialCost = 0;
  private backendCost = 0;
  private opexCost = 0;
  private depreciationCost = 0;
  private penaltyCost = 0;

  constructor(options: FinancialOptions = {}) {
    this.options = {
      startingCashUsd: options.startingCashUsd ?? 50_000_000,
      usdPerKwh: options.usdPerKwh ?? 0.08,
      facilityOpexUsdPerDay: options.facilityOpexUsdPerDay ?? 120_000,
      laborUsdPerDay: options.laborUsdPerDay ?? 4_500,
      defaultUsefulLifeDays: options.defaultUsefulLifeDays ?? 1_460,
    };
    this.cash = 0;
    this.post(
      LedgerCategory.FINANCING,
      'Initial capitalisation',
      this.options.startingCashUsd,
      0,
    );
  }

  /** Current cash balance. */
  get cashUsd(): number {
    return this.cash;
  }

  /** The full ledger, oldest first. */
  get entries(): readonly LedgerEntry[] {
    return this.ledger;
  }

  /** All capital assets. */
  get capitalAssets(): readonly CapitalAsset[] {
    return [...this.assets.values()];
  }

  /** Total book value of all assets. */
  get netAssetsUsd(): number {
    let total = 0;
    for (const a of this.assets.values()) total += a.bookValueUsd;
    return total;
  }

  /** Total gross acquisition cost of all assets. */
  get grossAssetsUsd(): number {
    let total = 0;
    for (const a of this.assets.values()) total += a.costUsd;
    return total;
  }

  /** Post a ledger entry and move cash accordingly. */
  post(category: LedgerCategory, memo: string, amountUsd: number, day: number): LedgerEntry {
    requireNonEmptyString(memo, 'ledger.memo');
    if (!Number.isFinite(amountUsd)) throw new Error(`[Financials] non-finite amount ${amountUsd}`);
    this.cash += amountUsd;
    this.seq += 1;
    const entry: LedgerEntry = {
      seq: this.seq,
      day,
      category,
      memo,
      amountUsd,
      balanceAfterUsd: this.cash,
    };
    this.ledger.push(entry);
    return entry;
  }

  /**
   * Capitalise an asset: cash out now, depreciation expense later.
   */
  capitalise(
    input: {
      readonly id: string;
      readonly name: string;
      readonly costUsd: number;
      readonly usefulLifeDays?: number;
      readonly acquiredDay: number;
      readonly powerDrawFactor?: number;
      readonly staffingFactor?: number;
    },
  ): CapitalAsset {
    requireNonEmptyString(input.id, 'asset.id');
    requirePositiveNumber(input.costUsd, 'asset.costUsd');
    const usefulLifeDays = input.usefulLifeDays ?? this.options.defaultUsefulLifeDays;
    const asset: CapitalAsset = {
      id: input.id,
      name: input.name,
      costUsd: input.costUsd,
      bookValueUsd: input.costUsd,
      usefulLifeDays,
      acquiredDay: input.acquiredDay,
      accumulatedDepreciationUsd: 0,
      powerDrawFactor: input.powerDrawFactor ?? 1,
      staffingFactor: input.staffingFactor ?? 1,
    };
    this.assets.set(asset.id, asset);
    this.post(LedgerCategory.CAPEX, `CapEX: ${asset.name}`, -asset.costUsd, input.acquiredDay);
    return asset;
  }

  /** Retire an asset (sale or scrap): cash in, book value written off. */
  disposeAsset(assetId: string, salePriceUsd: number, day: number): number {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error(`[Financials] unknown asset '${assetId}'`);
    const writeOff = asset.bookValueUsd;
    this.assets.delete(assetId);
    this.post(LedgerCategory.CAPEX, `Disposal: ${asset.name}`, salePriceUsd, day);
    if (writeOff > 0) {
      this.post(LedgerCategory.DEPRECIATION, `Write-off: ${asset.name}`, 0, day);
    }
    return writeOff;
  }

  /**
   * Charge raw materials for a lot and post the ledger entry.
   */
  chargeMaterials(lotId: string, costs: readonly MaterialCostInput[], day: number): MaterialCostResult {
    const charges: MaterialCharge[] = costs.map((c) => {
      requireNonNegativeNumber(c.unitPriceUsd, 'material.unitPriceUsd');
      const quantity = c.quantityPerWafer * c.wafersPerLot;
      return Object.freeze({
        materialId: c.materialId,
        name: c.name,
        quantity,
        unit: 'wafer',
        unitPriceUsd: c.unitPriceUsd,
        totalUsd: quantity * c.unitPriceUsd,
      });
    });
    const totalUsd = charges.reduce((s, c) => s + c.totalUsd, 0);
    this.materialCost += totalUsd;
    this.post(LedgerCategory.MATERIALS, `Materials for ${lotId}`, -totalUsd, day);
    return Object.freeze({ charges, totalUsd });
  }

  /** Charge backend (assembly/test) cost for a lot. */
  chargeBackend(lotId: string, costUsd: number, day: number): void {
    requireNonNegativeNumber(costUsd, 'backend.costUsd');
    this.backendCost += costUsd;
    this.post(LedgerCategory.BACKEND, `Backend for ${lotId}`, -costUsd, day);
  }

  /**
   * Charge one day's power cost for the installed tool base.
   */
  chargePower(day: number, extraKwh = 0): number {
    const kwh = this.totalPowerKwh() + extraKwh;
    const cost = kwh * this.options.usdPerKwh;
    this.opexCost += cost;
    this.post(LedgerCategory.POWER, `Power @ ${kwh.toFixed(0)} kWh`, -cost, day);
    return cost;
  }

  /** Total daily power draw of the installed tool base, in kWh. */
  totalPowerKwh(): number {
    let kwh = 0;
    for (const a of this.assets.values()) kwh += this.assetPowerKwh(a);
    return kwh;
  }

  /** Power draw of one asset, in kWh/day. */
  assetPowerKwh(asset: CapitalAsset): number {
    // A modern fab tool pulls ~120 kW average → ~2,880 kWh/day.
    const kwhPerDay = 2_880 * asset.powerDrawFactor;
    return kwhPerDay;
  }

  /** Register a recurring OpEX line. */
  addOpexLine(line: OpexLine): void {
    requireNonEmptyString(line.id, 'opex.id');
    this.opexLines.set(line.id, line);
  }

  /** Remove a recurring OpEX line. */
  removeOpexLine(opexId: string): void {
    this.opexLines.delete(opexId);
  }

  /** Charge one day's fixed OpEX (facility + payroll + registered lines). */
  chargeOpex(day: number, extraLaborFte = 0): number {
    let total = this.options.facilityOpexUsdPerDay;
    total += this.options.laborUsdPerDay * extraLaborFte;
    for (const line of this.opexLines.values()) total += line.usdPerDay;
    this.opexCost += total;
    this.post(LedgerCategory.OPEX, `Operating expenses (day ${day})`, -total, day);
    return total;
  }

  /** Recognise revenue from a settled contract. */
  recogniseRevenue(contractId: string, amountUsd: number, day: number): void {
    requireNonNegativeNumber(amountUsd, 'revenue.amountUsd');
    this.revenue += amountUsd;
    this.post(LedgerCategory.REVENUE, `Revenue from ${contractId}`, amountUsd, day);
  }

  /** Charge a penalty to the player. */
  chargePenalty(contractId: string, amountUsd: number, day: number): void {
    requireNonNegativeNumber(amountUsd, 'penalty.amountUsd');
    this.penaltyCost += amountUsd;
    this.post(LedgerCategory.PENALTY, `Penalty on ${contractId}`, -amountUsd, day);
  }

  /**
   * Accrue one day of straight-line depreciation on every asset.
   *
   * Depreciation is an expense, not a cash movement, so it is posted to the
   * ledger as a zero-cash memo entry in its own category.
   */
  accrueDepreciation(day: number): number {
    let total = 0;
    for (const [id, asset] of this.assets) {
      const daily = asset.costUsd / asset.usefulLifeDays;
      const remaining = asset.bookValueUsd - daily;
      const depreciation = remaining >= 0 ? daily : asset.bookValueUsd;
      if (depreciation <= 0) continue;
      const updated: CapitalAsset = {
        ...asset,
        bookValueUsd: asset.bookValueUsd - depreciation,
        accumulatedDepreciationUsd: asset.accumulatedDepreciationUsd + depreciation,
      };
      this.assets.set(id, updated);
      total += depreciation;
    }
    if (total > 0) {
      this.depreciationCost += total;
      this.post(LedgerCategory.DEPRECIATION, `Depreciation (day ${day})`, 0, day);
    }
    return total;
  }

  /** Cash flow summary over a day range (inclusive). */
  cashFlow(fromDay = 0, toDay = Number.POSITIVE_INFINITY): CashFlowSummary {
    let inflows = 0;
    let outflows = 0;
    const byCategory: Record<string, number> = {};
    for (const e of this.ledger) {
      if (e.day < fromDay || e.day > toDay) continue;
      if (e.amountUsd > 0) inflows += e.amountUsd;
      else outflows += -e.amountUsd;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountUsd;
    }
    return Object.freeze({
      inflowsUsd: inflows,
      outflowsUsd: outflows,
      netUsd: inflows - outflows,
      byCategory: Object.freeze(byCategory),
    });
  }

  /** The income statement for the accumulated period. */
  incomeStatement(): IncomeStatement {
    const grossProfit = this.revenue - this.materialCost - this.backendCost;
    const operatingProfit = grossProfit - this.opexCost - this.depreciationCost - this.penaltyCost;
    const netProfit = operatingProfit;
    const margin = this.revenue > 0 ? (netProfit / this.revenue) * 100 : 0;
    return Object.freeze({
      revenueUsd: this.revenue,
      materialCostUsd: this.materialCost,
      backendCostUsd: this.backendCost,
      opexUsd: this.opexCost,
      depreciationUsd: this.depreciationCost,
      penaltyUsd: this.penaltyCost,
      grossProfitUsd: grossProfit,
      operatingProfitUsd: operatingProfit,
      netProfitUsd: netProfit,
      marginPercent: margin,
    });
  }

  /** The balance sheet at the current point in time. */
  balanceSheet(): BalanceSheet {
    const netAssets = this.netAssetsUsd;
    const equity = this.cash + netAssets;
    return Object.freeze({
      cashUsd: this.cash,
      grossAssetsUsd: this.grossAssetsUsd,
      netAssetsUsd: netAssets,
      totalLiabilitiesUsd: 0,
      equityUsd: equity,
      netCashUsd: this.cash,
    });
  }

  /** Reset the period accumulators (start of a new reporting period). */
  resetPeriod(): void {
    this.revenue = 0;
    this.materialCost = 0;
    this.backendCost = 0;
    this.opexCost = 0;
    this.depreciationCost = 0;
    this.penaltyCost = 0;
  }
}
