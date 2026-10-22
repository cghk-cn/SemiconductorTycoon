/**
 * Semiconductor Tycoon — Step 4: Advanced Packaging (CoWoS / HBM).
 *
 * Composite assembly: a compute die (e.g. AI GPU) + HBM4 memory stacks +
 * silicon interposer + substrate -> CoWoS package -> AI accelerator card.
 * Packaging failures can destroy high-value bare dies, which is the economic
 * risk node of advanced packaging.
 *
 * Pure, deterministic, no I/O.
 */

import { ComponentCategory, PackagingType } from '../domain/enums.ts';
import { type Equipment } from '../domain/equipment.ts';
import {
  requireInRange,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireOneOf,
  requirePositiveNumber,
} from '../domain/validation.ts';

/** One die / chiplet that goes into a package. */
export interface ChipletSpec {
  readonly chipletId: string;
  readonly name: string;
  readonly category: ComponentCategory;
  /** Die footprint in mm². */
  readonly dieSizeMm2: number;
  /** How many of this chiplet are needed per package. */
  readonly quantityPerPackage: number;
}

/** Bill of materials for one advanced package. */
export interface PackagingBom {
  readonly interposer: ChipletSpec;      // silicon interposer (1 per package)
  readonly substrate: ChipletSpec;       // organic substrate (1 per package)
  readonly computeChiplet: ChipletSpec;  // AI GPU / CPU die (1 per package)
  readonly memoryStacks: readonly ChipletSpec[]; // HBM stacks (N per package)
}

/** Specification of an advanced packaging line. */
export interface PackagingLineSpec {
  readonly lineId: string;
  readonly name: string;
  readonly packagingType: PackagingType;
  readonly equipment: Equipment;
  /** Packages the line can attempt per day. */
  readonly throughputPackagesPerDay: number;
  /** Fraction of package attempts that fail (0..1). */
  readonly baseFailureRate: number;
  /** Fraction of failed packages that destroy the compute die (0..1). */
  readonly dieDamageRateOnFailure: number;
  /** Consumables + processing cost per package attempt, USD. */
  readonly costPerPackageUsd: number;
}

/** Outcome of one packaging assembly run. */
export interface PackagingResult {
  readonly lineId: string;
  readonly packageId: string;
  readonly packagesAttempted: number;
  readonly goodPackages: number;
  readonly failedPackages: number;
  /** goodPackages / packagesAttempted. */
  readonly yieldFraction: number;
  /** Compute dies destroyed by packaging failure. */
  readonly damagedComputeDies: number;
  readonly hbmStacksConsumed: number;
  readonly packagingCostUsd: number;
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------------------
// Reference CoWoS bill of materials
// ---------------------------------------------------------------------------

/** HBM4 stack + AI GPU die + interposer + substrate for one CoWoS package. */
export function coWoSBom(): PackagingBom {
  return Object.freeze({
    interposer: {
      chipletId: 'CHIPLET-INTERPOSER-SI',
      name: 'Reticle-Size Silicon Interposer',
      category: ComponentCategory.LOGIC_SOC,
      dieSizeMm2: 864, // ~29mm x 29mm reticle limit
      quantityPerPackage: 1,
    },
    substrate: {
      chipletId: 'CHIPLET-SUBSTRATE-ORG',
      name: 'Organic Package Substrate',
      category: ComponentCategory.LOGIC_SOC,
      dieSizeMm2: 400,
      quantityPerPackage: 1,
    },
    computeChiplet: {
      chipletId: 'CHIPLET-AI-GPU-A16',
      name: 'A16 AI GPU Compute Die',
      category: ComponentCategory.GPU,
      dieSizeMm2: 650,
      quantityPerPackage: 1,
    },
    memoryStacks: Object.freeze([
      {
        chipletId: 'CHIPLET-HBM4-STACK',
        name: 'HBM4 Memory Stack (8hi)',
        category: ComponentCategory.GPU,
        dieSizeMm2: 196, // ~14mm x 14mm
        quantityPerPackage: 6,
      },
    ]),
  });
}

// ---------------------------------------------------------------------------
// AdvancedPackagingLine
// ---------------------------------------------------------------------------

/**
 * Advanced packaging line (CoWoS / 2.5D / 3D). Attempts to assemble one
 * package per unit of input: 1 compute die + 1 interposer + 1 substrate +
 * N HBM stacks. A failed package can destroy the compute die, which is the
 * economic risk of advanced packaging.
 *
 * Deterministic: no RNG; failures computed by fixed rates and floor().
 */
export class AdvancedPackagingLine {
  private readonly lineSpec: Readonly<PackagingLineSpec>;

