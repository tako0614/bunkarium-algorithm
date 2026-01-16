import { describe, expect, test } from 'bun:test'
import {
  calculateLikeWeight,
  calculateLikeWeightWithRapidPenalty,
  predictNextLikeWeight,
  calculateWeightedLikeSignal
} from './like-decay'

describe('like-decay', () => {
  describe('calculateLikeWeight', () => {
    test('first like has weight 1.0', () => {
      const result = calculateLikeWeight(1)
      expect(result.weight).toBe(1.0)
      expect(result.supportPowerPercent).toBe(100)
    })

    test('weight decreases as like count increases', () => {
      const result1 = calculateLikeWeight(1)
      const result10 = calculateLikeWeight(10)
      const result50 = calculateLikeWeight(50)

      expect(result1.weight).toBeGreaterThan(result10.weight)
      expect(result10.weight).toBeGreaterThan(result50.weight)
    })

    test('higher alpha reduces weight faster', () => {
      const lowAlpha = calculateLikeWeight(10, 0.01)
      const highAlpha = calculateLikeWeight(10, 0.1)

      expect(lowAlpha.weight).toBeGreaterThan(highAlpha.weight)
    })

    test('weight is always positive', () => {
      const result = calculateLikeWeight(1000)
      expect(result.weight).toBeGreaterThan(0)
    })
  })

  describe('calculateLikeWeightWithRapidPenalty', () => {
    test('rapid activity applies penalty', () => {
      const normal = calculateLikeWeight(10)
      const rapid = calculateLikeWeightWithRapidPenalty(10, 50, 0.05, 50, 0.1)

      expect(rapid.weight).toBeLessThan(normal.weight)
      expect(rapid.isRapid).toBe(true)
    })

    test('non-rapid activity does not apply penalty', () => {
      const result = calculateLikeWeightWithRapidPenalty(10, 10, 0.05, 50, 0.1)
      expect(result.isRapid).toBe(false)
    })
  })

  describe('predictNextLikeWeight', () => {
    test('next like weight is lower than current', () => {
      const current = calculateLikeWeight(10)
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
      expect(result).toBeCloseTo(1.0 * 1.0 + 0.8 * 1.5 + 0.5 * 2.0)
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