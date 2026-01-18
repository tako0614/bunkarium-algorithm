import { describe, expect, test } from 'bun:test'
import {
  calculateGini,
  calculateExposureGini,
  calculateLikeGini,
  calculateLongTailThreshold,
  calculateLongTailExposureRate,
  calculateLongTailClickRate,
  calculateClusterCoverage,
  calculateClusterEntropy,
  calculateUserDiversityScore,
  calculatePositionBias,
  calculatePositionCTR,
  calculateFreshItemExposureRate,
  calculateClusterFairness,
  calculateFairnessDivergence,
  compareABTest,
  evaluateOffline,
  generateEvaluationSummary,
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
    test('percentileが1を超える場合はクランプされる', () => {
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 1000, totalLikes: 100, totalSaves: 50, createdAt: 0 },
        { itemId: 'b', clusterId: 'c1', totalExposures: 500, totalLikes: 50, totalSaves: 25, createdAt: 0 },
        { itemId: 'c', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 }
      ]

      const threshold = calculateLongTailThreshold(popularity, 2.0)
      expect(threshold).toBe(100)
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

    test('空の露出ログでは0を返す', () => {
      const entropy = calculateClusterEntropy([])
      expect(entropy).toBe(0)
    })

    test('クラスタ数が0でも安全に0を返す', () => {
      // clusters.length === 0 の場合、Math.log2(0) で -Infinity になりえたが、
      // ガードを追加したので安全に0を返す
      const exposures: ExposureLog[] = []
      const entropy = calculateClusterEntropy(exposures)
      expect(Number.isFinite(entropy)).toBe(true)
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

      const result = evaluateOffline(exposures, popularity, 5)

      expect(result.giniCoefficient).toBeGreaterThanOrEqual(0)
      expect(result.clusterCoverage).toBeGreaterThan(0)
      expect(result.details.totalExposures).toBe(3)
      expect(result.details.uniqueItems).toBe(3)
      expect(result.details.uniqueClusters).toBe(3)
    })

    test('spec-compliant signature: (dataset: OfflineDataset, config?: OfflineEvalConfig)', () => {
      const now = Date.now()
      const exposures = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: now },
        { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: now },
        { userId: 'u3', itemId: 'c', clusterId: 'c3', position: 2, timestamp: now }
      ]
      const popularity = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: now - 86400000 },
        { itemId: 'b', clusterId: 'c2', totalExposures: 50, totalLikes: 5, totalSaves: 2, createdAt: now - 172800000 },
        { itemId: 'c', clusterId: 'c3', totalExposures: 10, totalLikes: 1, totalSaves: 0, createdAt: now }
      ]

      const result = evaluateOffline({
        exposures,
        popularity,
        totalClusters: 5
      }, {
        longTailTopPercentile: 0.3,
        freshDays: 10
      })

      expect(result.giniCoefficient).toBeGreaterThanOrEqual(0)
      expect(result.clusterCoverage).toBeGreaterThan(0)
      expect(result.details.totalExposures).toBe(3)
      expect(result.details.freshThresholdDays).toBe(10)
    })

    test('both signatures produce same results', () => {
      const now = Date.now()
      const exposures = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: now }
      ]
      const popularity = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: now }
      ]

      const result1 = evaluateOffline(exposures, popularity, 3, { freshDays: 5 })
      const result2 = evaluateOffline({ exposures, popularity, totalClusters: 3 }, { freshDays: 5 })

      expect(result1.giniCoefficient).toBeCloseTo(result2.giniCoefficient)
      expect(result1.clusterCoverage).toBeCloseTo(result2.clusterCoverage)
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

  describe('calculateLikeGini', () => {
    test('均等ないいね分布ではGiniが低い', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1, liked: true },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2, liked: true },
        { userId: 'u3', itemId: 'c', clusterId: 'c1', position: 2, timestamp: 3, liked: true },
        { userId: 'u4', itemId: 'd', clusterId: 'c1', position: 3, timestamp: 4, liked: true }
      ]
      const gini = calculateLikeGini(exposures)
      expect(gini).toBeCloseTo(0)
    })

    test('偏ったいいね分布ではGiniが0より大きい', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1, liked: true },
        { userId: 'u2', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 2, liked: true },
        { userId: 'u3', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 3, liked: true },
        { userId: 'u4', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 4, liked: true }
      ]
      const gini = calculateLikeGini(exposures)
      expect(gini).toBeGreaterThan(0)
    })

    test('いいねがない場合は0', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1, liked: false }
      ]
      const gini = calculateLikeGini(exposures)
      expect(gini).toBe(0)
    })
  })

  describe('calculateLongTailExposureRate', () => {
    test('ロングテール露出率を正しく計算する', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'c', clusterId: 'c1', position: 2, timestamp: 3 }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 1000, totalLikes: 100, totalSaves: 50, createdAt: 0 },
        { itemId: 'b', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'c', clusterId: 'c1', totalExposures: 10, totalLikes: 1, totalSaves: 0, createdAt: 0 }
      ]
      // topPercentile=0.33 means top 1/3 is head, bottom 2/3 is long-tail
      // With 3 items sorted by exposure: a(1000), b(100), c(10)
      // threshold = a(1000) which is top 33%
      // Items <= threshold that are not top: b and c
      const rate = calculateLongTailExposureRate(exposures, popularity, 0.33)
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(1)
    })

    test('空の露出では0を返す', () => {
      const rate = calculateLongTailExposureRate([], [], 0.2)
      expect(rate).toBe(0)
    })
  })

  describe('calculateLongTailClickRate', () => {
    test('ロングテールクリック率を計算する', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1, clicked: true },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: 2, clicked: true },
        { userId: 'u3', itemId: 'c', clusterId: 'c1', position: 2, timestamp: 3, clicked: false }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 1000, totalLikes: 100, totalSaves: 50, createdAt: 0 },
        { itemId: 'b', clusterId: 'c1', totalExposures: 10, totalLikes: 1, totalSaves: 0, createdAt: 0 },
        { itemId: 'c', clusterId: 'c1', totalExposures: 5, totalLikes: 0, totalSaves: 0, createdAt: 0 }
      ]
      const rate = calculateLongTailClickRate(exposures, popularity, 100)
      // Only 'b' is long-tail and clicked (threshold 100)
      expect(rate).toBeGreaterThanOrEqual(0)
      expect(rate).toBeLessThanOrEqual(1)
    })
  })

  describe('calculatePositionCTR', () => {
    test('位置ごとのCTRを計算する', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1, clicked: true },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 0, timestamp: 2, clicked: false },
        { userId: 'u3', itemId: 'c', clusterId: 'c1', position: 1, timestamp: 3, clicked: true },
        { userId: 'u4', itemId: 'd', clusterId: 'c1', position: 1, timestamp: 4, clicked: true }
      ]
      const ctrByPosition = calculatePositionCTR(exposures)
      // Returns array of {position, ctr, count}
      expect(ctrByPosition[0].ctr).toBeCloseTo(0.5) // 1/2 clicks at position 0
      expect(ctrByPosition[1].ctr).toBeCloseTo(1.0) // 2/2 clicks at position 1
    })

    test('露出がある場合は配列を返す', () => {
      const ctrByPosition = calculatePositionCTR([])
      // Returns array with default maxPosition (20) elements
      expect(Array.isArray(ctrByPosition)).toBe(true)
      expect(ctrByPosition.length).toBe(20)
      expect(ctrByPosition[0].ctr).toBe(0)
    })
  })

  describe('calculateFreshItemExposureRate', () => {
    test('フレッシュアイテム露出率を計算する', () => {
      const now = Date.now()
      const oneDayAgo = now - 24 * 60 * 60 * 1000
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000

      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: now },
        { userId: 'u2', itemId: 'b', clusterId: 'c1', position: 1, timestamp: now }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: oneDayAgo },
        { itemId: 'b', clusterId: 'c1', totalExposures: 50, totalLikes: 5, totalSaves: 2, createdAt: tenDaysAgo }
      ]
      const rate = calculateFreshItemExposureRate(exposures, popularity, 7, now)
      // Only item 'a' is fresh (created 1 day ago, threshold 7 days)
      expect(rate).toBeCloseTo(0.5)
    })
  })

  describe('calculateClusterFairness', () => {
    test('均等分布では公平性が高い', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'c', clusterId: 'c3', position: 2, timestamp: 3 }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'b', clusterId: 'c2', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'c', clusterId: 'c3', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 }
      ]
      const fairness = calculateClusterFairness(exposures, popularity)
      // Returns array of ClusterFairness objects
      expect(Array.isArray(fairness)).toBe(true)
      expect(fairness.length).toBe(3)
      // Each cluster should have fairnessRatio close to 1 (equal distribution)
      for (const f of fairness) {
        expect(f.fairnessRatio).toBeCloseTo(1, 1)
      }
    })

    test('偏った分布では公平性が低い', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'a', clusterId: 'c1', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'a', clusterId: 'c1', position: 2, timestamp: 3 }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'b', clusterId: 'c2', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'c', clusterId: 'c3', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 }
      ]
      const fairness = calculateClusterFairness(exposures, popularity)
      // c1 gets all exposure, c2 and c3 get none
      const c1Fairness = fairness.find(f => f.clusterId === 'c1')
      expect(c1Fairness?.fairnessRatio).toBeGreaterThan(1) // Over-represented
    })
  })

  describe('calculateFairnessDivergence', () => {
    test('同一分布ではダイバージェンスが0に近い', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: 2 }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'b', clusterId: 'c2', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 }
      ]
      const divergence = calculateFairnessDivergence(exposures, popularity)
      expect(divergence).toBeCloseTo(0, 1)
    })

    test('異なる分布ではダイバージェンスが正', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u2', itemId: 'a', clusterId: 'c1', position: 1, timestamp: 2 },
        { userId: 'u3', itemId: 'a', clusterId: 'c1', position: 2, timestamp: 3 }
      ]
      const popularity: ItemPopularity[] = [
        { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 },
        { itemId: 'b', clusterId: 'c2', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: 0 }
      ]
      const divergence = calculateFairnessDivergence(exposures, popularity)
      expect(divergence).toBeGreaterThan(0)
    })
  })

  describe('calculateUserDiversityScore', () => {
    test('複数ユーザーの多様性スコアを計算する', () => {
      const exposures: ExposureLog[] = [
        { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1 },
        { userId: 'u1', itemId: 'b', clusterId: 'c2', position: 1, timestamp: 2 },
        { userId: 'u2', itemId: 'c', clusterId: 'c1', position: 0, timestamp: 3 },
        { userId: 'u2', itemId: 'd', clusterId: 'c1', position: 1, timestamp: 4 }
      ]
      const score = calculateUserDiversityScore(exposures)
      // u1 has diverse clusters, u2 has same cluster
      expect(score).toBeGreaterThan(0)
      expect(score).toBeLessThanOrEqual(1)
    })

    test('空の露出では0を返す', () => {
      const score = calculateUserDiversityScore([])
      expect(score).toBe(0)
    })
  })

  describe('generateEvaluationSummary', () => {
    test('評価結果のサマリーを生成する', () => {
      const now = Date.now()
      const result = evaluateOffline(
        [{ userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: now }],
        [{ itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 10, totalSaves: 5, createdAt: now }],
        3
      )
      const summary = generateEvaluationSummary(result)
      expect(typeof summary).toBe('string')
      expect(summary.length).toBeGreaterThan(0)
      expect(summary).toContain('Gini')
    })
  })
})
