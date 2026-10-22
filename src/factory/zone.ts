import { requireNonEmptyString, requireNonNegativeNumber, requireInRange } from '../domain/validation.ts';

/**
 * Environmental contamination model for a cleanroom bay.
 *
 * `ambientDefectRatePerCm2` is a small per-wafer-pass defect density contributed
 * by the room itself ( airborne particles that land during processing). It is
 * *added on top of* each machine's intrinsic + wear-scaled defect rate, so a
 * dirtier bay measurably hurts yield. ISO classes are flavor + a suggested
 * default ambient rate; the simulation reads only the numeric rate.
 */
export interface CleanroomZone {
  readonly zoneId: string;
  /** Human label, e.g. "ISO Class 3 Litho Bay". */
  readonly name: string;
  /** Cleanliness class (ISO 1 = cleanest … ISO 9 = dirtiest). */
  readonly isoClass: number;
  /** Base ambient defect density contributed per wafer pass, in defects/cm². */
  readonly ambientDefectRatePerCm2: number;
  /** Machine ids installed in this bay. */
  readonly machines: readonly string[];
  /** Steady-state temperature in °C (comfort/optics window ~18–24). */
  readonly temperatureC: number;
  /** Relative humidity in % (electrostatic control ~40–55). */
  readonly relativeHumidityPercent: number;
  /** Micro-vibration score 0–100 (0 = still, higher = worse for lithography). */
  readonly vibrationScore: number;
  /** Electromagnetic-interference score 0–100 (higher = worse). */
  readonly emiScore: number;
}

/** Caller input for {@link createCleanroomZone}. */
export interface CleanroomZoneInput {
  zoneId: string;
  name: string;
  isoClass: number;
  ambientDefectRatePerCm2: number;
  machines?: string[];
  temperatureC?: number;
  relativeHumidityPercent?: number;
  vibrationScore?: number;
  emiScore?: number;
}

/**
 * Suggested ambient defect density (defects/cm²) for an ISO class — a rough
 * industry-flavored heuristic so a player assigning a dirty bay pays a real
 * yield cost. ISO 3 is a typical litho bay; ISO 5+ is far dirtier.
 */
export function ambientRateForIsoClass(isoClass: number): number {
  const iso = requireInRange(isoClass, 'zone.isoClass', 1, 9);
  // Each class step is ~2× the particle count of the previous; map to a small
  // defect density floor at ISO 1 rising steeply toward ISO 9.
  return Number((0.001 * 2 ** (iso - 1)).toFixed(4));
}

/** Validate and build an immutable {@link CleanroomZone}. */
export function createCleanroomZone(input: CleanroomZoneInput): CleanroomZone {
  const zoneId = requireNonEmptyString(input.zoneId, 'zone.zoneId');
  const name = requireNonEmptyString(input.name, 'zone.name');
  const isoClass = requireInRange(input.isoClass, 'zone.isoClass', 1, 9);
  const ambient = requireNonNegativeNumber(
    input.ambientDefectRatePerCm2,
    'zone.ambientDefectRatePerCm2',
  );
  const machines = (input.machines ?? []).map((id, i) =>
    requireNonEmptyString(id, `zone.machines[${i}]`),
  );
  const temperatureC = requireInRange(input.temperatureC ?? 22, 'zone.temperatureC', 0, 40);
  const relativeHumidityPercent = requireInRange(
    input.relativeHumidityPercent ?? 45,
    'zone.relativeHumidityPercent',
    0,
    100,
  );
  const vibrationScore = requireInRange(input.vibrationScore ?? 5, 'zone.vibrationScore', 0, 100);
  const emiScore = requireInRange(input.emiScore ?? 5, 'zone.emiScore', 0, 100);

  return Object.freeze({
    zoneId,
    name,
    isoClass,
    ambientDefectRatePerCm2: ambient,
    machines,
    temperatureC,
    relativeHumidityPercent,
    vibrationScore,
    emiScore,
  });
}
