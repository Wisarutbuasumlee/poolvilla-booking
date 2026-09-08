import type { Satang } from './types';

/**
 * Integer satang arithmetic.
 *
 * Rounding happens once, at the end of each derived figure, never mid-chain.
 * Rounding every night before summing them produces a total that does not
 * match the sum of the lines shown to the guest, which reads as a broken
 * calculator even when every individual number is defensible.
 */

export const ZERO = 0 as Satang;

/** Baht to satang. baht(12500) === 1_250_000 */
export function baht(amount: number): Satang {
  return Math.round(amount * 100) as Satang;
}

export function toBaht(amount: Satang): number {
  return amount / 100;
}

export function satang(amount: number): Satang {
  if (!Number.isInteger(amount)) {
    throw new TypeError(`Satang must be an integer, got ${amount}`);
  }
  return amount as Satang;
}

export function add(...amounts: Satang[]): Satang {
  let total = 0;
  for (const amount of amounts) total += amount;
  return total as Satang;
}

export function subtract(a: Satang, b: Satang): Satang {
  return (a - b) as Satang;
}

/** Half-up, so 0.5 satang rounds away from zero the way a cashier would. */
export function roundHalfUp(value: number): Satang {
  return Math.sign(value) * Math.round(Math.abs(value)) as Satang;
}

export function multiply(amount: Satang, factor: number): Satang {
  return roundHalfUp(amount * factor);
}

/** A percentage of an amount, optionally capped. */
export function percentOf(amount: Satang, percent: number, cap?: Satang): Satang {
  const raw = roundHalfUp((amount * percent) / 100);
  return cap === undefined ? raw : (Math.min(raw, cap) as Satang);
}

export function clamp(amount: Satang, min: Satang, max: Satang): Satang {
  return Math.min(Math.max(amount, min), max) as Satang;
}

export function max(a: Satang, b: Satang): Satang {
  return Math.max(a, b) as Satang;
}
