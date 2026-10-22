/**
 * Defensive validation primitives shared by every domain factory.
 *
 * Design: factories never trust caller input. Each `create*` function runs its
 * fields through these helpers, which throw a descriptive `ValidationError`
 * naming the offending field. This gives us cheap, uniform runtime guards on
 * top of the compile-time types (useful when data later loads from JSON/save
 * files, which are `any` at the boundary).
 */

export class ValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) {
    super(`[ValidationError] ${field}: ${message}`);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/** Trimmed, non-empty string check. Returns the trimmed value. */
export function requireNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(field, `expected a string, got ${typeof value}`);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(field, 'must be a non-empty string');
  }
  return trimmed;
}

/** A finite number strictly greater than zero. */
export function requirePositiveNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(field, `expected a finite number, got ${String(value)}`);
  }
  if (value <= 0) {
    throw new ValidationError(field, `must be > 0, got ${value}`);
  }
  return value;
}

/** A finite number >= 0 (zero allowed, e.g. a defect rate of exactly 0). */
export function requireNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(field, `expected a finite number, got ${String(value)}`);
  }
  if (value < 0) {
    throw new ValidationError(field, `must be >= 0, got ${value}`);
  }
  return value;
}

/** A finite integer >= 0. */
export function requireNonNegativeInteger(value: unknown, field: string): number {
  const n = requireNonNegativeNumber(value, field);
  if (!Number.isInteger(n)) {
    throw new ValidationError(field, `expected an integer, got ${n}`);
  }
  return n;
}

/** A finite number within [min, max] inclusive. */
export function requireInRange(value: unknown, field: string, min: number, max: number): number {
  const n = requireNonNegativeNumber(value, field);
  if (n < min || n > max) {
    throw new ValidationError(field, `must be within [${min}, ${max}], got ${n}`);
  }
  return n;
}

/** A value that must be one of the allowed members of a const-object enum. */
export function requireOneOf<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(
      field,
      `expected one of [${allowed.join(', ')}], got ${String(value)}`,
    );
  }
  return value as T;
}

/** A plain, non-null, non-array object. */
export function requirePlainObject(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(field, `expected an object, got ${Array.isArray(value) ? 'array' : typeof value}`);
  }
  return value as Record<string, unknown>;
}

/** A non-empty array. Returns the array typed as T[]. */
export function requireNonEmptyArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(field, `expected an array, got ${typeof value}`);
  }
  if (value.length === 0) {
    throw new ValidationError(field, 'must contain at least one element');
  }
  return value as T[];
}

/** Shallow-freeze an object so domain entities are immutable after creation. */
export function shallowFreeze<T extends object>(obj: T): Readonly<T> {
  return Object.freeze(obj);
}

/** Deep-freeze an object graph (arrays included) so it is fully immutable. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
  }
  return value;
}
