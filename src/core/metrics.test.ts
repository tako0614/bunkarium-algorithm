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
    test('基本的な密度計算', () => {
      const result = calculateSupportDensity(100, 1000)
      expect(result).toBeCloseTo(0.1)
    })

    test('露出が0の場合は0を返す', () => {
      const result = calculateSupportDensity(100, 0)
      expect(result).toBe(0)
    })

    test('βが小さいとロングテールに有利', () => {
      const normalBeta = calculateSupportDensity(10, 1000, 1.0)
      const lowBeta = calculateSupportDensity(10, 1000, 0.7)

      expect(lowBeta).toBeGreaterThan(normalBeta)
    })
  })

  describe('calculateSupportRate', () => {
    test('基本的な率計算', () => {
      const result = calculateSupportRate(50, 100)
      expect(result).toBe(0.5)
    })

    test('露出が0の場合は0を返す', () => {
      const result = calculateSupportRate(50, 0)
      expect(result).toBe(0)
    })
  })

  describe('calculateBreadth', () => {
    test('ユニーククラスタ数を返す', () => {
      const clusters = ['c1', 'c2', 'c1', 'c3']
      const result = calculateBreadth(clusters)
      expect(result).toBe(3)
    })

    test('空配列では0を返す', () => {
      const result = calculateBreadth([])
      expect(result).toBe(0)
    })

    test('重複があっても正しくカウント', () => {
      const clusters = ['c1', 'c1', 'c1']
      const result = calculateBreadth(clusters)
      expect(result).toBe(1)
    })
  })

  describe('getBreadthLevel', () => {
    test('低い広がり', () => {
      expect(getBreadthLevel(2)).toBe('low')
    })

    test('中程度の広がり', () => {
      expect(getBreadthLevel(3)).toBe('medium')
      expect(getBreadthLevel(4)).toBe('medium')
    })

    test('高い広がり', () => {
      expect(getBreadthLevel(5)).toBe('high')
      expect(getBreadthLevel(10)).toBe('high')
    })
  })

  describe('calculatePersistence', () => {
    test('基本的な持続計算', () => {
      // 10日間、反応残存率50%
      const result = calculatePersistence(10, 0.5)
      expect(result).toBe(5)
    })

    test('反応残存率0では0', () => {
      const result = calculatePersistence(30, 0)
      expect(result).toBe(0)
    })

    test('反応残存率100%なら日数そのまま', () => {
      const result = calculatePersistence(14, 1.0)
      expect(result).toBe(14)
    })
  })

  describe('getPersistenceLevel', () => {
    test('低い持続', () => {
      expect(getPersistenceLevel(5)).toBe('low')
    })

    test('中程度の持続', () => {
      expect(getPersistenceLevel(7)).toBe('medium')
      expect(getPersistenceLevel(10)).toBe('medium')
    })

    test('高い持続', () => {
      expect(getPersistenceLevel(14)).toBe('high')
      expect(getPersistenceLevel(30)).toBe('high')
    })
  })

  describe('calculatePublicMetrics', () => {
    test('総合メトリクスを計算できる', () => {
      const result = calculatePublicMetrics({
        weightedLikeSum: 50,
        uniqueViews: 1000,
        supporterClusters: ['c1', 'c2', 'c3', 'c1', 'c2'],
        daysSinceFirstReaction: 10,
        recentReactionRate: 0.8
      })

      expect(result.supportDensity).toBeCloseTo(0.05)
      expect(result.supportRate).toBeCloseTo(0.05)
      expect(result.breadth).toBe(3)
      expect(result.breadthLevel).toBe('medium')
      expect(result.persistenceDays).toBe(8)
      expect(result.persistenceLevel).toBe('medium')
    })
  })
})
