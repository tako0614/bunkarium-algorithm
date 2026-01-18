import { describe, expect, test } from 'bun:test'
import {
  calculateSupportDensity,
  calculateSupportRate,
  calculateBreadth,
  getBreadthLevel,
  calculatePersistence,
  getPersistenceLevel,
  calculatePublicMetrics
} from './metrics'

describe('metrics', () => {
  describe('calculateSupportDensity', () => {
    test('uses weighted likes over unique views', () => {
      const result = calculateSupportDensity(100, 1000)
      expect(result).toBeCloseTo(0.1)
    })

    test('uses priors when unique views are 0', () => {
      const result = calculateSupportDensity(0, 0)
      expect(result).toBeCloseTo(0.1)
    })

    test('lower beta increases density', () => {
      const normalBeta = calculateSupportDensity(10, 1000, 1.0)
      const lowBeta = calculateSupportDensity(10, 1000, 0.7)

      expect(lowBeta).toBeGreaterThan(normalBeta)
    })

    test('handles negative beta without overflow', () => {
      // Negative beta with small base could cause overflow without guard
      const result = calculateSupportDensity(10, 1, -5)
      expect(Number.isFinite(result)).toBe(true)
    })

    test('handles extreme negative beta safely', () => {
      const result = calculateSupportDensity(10, 0, -10, 1, 1)
      // With base ~1e-10 and beta=-10, Math.pow would overflow to Infinity
      // Guard should return 0
      expect(Number.isFinite(result)).toBe(true)
    })

    test('handles very large beta safely', () => {
      const result = calculateSupportDensity(10, 1000, 10)
      expect(Number.isFinite(result)).toBe(true)
    })
  })

  describe('calculateSupportRate', () => {
    test('supports zero priors', () => {
      const result = calculateSupportRate(50, 100, 0, 0)
      expect(result).toBe(0.5)
    })

    test('returns 0 when denominator is 0', () => {
      const result = calculateSupportRate(50, 0, 0, 0)
      expect(result).toBe(0)
    })
  })

  describe('calculateBreadth', () => {
    test('uses effective cluster count (entropy)', () => {
      const clusterWeights = { c1: 2, c2: 1, c3: 1 }
      const result = calculateBreadth(clusterWeights)
      expect(result).toBeCloseTo(2.828, 3)
    })

    test('empty list returns 0', () => {
      const result = calculateBreadth({})
      expect(result).toBe(0)
    })

    test('single cluster returns 1', () => {
      const clusterWeights = { c1: 3 }
      const result = calculateBreadth(clusterWeights)
      expect(result).toBe(1)
    })

    test('handles exactly 50 clusters without aggregation', () => {
      const clusterWeights: Record<string, number> = {}
      for (let i = 0; i < 50; i++) {
        clusterWeights[`c${i}`] = 1
      }
      const result = calculateBreadth(clusterWeights)
      // With 50 equal clusters, entropy should give exp(H) = 50
      expect(result).toBeCloseTo(50, 0)
    })

    test('aggregates clusters when >50 to top 49 + __other__', () => {
      const clusterWeights: Record<string, number> = {}
      // Create 60 clusters with varying weights
      for (let i = 0; i < 60; i++) {
        clusterWeights[`c${i}`] = 60 - i // c0=60, c1=59, ..., c59=1
      }
      const result = calculateBreadth(clusterWeights)
      // Should still calculate breadth correctly with aggregation
      expect(result).toBeGreaterThan(1)
      expect(Number.isFinite(result)).toBe(true)
    })

    test('handles negative weights by treating them as 0', () => {
      const clusterWeights = { c1: 10, c2: -5, c3: 5 }
      const result = calculateBreadth(clusterWeights)
      // c2 should be ignored (weight <= 0), leaving c1=10, c3=5
      expect(result).toBeGreaterThan(1)
      expect(result).toBeLessThan(3)
    })

    test('handles all zero weights', () => {
      const clusterWeights = { c1: 0, c2: 0, c3: 0 }
      const result = calculateBreadth(clusterWeights)
      expect(result).toBe(0)
    })
  })

  describe('getBreadthLevel', () => {
    test('low breadth', () => {
      expect(getBreadthLevel(2)).toBe('low')
    })

    test('medium breadth', () => {
      expect(getBreadthLevel(3)).toBe('medium')
      expect(getBreadthLevel(4)).toBe('medium')
    })

    test('high breadth', () => {
      expect(getBreadthLevel(5)).toBe('high')
      expect(getBreadthLevel(10)).toBe('high')
    })
  })

  describe('calculatePersistence', () => {
    test('applies half-life saturation', () => {
      const result = calculatePersistence(10, 0.5)
      expect(result).toBeCloseTo(2.73, 2)
    })

    test('zero recent rate returns 0', () => {
      const result = calculatePersistence(30, 0)
      expect(result).toBe(0)
    })

    test('half-life day returns half of half-life when rate is 1', () => {
      const result = calculatePersistence(14, 1.0)
      expect(result).toBeCloseTo(7, 2)
    })
  })

  describe('getPersistenceLevel', () => {
    test('low persistence', () => {
      expect(getPersistenceLevel(5)).toBe('low')
    })

    test('medium persistence', () => {
      expect(getPersistenceLevel(7)).toBe('medium')
      expect(getPersistenceLevel(10)).toBe('medium')
    })

    test('high persistence', () => {
      expect(getPersistenceLevel(14)).toBe('high')
      expect(getPersistenceLevel(30)).toBe('high')
    })

    test('uses halfLifeDays thresholds', () => {
      expect(getPersistenceLevel(8, 10)).toBe('high')
      expect(getPersistenceLevel(5, 10)).toBe('medium')
    })
  })

  describe('calculatePublicMetrics', () => {
    test('computes public metrics correctly', () => {
      const result = calculatePublicMetrics({
        weightedLikeSum: 50,
        weightedViews: 120,
        qualifiedUniqueViewers: 1000,
        uniqueLikers: 50,
        clusterWeights: { c1: 2, c2: 2, c3: 1 },
        daysSinceFirstReaction: 10,
        recentReactionRate: 0.8
      })

      expect(result.supportDensity).toBeCloseTo(0.0505, 4)
      expect(result.supportRate).toBeCloseTo(0.0505, 4)
      expect(result.breadth).toBeCloseTo(2.872, 2)
      expect(result.breadthLevel).toBe('low')
      expect(result.persistenceDays).toBeCloseTo(4.37, 2)
      expect(result.persistenceLevel).toBe('low')
      expect(result.culturalViewValue).toBe(120)
      expect(result.topClusterShare).toBeCloseTo(0.4, 2)
    })

    test('params parameter overrides defaults', () => {
      const input = {
        weightedLikeSum: 50,
        weightedViews: 120,
        qualifiedUniqueViewers: 1000,
        uniqueLikers: 50,
        clusterWeights: { c1: 2, c2: 2, c3: 1 },
        daysSinceFirstReaction: 10,
        recentReactionRate: 0.8
      }

      const resultDefault = calculatePublicMetrics(input)
      const resultCustom = calculatePublicMetrics(input, {
        beta: 0.7,
        priorViews: 20,
        halfLifeDays: 10
      })

      // With lower beta, support density should be higher
      expect(resultCustom.supportDensity).toBeGreaterThan(resultDefault.supportDensity)

      // Different halfLifeDays should affect persistence
      expect(resultCustom.persistenceDays).not.toBeCloseTo(resultDefault.persistenceDays)
    })

    test('params parameter works with undefined (uses defaults)', () => {
      const input = {
        weightedLikeSum: 50,
        weightedViews: 120,
        qualifiedUniqueViewers: 1000,
        uniqueLikers: 50,
        clusterWeights: { c1: 2, c2: 2, c3: 1 },
        daysSinceFirstReaction: 10,
        recentReactionRate: 0.8
      }

      const result1 = calculatePublicMetrics(input)
      const result2 = calculatePublicMetrics(input, undefined)

      expect(result1.supportDensity).toBeCloseTo(result2.supportDensity)
      expect(result1.breadth).toBeCloseTo(result2.breadth)
    })
  })
})
