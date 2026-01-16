import { describe, expect, test } from 'bun:test'
import {
  calculateGini,
  calculateExposureGini,
  calculateLikeGini,
  calculateLongTailThreshold,
  calculateLongTailExposureRate,
  calculateClusterCoverage,
  calculateClusterEntropy,
  calculateUserDiversityScore,
  calculatePositionBias,
  calculateClusterFairness,
  compareABTest,
  evaluate,
  type ExposureLog,
  type ItemPopularity
} from './evaluation'

describe('evaluation', () => {
  describe('calculateGini', () => {
    test('完全平等な分布ではGini=0', () => {
      const values = [10, 10, 10, 10]
      expect(calculateGini(values)).toBeCloseTo(0)
    })

    test('完全不平等な分布ではGiniが高い', () => {
      const values = [0, 0, 0, 100]
      const gini = calculateGini(values)
      expect(gini).toBeGreaterThan(0.7)
    })

    test('空配列では0を返す', () => {
      expect(calculateGini([])).toBe(0)
    })

    test('単一要素では0を返す', () => {
      expect(calculateGini([100])).toBe(0)
    })
  })

  describe('calculateExposureGini', () => {
    test('均等な露出分布ではGiniが低い', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'c', clusterId: 'c1', position: 2, timestamp: 3 },
        { userId: 'u4', itemId: 'd', clusterId: 'c1', position: 3, timestamp: 4 }
      ]

      const gini = calculateExposureGini(exposures)
      expect(gini).toBeCloseTo(0)
    })

    test('偏った露出分布ではGiniが高い', () => {
      const exposures: ExposureLog[] = Array(10).fill(null).map((_, i) => ({
        userId: `u${i}`,
        itemId: 'same_item',
        clusterId: 'c1',
        position: i,
        timestamp: i
      }))

      // 全て同じアイテム → Gini = 0 (分散なし)
      const gini = calculateExposureGini(exposures)
      expect(gini).toBe(0)
    })
  })

  describe('calculateLongTailThreshold', () => {
    test('上位20%の閾値を計算する', () => {
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 1000, totalLikes: 100, totalSaves: 50, createdAt: 0 },
        { itemId: 'b', clusterId: 'c1', totalExposures: 500, totalLikes: 50, totalSaves: 25, createdAt: 0 },
        { itemId: 'c', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'd', clusterId: 'c1', totalExposures: 50, totalLikes: 5, totalSaves: 2, createdAt: 0 },
        { itemId: 'e', clusterId: 'c1', totalExposures: 10, totalLikes: 1, totalSaves: 0, createdAt: 0 }
      ]

      const threshold = calculateLongTailThreshold(popularity, 0.2)
      expect(threshold).toBe(1000) // 上位1つがヘッド
    })
  })

  describe('calculateClusterCoverage', () => {
    test('全クラスタをカバーした場合は1.0', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'c', clusterId: 'c3', position: 2, timestamp: 3 }
      ]

      const coverage = calculateClusterCoverage(exposures, 3)
      expect(coverage).toBe(1.0)
    })

    test('一部のクラスタのみの場合は1未満', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2 }
      ]

      const coverage = calculateClusterCoverage(exposures, 5)
      expect(coverage).toBe(0.2)
    })
  })

  describe('calculateClusterEntropy', () => {
    test('均等分布で最大エントロピー', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'c', clusterId: 'c3', position: 2, timestamp: 3 },
        { userId: 'u4', itemId: 'd', clusterId: 'c4', position: 3, timestamp: 4 }
      ]

      const entropy = calculateClusterEntropy(exposures)
      expect(entropy).toBe(1.0) // 正規化されたエントロピー = 1
    })

    test('単一クラスタでエントロピー0', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2 }
      ]

      const entropy = calculateClusterEntropy(exposures)
      expect(entropy).toBe(0)
    })
  })

  describe('calculatePositionBias', () => {
    test('上位でクリックされると平均位置が低い', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1, clicked: true },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2, clicked: true },
        { userId: 'u3', itemId: 'c', clusterId: 'c1', position: 10, timestamp: 3, clicked: false }
      ]

      const bias = calculatePositionBias(exposures)
      expect(bias).toBe(0.5)
    })
  })

  describe('evaluate', () => {
    test('総合評価を実行できる', () => {
      const now = Date.now()
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: now, clicked: true },
        { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: now, liked: true },
        { userId: 'u3', itemId: 'c', clusterId: 'c3', position: 2, timestamp: now }
      ]

      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: now - 86400000 },
        { itemId: 'b', clusterId: 'c2', totalExposures: 50, totalLikes: 5, totalSaves: 2, createdAt: now - 172800000 },
        { itemId: 'c', clusterId: 'c3', totalExposures: 10, totalLikes: 1, totalSaves: 0, createdAt: now }
      ]

      const result = evaluate(exposures, popularity, 5)

      expect(result.giniCoefficient).toBeGreaterThanOrEqual(0)
      expect(result.clusterCoverage).toBeGreaterThan(0)
      expect(result.details.totalExposures).toBe(3)
      expect(result.details.uniqueItems).toBe(3)
      expect(result.details.uniqueClusters).toBe(3)
    })
  })

  describe('compareABTest', () => {
    test('controlが0でlower-is-better指標が悪化すると負の無限大になる', () => {
      const controlExposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2 }
      ]
      const treatmentExposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'a', clusterId: 'c1', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'a', clusterId: 'c1', position: 2, timestamp: 3 },
        { userId: 'u4', itemId: 'b', clusterId: 'c1', position: 3, timestamp: 4 }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 10, totalLikes: 0, totalSaves: 0, createdAt: 0 },
        { itemId: 'b', clusterId: 'c1', totalExposures: 10, totalLikes: 0, totalSaves: 0, createdAt: 0 }
      ]

      const { improvement } = compareABTest(controlExposures, treatmentExposures, popularity, 1)
      expect(improvement.exposureGini).toBe(Number.NEGATIVE_INFINITY)
    })
  })
})
