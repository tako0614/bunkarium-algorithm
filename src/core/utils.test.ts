import { describe, expect, test } from 'bun:test'
import {
  cosineSimilarity,
  euclideanDistance,
  euclideanToSimilarity,
  l2Norm,
  normalizeVector,
  dotProduct,
  determinant,
  computeSymmetricSimilarityMatrix,
  calculateEntropy,
  calculateGini,
  exponentialDecay,
  msToDays,
  msToHours,
  clamp,
  clamp01,
  round6,
  round9,
  ensureNonNegative,
  validateNonNegativeValues,
  generateId
} from './utils'

describe('cosineSimilarity', () => {
  test('returns 1 for identical vectors', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 10)
  })

  test('returns -1 for opposite vectors', () => {
    const a = [1, 0, 0]
    const b = [-1, 0, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 10)
  })

  test('returns 0 for orthogonal vectors', () => {
    const a = [1, 0, 0]
    const b = [0, 1, 0]
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 10)
  })

  test('returns 0 for empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0)
  })

  test('returns 0 for mismatched lengths', () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0)
  })

  test('returns 0 for null/undefined input', () => {
    expect(cosineSimilarity(null as unknown as number[], [1, 2])).toBe(0)
    expect(cosineSimilarity([1, 2], undefined as unknown as number[])).toBe(0)
  })

  test('handles zero vector', () => {
    const zero = [0, 0, 0]
    const v = [1, 2, 3]
    expect(cosineSimilarity(zero, v)).toBe(0)
  })
})

describe('euclideanDistance', () => {
  test('returns 0 for identical vectors', () => {
    const v = [1, 2, 3]
    expect(euclideanDistance(v, v)).toBe(0)
  })

  test('calculates correct distance', () => {
    const a = [0, 0]
    const b = [3, 4]
    expect(euclideanDistance(a, b)).toBe(5) // 3-4-5 triangle
  })

  test('returns Infinity for empty vectors', () => {
    expect(euclideanDistance([], [])).toBe(Infinity)
  })

  test('returns Infinity for mismatched lengths', () => {
    expect(euclideanDistance([1, 2], [1, 2, 3])).toBe(Infinity)
  })
})

describe('euclideanToSimilarity', () => {
  test('returns 1 for distance 0', () => {
    expect(euclideanToSimilarity(0)).toBe(1)
  })

  test('returns 0.5 for distance 1', () => {
    expect(euclideanToSimilarity(1)).toBe(0.5)
  })

  test('approaches 0 for large distance', () => {
    expect(euclideanToSimilarity(1000)).toBeLessThan(0.01)
  })

  test('handles negative distance (treated as 0)', () => {
    // Guard: negative distances should be treated as 0 (same point)
    expect(euclideanToSimilarity(-1)).toBe(1)
    expect(euclideanToSimilarity(-100)).toBe(1)
  })
})

describe('l2Norm', () => {
  test('returns correct norm for unit vectors', () => {
    expect(l2Norm([1, 0, 0])).toBe(1)
  })

  test('returns correct norm for 3-4-5 triangle', () => {
    expect(l2Norm([3, 4])).toBe(5)
  })

  test('returns 0 for empty vector', () => {
    expect(l2Norm([])).toBe(0)
  })

  test('returns 0 for null', () => {
    expect(l2Norm(null as unknown as number[])).toBe(0)
  })
})

describe('normalizeVector', () => {
  test('normalizes non-zero vector', () => {
    const result = normalizeVector([3, 4])
    expect(l2Norm(result)).toBeCloseTo(1.0, 10)
    expect(result[0]).toBeCloseTo(0.6, 10)
    expect(result[1]).toBeCloseTo(0.8, 10)
  })

  test('returns zeros for zero vector', () => {
    const result = normalizeVector([0, 0, 0])
    expect(result).toEqual([0, 0, 0])
  })
})

describe('dotProduct', () => {
  test('calculates correct dot product', () => {
    expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32) // 1*4 + 2*5 + 3*6
  })

  test('returns 0 for orthogonal vectors', () => {
    expect(dotProduct([1, 0], [0, 1])).toBe(0)
  })

  test('returns 0 for mismatched lengths', () => {
    expect(dotProduct([1, 2], [1, 2, 3])).toBe(0)
  })
})

describe('determinant', () => {
  test('returns value for 1x1 matrix', () => {
    expect(determinant([[5]])).toBeCloseTo(5, 5)
  })

  test('returns correct value for 2x2 matrix', () => {
    // det([[1, 2], [3, 4]]) = 1*4 - 2*3 = -2
    // Note: regularization term affects result slightly
    expect(determinant([[1, 2], [3, 4]])).toBeCloseTo(-2, 4)
  })

  test('returns correct value for 3x3 identity matrix', () => {
    const identity = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1]
    ]
    expect(determinant(identity)).toBeCloseTo(1, 5)
  })

  test('returns near-zero for singular matrix', () => {
    const singular = [
      [1, 2],
      [2, 4]
    ]
    // Due to regularization, result is near-zero but not exactly zero
    expect(Math.abs(determinant(singular))).toBeLessThan(0.0001)
  })

  test('returns 1 for empty matrix', () => {
    expect(determinant([])).toBe(1)
  })
})

