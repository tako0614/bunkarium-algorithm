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
        qualifiedUniqueViews: 1000,
        clusterWeights: { c1: 2, c2: 2, c3: 1 },
        daysSinceFirstReaction: 10,
        recentReactionRate: 0.8
      })

      expect(result.supportDensity).toBeCloseTo(0.0505, 4)
      expect(result.supportRate).toBeCloseTo(0.0505, 4)
      expect(result.breadth).toBeCloseTo(2.871, 3)
      expect(result.breadthLevel).toBe('medium')
      expect(result.persistenceDays).toBeCloseTo(4.37, 2)
      expect(result.persistenceLevel).toBe('low')
      expect(result.culturalViewValue).toBe(120)
      expect(result.topClusterShare).toBeCloseTo(0.4, 2)
    })
  })
})
