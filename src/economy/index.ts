/**
 * Step 3 — the economy layer.
 *
 * Pure TypeScript: no I/O, no framework, deterministic given the same seed.
 * The economy is deliberately decoupled from the factory simulation — the
 * factory produces dies, the economy decides what they are worth.
 */

export * from './enums.ts';
export * from './market.ts';
export * from './client.ts';
export * from './contract.ts';
export * from './financials.ts';
export * from './settlement.ts';
