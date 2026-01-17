import { describe, expect, test } from 'bun:test'
import {
  calculateLikeWeight,
  predictNextLikeWeight,
  calculateWeightedLikeSignal
} from './like-decay'
import { getCRMultiplier } from './reputation'

describe('like-decay', () => {
  describe('calculateLikeWeight', () => {
    test('first like has weight 1.0', () => {
      const result = calculateLikeWeight({ likeWindowCount: 1 })
      expect(result.weight).toBe(1.0)
      expect(result.supportPowerPercent).toBe(100)
    })

    test('weight decreases as like count increases', () => {
      const result1 = calculateLikeWeight({ likeWindowCount: 1 })
      const result10 = calculateLikeWeight({ likeWindowCount: 10 })
      const result50 = calculateLikeWeight({ likeWindowCount: 50 })

      expect(result1.weight).toBeGreaterThan(result10.weight)
      expect(result10.weight).toBeGreaterThan(result50.weight)
    })

    test('higher alpha reduces weight faster', () => {
      const lowAlpha = calculateLikeWeight({ likeWindowCount: 10, alpha: 0.01 })
      const highAlpha = calculateLikeWeight({ likeWindowCount: 10, alpha: 0.1 })

      expect(lowAlpha.weight).toBeGreaterThan(highAlpha.weight)
    })

    test('weight is always positive', () => {
      const result = calculateLikeWeight({ likeWindowCount: 1000 })
      expect(result.weight).toBeGreaterThan(0)
    })

    test('rapid activity applies penalty', () => {
      const normal = calculateLikeWeight({
        likeWindowCount: 10,
        recentLikeCount30s: 10
      })
      const rapid = calculateLikeWeight({
        likeWindowCount: 10,
        recentLikeCount30s: 50,
        rapidPenaltyThreshold: 50,
        rapidPenaltyMultiplier: 0.1
      })

      expect(rapid.weight).toBeLessThan(normal.weight)
      expect(rapid.isRapid).toBe(true)
      expect(rapid.rapidPenaltyApplied).toBe(true)
    })

    test('non-rapid activity does not apply penalty', () => {
      const result = calculateLikeWeight({
        likeWindowCount: 10,
        recentLikeCount30s: 10,
        rapidPenaltyThreshold: 50,
        rapidPenaltyMultiplier: 0.1
      })
      expect(result.isRapid).toBe(false)
      expect(result.rapidPenaltyApplied).toBe(false)
    })

    test('opts parameter overrides input values', () => {
      const result = calculateLikeWeight(
        {
          likeWindowCount: 10,
          alpha: 0.05,
          recentLikeCount30s: 60,
          rapidPenaltyThreshold: 50,
          rapidPenaltyMultiplier: 0.5
        },
        {
          alpha: 0.1,
          rapidPenaltyThreshold: 100,
          rapidPenaltyMultiplier: 0.2
        }
      )

      // Should use opts values, not input values
      // With higher alpha (0.1), weight should be lower
      const resultWithInputAlpha = calculateLikeWeight({ likeWindowCount: 10, alpha: 0.05 })
      expect(result.weight).toBeLessThan(resultWithInputAlpha.weight)

      // Should not be rapid since threshold is now 100, not 50
      expect(result.isRapid).toBe(false)
    })

    test('opts parameter works with empty input options', () => {
      const result = calculateLikeWeight(
        { likeWindowCount: 10 },
        { alpha: 0.2 }
      )

      const resultWithHigherAlpha = calculateLikeWeight({ likeWindowCount: 10, alpha: 0.2 })
      expect(result.weight).toBeCloseTo(resultWithHigherAlpha.weight)
    })
  })

  describe('predictNextLikeWeight', () => {
    test('next like weight is lower than current', () => {
      const current = calculateLikeWeight({ likeWindowCount: 10 })
      const next = predictNextLikeWeight(10)

      expect(next.weight).toBeLessThan(current.weight)
    })
  })

  describe('calculateWeightedLikeSignal', () => {
    test('sums weighted likes with CR', () => {
      const likes = [
        { weight: 1.0, curatorReputation: 1.0, ageHours: 0 },
        { weight: 0.8, curatorReputation: 1.5, ageHours: 0 },
        { weight: 0.5, curatorReputation: 2.0, ageHours: 0 }
      ]

      const result = calculateWeightedLikeSignal(likes)
      const expected = likes.reduce(
        (sum, like) => sum + like.weight * getCRMultiplier(like.curatorReputation),
        0
      )
      expect(result).toBeCloseTo(expected)
    })

    test('empty list returns zero', () => {
      const result = calculateWeightedLikeSignal([])
      expect(result).toBe(0)
    })

    test('older likes decay over time', () => {
      const recent = [{ weight: 1.0, curatorReputation: 1.0, ageHours: 0 }]
      const old = [{ weight: 1.0, curatorReputation: 1.0, ageHours: 168 }]

      const recentResult = calculateWeightedLikeSignal(recent)
      const oldResult = calculateWeightedLikeSignal(old)

      expect(recentResult).toBeGreaterThan(oldResult)
      expect(oldResult).toBeCloseTo(recentResult * 0.5, 1)
    })
  })
})