describe('computeSymmetricSimilarityMatrix', () => {
  test('creates symmetric matrix', () => {
    const items = [1, 2, 3]
    const matrix = computeSymmetricSimilarityMatrix(items, (a, b) => a * b)

    // Check symmetry
    for (let i = 0; i < items.length; i++) {
      for (let j = 0; j < items.length; j++) {
        expect(matrix[i][j]).toBe(matrix[j][i])
      }
    }
  })

  test('diagonal is always 1', () => {
    const items = [1, 2, 3]
    const matrix = computeSymmetricSimilarityMatrix(items, (a, b) => a * b)

    for (let i = 0; i < items.length; i++) {
      expect(matrix[i][i]).toBe(1.0)
    }
  })
})

describe('calculateEntropy', () => {
  test('returns 0 for single element', () => {
    expect(calculateEntropy([100])).toBe(0)
  })

  test('returns max entropy for uniform distribution', () => {
    const uniform = [1, 1, 1, 1]
    expect(calculateEntropy(uniform)).toBeCloseTo(2.0, 5) // log2(4) = 2
  })

  test('returns 0 for empty distribution', () => {
    expect(calculateEntropy([])).toBe(0)
  })

  test('returns 0 for all zeros', () => {
    expect(calculateEntropy([0, 0, 0])).toBe(0)
  })

  test('normalized entropy returns 1 for uniform', () => {
    const uniform = [1, 1, 1, 1]
    expect(calculateEntropy(uniform, true)).toBeCloseTo(1.0, 5)
  })
})

describe('calculateGini', () => {
  test('returns 0 for perfect equality', () => {
    expect(calculateGini([1, 1, 1, 1])).toBeCloseTo(0, 5)
  })

  test('returns high value for inequality', () => {
    const gini = calculateGini([0, 0, 0, 100])
    expect(gini).toBeGreaterThan(0.5)
  })

  test('returns 0 for single value', () => {
    expect(calculateGini([100])).toBe(0)
  })

  test('returns 0 for empty array', () => {
    expect(calculateGini([])).toBe(0)
  })

  test('handles negative values by treating as 0', () => {
    const result = calculateGini([-1, 1, 2, 3])
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })
})

describe('exponentialDecay', () => {
  test('returns 1 at age 0', () => {
    expect(exponentialDecay(0, 1000)).toBe(1)
  })

  test('returns 0.5 at half-life', () => {
    expect(exponentialDecay(1000, 1000)).toBeCloseTo(0.5, 10)
  })

  test('returns 0.25 at two half-lives', () => {
    expect(exponentialDecay(2000, 1000)).toBeCloseTo(0.25, 10)
  })

  test('returns 1 for non-positive half-life', () => {
    expect(exponentialDecay(1000, 0)).toBe(1)
    expect(exponentialDecay(1000, -1)).toBe(1)
  })
})

describe('msToDays', () => {
  test('converts correctly', () => {
    const oneDay = 24 * 60 * 60 * 1000
    expect(msToDays(oneDay)).toBe(1)
    expect(msToDays(oneDay * 7)).toBe(7)
  })
})

describe('msToHours', () => {
  test('converts correctly', () => {
    const oneHour = 60 * 60 * 1000
    expect(msToHours(oneHour)).toBe(1)
    expect(msToHours(oneHour * 24)).toBe(24)
  })
})

describe('clamp', () => {
  test('clamps value within range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
  })

  test('handles edge cases', () => {
    expect(clamp(0, 0, 10)).toBe(0)
    expect(clamp(10, 0, 10)).toBe(10)
  })
})

describe('clamp01', () => {
  test('clamps value to [0, 1] range', () => {
    expect(clamp01(0.5)).toBe(0.5)
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0)).toBe(0)
    expect(clamp01(1)).toBe(1)
  })
})

describe('round6', () => {
  test('rounds to 6 decimal places', () => {
    expect(round6(0.1234567890)).toBe(0.123457)
    expect(round6(1.0)).toBe(1)
    expect(round6(0)).toBe(0)
  })

  test('preserves precision up to 6 decimals', () => {
    expect(round6(0.123456)).toBe(0.123456)
  })
})

describe('round9', () => {
  test('rounds to 9 decimal places', () => {
    expect(round9(0.1234567890123)).toBeCloseTo(0.123456789, 9)
    expect(round9(1.0)).toBe(1)
    expect(round9(0)).toBe(0)
  })

  test('preserves precision up to 9 decimals', () => {
    const value = 0.123456789
    expect(round9(value)).toBe(value)
  })
})

describe('ensureNonNegative', () => {
  test('returns value if non-negative', () => {
    expect(ensureNonNegative(5)).toBe(5)
    expect(ensureNonNegative(0)).toBe(0)
  })

  test('returns default for negative', () => {
    expect(ensureNonNegative(-5)).toBe(0)
    expect(ensureNonNegative(-5, 10)).toBe(10)
  })
})

describe('validateNonNegativeValues', () => {
  test('does not throw for valid values', () => {
    expect(() => validateNonNegativeValues({ a: 1, b: 0, c: 100 })).not.toThrow()
  })

  test('throws for negative values', () => {
    expect(() => validateNonNegativeValues({ a: 1, b: -1 })).toThrow()
  })
})

describe('generateId', () => {
  test('generates unique IDs', () => {
    const id1 = generateId()
    const id2 = generateId()
    expect(id1).not.toBe(id2)
  })

  test('includes prefix if provided', () => {
    const id = generateId('test')
    expect(id.startsWith('test_')).toBe(true)
  })

  test('generates non-empty string', () => {
    expect(generateId().length).toBeGreaterThan(0)
  })
})
