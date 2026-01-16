import { describe, expect, test } from 'bun:test'
import {
  calculateCR,
  getCRMultiplier,
  getCRLevel,
  evaluateBridgeSuccess,
  evaluateNoteSettlement,
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
    test('CR=1.0 で乗数 = 1.0', () => {
      const multiplier = getCRMultiplier(1.0)
      expect(multiplier).toBeCloseTo(1.0)
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
})