  constructor(spec: PackagingLineSpec) {
    requireNonEmptyString(spec.lineId, 'packaging.lineId');
    requireNonEmptyString(spec.name, 'packaging.name');
    requireOneOf(
      spec.packagingType,
      'packaging.packagingType',
      Object.values(PackagingType),
    );
    requirePositiveNumber(spec.throughputPackagesPerDay, 'packaging.throughputPackagesPerDay');
    requireInRange(spec.baseFailureRate, 'packaging.baseFailureRate', 0, 1);
    requireInRange(spec.dieDamageRateOnFailure, 'packaging.dieDamageRateOnFailure', 0, 1);
    requireNonNegativeNumber(spec.costPerPackageUsd, 'packaging.costPerPackageUsd');
    this.lineSpec = Object.freeze(spec);
  }

  /** The line's specification (immutable). */
  get spec(): Readonly<PackagingLineSpec> {
    return this.lineSpec;
  }

  /** Throughput cap per day. */
  get throughputPackagesPerDay(): number {
    return this.lineSpec.throughputPackagesPerDay;
  }

  /**
   * Assemble `input` resources into packages.
   *
   * Package count is bounded by the scarcest of: compute dies, interposers,
   * substrates, and HBM stacks (divided by stacks per package). Failures
   * apply to attempted packages; a fraction of failures destroy the compute
   * die inside.
   */
  assemble(input: {
    readonly computeDies: number;
    readonly hbmStacks: number;
    readonly interposers: number;
    readonly substrates: number;
  }): PackagingResult {
    requireNonNegativeNumber(input.computeDies, 'packaging.computeDies');
    requireNonNegativeNumber(input.hbmStacks, 'packaging.hbmStacks');
    requireNonNegativeNumber(input.interposers, 'packaging.interposers');
    requireNonNegativeNumber(input.substrates, 'packaging.substrates');

    const bom = coWoSBom();
    const hbmQtyPerPackage = bom.memoryStacks.reduce((s, m) => s + m.quantityPerPackage, 0);
    const stacksPerPkg = hbmQtyPerPackage > 0 ? hbmQtyPerPackage : 1;

    const byHbm = stacksPerPkg > 0 ? Math.floor(input.hbmStacks / stacksPerPkg) : 0;
    const packagesAttempted = Math.min(
      Math.floor(input.computeDies),
      Math.floor(input.interposers),
      Math.floor(input.substrates),
      byHbm,
    );

    const goodPackages = Math.floor(packagesAttempted * (1 - this.lineSpec.baseFailureRate));
    const failedPackages = packagesAttempted - goodPackages;
    const damagedComputeDies = Math.floor(failedPackages * this.lineSpec.dieDamageRateOnFailure);
    const yieldFraction = packagesAttempted > 0 ? goodPackages / packagesAttempted : 0;
    const hbmStacksConsumed = packagesAttempted * stacksPerPkg;
    const packagingCostUsd = packagesAttempted * this.lineSpec.costPerPackageUsd;

    const notes: string[] = [];
    notes.push(
      `Attempted ${packagesAttempted} ${this.lineSpec.packagingType} package(s) on line '${this.lineSpec.lineId}'.`,
    );
    if (failedPackages > 0) {
      notes.push(
        `${failedPackages} package(s) failed (yield ${(yieldFraction * 100).toFixed(1)}%).`,
      );
    }
    if (damagedComputeDies > 0) {
      notes.push(
        `${damagedComputeDies} compute die(s) destroyed by packaging failure — high-value loss.`,
      );
    }

    return Object.freeze({
      lineId: this.lineSpec.lineId,
      packageId: `${this.lineSpec.lineId}-PKG`,
      packagesAttempted,
      goodPackages,
      failedPackages,
      yieldFraction,
      damagedComputeDies,
      hbmStacksConsumed,
      packagingCostUsd,
      notes: Object.freeze(notes),
    });
  }
}


/**
 * Alias so the module exports the name from the design brief. A CoWoS
 * assembler is just an {@link AdvancedPackagingLine} configured for 2.5D/3D
 * (GPU + HBM + silicon interposer) assembly.
 */
export const CoWoSAssembler = AdvancedPackagingLine;
export type CoWoSAssembler = AdvancedPackagingLine;

