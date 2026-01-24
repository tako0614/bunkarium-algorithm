/**
 * Numeric Utilities Module
 * Shared numeric safety functions for the algorithm package
 *
 * This module provides safe numeric operations that handle edge cases
 * like NaN, Infinity, undefined, and overflow protection.
 */

/**
 * Apply soft cap with logarithmic scaling.
 * Values below cap are unchanged, values above grow logarithmically.
 * This prevents extreme inflation while keeping unbounded design.
 *
 * Formula: cap + ln(1 + (value - cap))
 * - At value = cap: returns cap + ln(1) = cap
 * - At value = cap + 1: returns cap + ln(2) ≈ cap + 0.69
 * - At value = cap + e-1: returns cap + 1
 *
 * @param value - The value to apply soft cap to
 * @param cap - The soft cap threshold (must be positive)
 * @returns The soft-capped value, or 0 if inputs are invalid
 *
 * @example
 * applySoftCap(5, 10)   // returns 5 (below cap, unchanged)
 * applySoftCap(15, 10)  // returns ~11.79 (cap + ln(1 + 5))
 * applySoftCap(100, 10) // returns ~14.50 (cap + ln(91))
 */
export function applySoftCap(value: number, cap: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(cap)) return 0;
  if (cap <= 0) return Math.max(0, value); // Invalid cap, return clamped value
  if (value <= cap) return value;
  // Logarithmic scaling above cap: cap + ln(1 + (value - cap))
  // The excess (value - cap) is guaranteed positive here
  const excess = value - cap;
  // Guard against numerical issues with very large excess values
  // ln(1 + x) ≈ ln(x) for large x, so cap result at reasonable maximum
  if (excess > 1e100) return cap + 230; // ln(1e100) ≈ 230
  return cap + Math.log(1 + excess);
}

/**
 * Safe division with fallback for division by zero or invalid inputs.
 * Handles NaN, Infinity, undefined, and zero divisor.
 *
 * @param a - The dividend
 * @param b - The divisor
 * @param fallback - Value to return when division is not possible (default: 0)
 * @returns The result of a/b, or fallback if inputs are invalid or b is 0
 *
 * @example
 * safeDiv(10, 2)      // returns 5
 * safeDiv(10, 0)      // returns 0 (default fallback)
 * safeDiv(10, 0, -1)  // returns -1 (custom fallback)
 * safeDiv(NaN, 5)     // returns 0 (invalid input)
 */
export function safeDiv(a: number, b: number, fallback: number = 0): number {
  // Validate fallback is a valid number
  const safeFallback = Number.isFinite(fallback) ? fallback : 0;

  // Check for invalid inputs
  if (!Number.isFinite(a) || !Number.isFinite(b)) return safeFallback;

  // Check for division by zero
  if (b === 0) return safeFallback;

  const result = a / b;

  // Check for invalid result (shouldn't happen with finite inputs, but guard anyway)
  if (!Number.isFinite(result)) return safeFallback;

  return result;
}

/**
 * Clamp a value to a specified range [min, max].
 * Handles NaN and Infinity by returning the nearest bound or min.
 *
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value within [min, max]
 *
 * @example
 * clamp(5, 0, 10)    // returns 5 (within range)
 * clamp(-5, 0, 10)   // returns 0 (below min)
 * clamp(15, 0, 10)   // returns 10 (above max)
 * clamp(NaN, 0, 10)  // returns 0 (min as fallback)
 */
export function clamp(value: number, min: number, max: number): number {
  // Ensure min and max are valid, swap if reversed
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) ? max : safeMin;
  const [effectiveMin, effectiveMax] = safeMin <= safeMax ? [safeMin, safeMax] : [safeMax, safeMin];

  // Handle invalid value - return min as default
  if (!Number.isFinite(value)) return effectiveMin;

  return Math.max(effectiveMin, Math.min(effectiveMax, value));
}

/**
 * Round a number to 6 decimal places for consistent precision.
 * Prevents floating-point precision issues in comparisons and storage.
 *
 * @param n - The number to round
 * @returns The number rounded to 6 decimal places, or 0 if invalid
 *
 * @example
 * round6(3.14159265359)  // returns 3.141593
 * round6(0.1 + 0.2)      // returns 0.3 (not 0.30000000000000004)
 * round6(NaN)            // returns 0
 */
export function round6(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1e6) / 1e6;
}

/**
 * Type guard to check if a value is a valid finite number.
 * Rejects NaN, Infinity, -Infinity, undefined, null, and non-number types.
 *
 * @param n - The value to check
 * @returns True if n is a valid finite number, false otherwise
 *
 * @example
 * isValidNumber(5)         // returns true
 * isValidNumber(3.14)      // returns true
 * isValidNumber(NaN)       // returns false
 * isValidNumber(Infinity)  // returns false
 * isValidNumber(undefined) // returns false
 * isValidNumber("5")       // returns false
 */
export function isValidNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Safe multiplication with overflow protection.
 * Prevents results that exceed JavaScript's safe integer range or maxResult.
 *
 * @param a - First multiplicand
 * @param b - Second multiplicand
 * @param maxResult - Maximum allowed result (default: Number.MAX_SAFE_INTEGER)
 * @returns The product a*b clamped to maxResult, or 0 if inputs are invalid
 *
 * @example
 * safeMult(5, 3)                    // returns 15
 * safeMult(1e10, 1e10)              // returns Number.MAX_SAFE_INTEGER (overflow protection)
 * safeMult(1000, 1000, 100000)      // returns 100000 (custom maxResult)
 * safeMult(NaN, 5)                  // returns 0 (invalid input)
 */
export function safeMult(a: number, b: number, maxResult: number = Number.MAX_SAFE_INTEGER): number {
  // Validate inputs
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;

  // Validate maxResult
  const safeMaxResult = Number.isFinite(maxResult) && maxResult > 0 ? maxResult : Number.MAX_SAFE_INTEGER;

  const result = a * b;

  // Check for overflow or invalid result
  if (!Number.isFinite(result)) return safeMaxResult;

  // Clamp to maxResult
  return Math.min(safeMaxResult, Math.max(-safeMaxResult, result));
}
