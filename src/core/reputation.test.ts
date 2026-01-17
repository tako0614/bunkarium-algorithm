import { describe, expect, test } from 'bun:test'
import {
  calculateCR,
  getCRMultiplier,
  getCRLevel,
  evaluateBridgeSuccess,
  evaluateNoteSettlement,
  calculateViewWeight,
  DEFAULT_CR_CONFIG,
  type CREvent
} from './reputation'

describe('reputation', () => {
  describe('calculateCR', () => {
    const now = Date.now()

    test('ポジティブなイベントでCRが上昇する', () => {
      const events: CREvent[] = [
        { type: 'note_adopted', timestamp: now - 1000, metadata: {} },
        { type: 'bridge_success', timestamp: now - 2000, metadata: {} }
      ]

      const newCR = calculateCR(events, 1.0)
      expect(newCR).toBeGreaterThan(1.0)
    })

    test('ネガティブなイベントでCRが下降する', () => {
      const events: CREvent[] = [
        { type: 'spam_flag', timestamp: now - 1000, metadata: {} },
        { type: 'stake_failure', timestamp: now - 2000, metadata: {} }
      ]

      const newCR = calculateCR(events, 1.0)
      expect(newCR).toBeLessThan(1.0)
    })

    test('古いイベントは影響が小さい', () => {
      const recentEvents: CREvent[] = [
        { type: 'note_adopted', timestamp: now - 1000, metadata: {} }
      ]

      const oldEvents: CREvent[] = [
        { type: 'note_adopted', timestamp: now - 180 * 24 * 60 * 60 * 1000, metadata: {} }
      ]

      const recentCR = calculateCR(recentEvents, 1.0)
      const oldCR = calculateCR(oldEvents, 1.0)

      expect(recentCR).toBeGreaterThan(oldCR)
    })

    test('CRは最小値・最大値内に収まる', () => {
      const manyPositive: CREvent[] = Array(100).fill({
        type: 'bridge_success' as const,
        timestamp: now - 1000,
        metadata: {}
      })

      const manyNegative: CREvent[] = Array(100).fill({
        type: 'spam_flag' as const,
        timestamp: now - 1000,
        metadata: {}
      })

      const highCR = calculateCR(manyPositive, 1.0)
      const lowCR = calculateCR(manyNegative, 1.0)

      expect(highCR).toBeLessThanOrEqual(DEFAULT_CR_CONFIG.maxCR)
      expect(lowCR).toBeGreaterThanOrEqual(DEFAULT_CR_CONFIG.minCR)
    })
  })

  describe('getCRMultiplier', () => {
    test('CR=1.0 で乗数 = 1.25 (logarithmic scaling)', () => {
      const multiplier = getCRMultiplier(1.0)
      expect(multiplier).toBeCloseTo(1.25, 2)
    })
    test('CRが0以下でも有限値になる', () => {
      expect(getCRMultiplier(0)).toBeFinite()
      expect(getCRMultiplier(-1)).toBeFinite()
    })

    test('CRが高いと乗数も高い', () => {
      const lowCR = getCRMultiplier(0.5)
      const highCR = getCRMultiplier(5.0)

      expect(highCR).toBeGreaterThan(lowCR)
    })

    test('乗数は0.5〜2.0の範囲内', () => {
      expect(getCRMultiplier(0.1)).toBeGreaterThanOrEqual(0.5)
      expect(getCRMultiplier(10.0)).toBeLessThanOrEqual(2.0)
    })
  })

  describe('getCRLevel', () => {
    test('低CRはnewcomer', () => {
      expect(getCRLevel(0.3)).toBe('newcomer')
    })

    test('通常CRはregular', () => {
      expect(getCRLevel(1.0)).toBe('regular')
    })

    test('高CRはtrusted', () => {
      expect(getCRLevel(3.0)).toBe('trusted')
    })

    test('非常に高いCRはexpert', () => {
      expect(getCRLevel(7.0)).toBe('expert')
    })
  })

  describe('evaluateBridgeSuccess', () => {
    test('複数クラスタで反応があれば成功', () => {
      const result = evaluateBridgeSuccess('cluster1', [
        { userId: 'u1', userCluster: 'cluster2', type: 'like', weight: 0.5 },
        { userId: 'u2', userCluster: 'cluster3', type: 'save', weight: 0.8 },
        { userId: 'u3', userCluster: 'cluster3', type: 'like', weight: 0.3 }
      ])

      expect(result.success).toBe(true)
      expect(result.crossClusterReach).toBe(2)
      expect(result.details.uniqueClusters).toContain('cluster2')
      expect(result.details.uniqueClusters).toContain('cluster3')
    })

    test('同一クラスタのみでは失敗', () => {
      const result = evaluateBridgeSuccess('cluster1', [
        { userId: 'u1', userCluster: 'cluster1', type: 'like', weight: 1.0 },
        { userId: 'u2', userCluster: 'cluster1', type: 'save', weight: 1.0 }
      ])

      expect(result.success).toBe(false)
      expect(result.crossClusterReach).toBe(0)
    })

    test('1クラスタのみでは失敗', () => {
      const result = evaluateBridgeSuccess('cluster1', [
        { userId: 'u1', userCluster: 'cluster2', type: 'like', weight: 0.5 }
      ])

      expect(result.success).toBe(false)
      expect(result.crossClusterReach).toBe(1)
    })
  })

  describe('evaluateNoteSettlement', () => {
    const now = Date.now()

    test('参照が多いと定着', () => {
      const references = [
        { type: 'direct_reference' as const, timestamp: now - 1000, weight: 1.0 },
        { type: 'citation' as const, timestamp: now - 2000, weight: 0.8 },
        { type: 'indirect_reference' as const, timestamp: now - 3000, weight: 0.5 }
      ]

      const result = evaluateNoteSettlement(references, 30)
      expect(result.referenceCount).toBe(3)
      expect(result.settlementScore).toBeGreaterThan(0)
    })

    test('参照がなければ定着しない', () => {
      const result = evaluateNoteSettlement([], 30)
      expect(result.isSettled).toBe(false)
      expect(result.settlementScore).toBe(0)
    })

    test('最近の活動率を計算する', () => {
      const references = [
        { type: 'direct_reference' as const, timestamp: now - 1000, weight: 1.0 },
        { type: 'direct_reference' as const, timestamp: now - 30 * 24 * 60 * 60 * 1000, weight: 1.0 }
      ]

      const result = evaluateNoteSettlement(references, 60)
      expect(result.recentActivityRate).toBeGreaterThan(0)
      expect(result.recentActivityRate).toBeLessThan(1)
    })
  })

  describe('calculateViewWeight', () => {
    test('基本ケース: CR=1.0, cpEarned90d=0', () => {
      // CR=1.0 -> CRm ≈ 1.25
      // cpEarned90d=0 -> CPm = 1.0
      // viewWeight = 1.25 * 1.0 = 1.25
      const weight = calculateViewWeight(1.0, 0)
      expect(weight).toBeCloseTo(1.25, 2)
    })

    test('高CR、高CP: CR=5.0, cpEarned90d=500', () => {
      // CR=5.0 -> CRm ≈ 1.85 (high)
      // cpEarned90d=500 -> CPm ≈ 1.2 (capped at max)
      // viewWeight = 1.85 * 1.2 = 2.22 -> clamped to 2.0
      const weight = calculateViewWeight(5.0, 500)
      expect(weight).toBe(2.0) // Max clamp
    })

    test('低CR、低CP: CR=0.2, cpEarned90d=0', () => {
      // CR=0.2 -> CRm ≈ 0.726 (low)
      // cpEarned90d=0 -> CPm = 1.0
      // viewWeight = 0.726 * 1.0 ≈ 0.726
      const weight = calculateViewWeight(0.2, 0)
      expect(weight).toBeCloseTo(0.726, 2)
    })

    test('非常に低いCR: CR=0.05, cpEarned90d=0', () => {
      // CR=0.05 -> CRm = 0.5 (min)
      // cpEarned90d=0 -> CPm = 1.0
      // viewWeight = 0.5 * 1.0 = 0.5
      const weight = calculateViewWeight(0.05, 0)
      expect(weight).toBeCloseTo(0.5, 2)
    })

    test('最小値クランプ: 極端に低い値', () => {
      // Even with very low values, should not go below 0.2
      const weight = calculateViewWeight(0.01, 0)
      expect(weight).toBeGreaterThanOrEqual(0.2)
    })

    test('最大値クランプ: 極端に高い値', () => {
      // Even with very high values, should not exceed 2.0
      const weight = calculateViewWeight(10.0, 1000)
      expect(weight).toBeLessThanOrEqual(2.0)
      expect(weight).toBe(2.0)
    })

    test('CP multiplierの計算: cpEarned90d=50', () => {
      // cpEarned90d=50 -> CPm = 1.0 + 0.2 * log10(1 + 50/50) = 1.0 + 0.2 * log10(2) ≈ 1.06
      // CR=1.0 -> CRm ≈ 1.25
      // viewWeight ≈ 1.25 * 1.06 ≈ 1.33
      const weight = calculateViewWeight(1.0, 50)
      expect(weight).toBeGreaterThan(1.25)
      expect(weight).toBeLessThan(1.4)
    })

    test('CP multiplierの計算: cpEarned90d=250', () => {
      // cpEarned90d=250 -> CPm = 1.0 + 0.2 * log10(1 + 250/50) = 1.0 + 0.2 * log10(6) ≈ 1.155
      // CR=1.0 -> CRm ≈ 1.25
      // viewWeight ≈ 1.25 * 1.155 ≈ 1.44
      const weight = calculateViewWeight(1.0, 250)
      expect(weight).toBeGreaterThan(1.4)
      expect(weight).toBeLessThan(1.5)
    })

    test('CPm上限クランプ: cpEarned90d=1000', () => {
      // cpEarned90d=1000 -> log10(1 + 1000/50) = log10(21) ≈ 1.32
      // CPm = 1.0 + 0.2 * 1.32 = 1.264 -> clamped to 1.2
      // CR=1.0 -> CRm ≈ 1.25
      // viewWeight = 1.25 * 1.2 = 1.5
      const weight = calculateViewWeight(1.0, 1000)
      expect(weight).toBeCloseTo(1.5, 2)
    })

    test('負のCP値を処理: cpEarned90d=-10', () => {
      // Negative CP should be handled gracefully
      // cpEarned90d=-10 -> 1 + (-10)/50 = 0.8
      // log10(0.8) is negative, so CPm should be clamped to 1.0
      const weight = calculateViewWeight(1.0, -10)
      expect(weight).toBeGreaterThanOrEqual(0.2)
      expect(weight).toBeLessThanOrEqual(2.0)
    })

    test('viewWeightは常に有効範囲内', () => {
      // Test various combinations to ensure output is always in [0.2, 2.0]
      const testCases = [
        { cr: 0.1, cp: 0 },
        { cr: 0.5, cp: 10 },
        { cr: 1.0, cp: 100 },
        { cr: 2.5, cp: 250 },
        { cr: 5.0, cp: 500 },
        { cr: 10.0, cp: 1000 },
        { cr: 0.01, cp: 0 },
        { cr: 15.0, cp: 2000 }
      ]

      for (const { cr, cp } of testCases) {
        const weight = calculateViewWeight(cr, cp)
        expect(weight).toBeGreaterThanOrEqual(0.2)
        expect(weight).toBeLessThanOrEqual(2.0)
      }
    })

    test('同じCRで異なるCP: CPが高いほど重みが大きい', () => {
      const weight0 = calculateViewWeight(1.0, 0)
      const weight100 = calculateViewWeight(1.0, 100)
      const weight500 = calculateViewWeight(1.0, 500)

      expect(weight100).toBeGreaterThan(weight0)
      expect(weight500).toBeGreaterThan(weight100)
    })

    test('同じCPで異なるCR: CRが高いほど重みが大きい', () => {
      const weightLow = calculateViewWeight(0.5, 100)
      const weightMid = calculateViewWeight(1.0, 100)
      const weightHigh = calculateViewWeight(3.0, 100)

      expect(weightMid).toBeGreaterThan(weightLow)
      expect(weightHigh).toBeGreaterThan(weightMid)
    })

    test('ゼロ値での安定性', () => {
      // Both zero should give minimum sensible weight
      const weight = calculateViewWeight(0, 0)
      expect(weight).toBeFinite()
      expect(weight).toBeGreaterThanOrEqual(0.2)
    })

    test('非常に大きな値での安定性', () => {
      // Very large values should be handled gracefully
      const weight = calculateViewWeight(100, 10000)
      expect(weight).toBe(2.0) // Clamped to max
    })
  })
})
