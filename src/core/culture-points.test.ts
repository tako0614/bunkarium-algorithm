import { describe, expect, test } from 'bun:test'
import {
  calculateDiminishingMultiplier,
  calculateCPIssuance,
  calculateCPBalance,
  countRecentEvents,
  createMintEntry,
  createStakeRecommendation,
  evaluateStakeOutcome,
  resolveStake,
  detectCPFraud,
  generateCPSummary,
  DEFAULT_CP_CONFIG,
  type CPLedgerEntry,
  type CPBalanceSummary,
  type StakeRecommendation
} from './culture-points'

describe('culture-points', () => {
  describe('calculateDiminishingMultiplier', () => {
    test('最初のイベントは乗数1.0', () => {
      const multiplier = calculateDiminishingMultiplier(1)
      expect(multiplier).toBe(1.0)
    })

    test('イベント数が増えると乗数が減少する', () => {
      const m1 = calculateDiminishingMultiplier(1)
      const m5 = calculateDiminishingMultiplier(5)
      const m10 = calculateDiminishingMultiplier(10)

      expect(m1).toBeGreaterThan(m5)
      expect(m5).toBeGreaterThan(m10)
    })

    test('最小乗数以下にはならない', () => {
      const multiplier = calculateDiminishingMultiplier(1000)
      expect(multiplier).toBeGreaterThanOrEqual(DEFAULT_CP_CONFIG.diminishing.minMultiplier)
    })
  })

  describe('calculateCPIssuance', () => {
    test('注釈採用で基本ポイントが発行される', () => {
      const result = calculateCPIssuance('mint_note_adopted', 1)
      expect(result.amount).toBe(DEFAULT_CP_CONFIG.baseAmounts.noteAdopted)
    })

    test('連続発行で逓減が適用される', () => {
      const first = calculateCPIssuance('mint_note_adopted', 1)
      const tenth = calculateCPIssuance('mint_note_adopted', 10)

      expect(first.amount).toBeGreaterThan(tenth.amount)
    })

    test('CRが高いと発行量が増える', () => {
      const normal = calculateCPIssuance('mint_note_adopted', 1, 1.0)
      const highCR = calculateCPIssuance('mint_note_adopted', 1, 2.0)

      expect(highCR.amount).toBeGreaterThan(normal.amount)
    })
  })

  describe('calculateCPBalance', () => {
    const now = Date.now()

    test('発行のみの場合は全て利用可能', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'mint_bridge_success', amount: 20, timestamp: now }
      ]

      const balance = calculateCPBalance(entries, 'u1')
      expect(balance.available).toBe(30)
      expect(balance.totalEarned).toBe(30)
    })

    test('消費後は残高が減る', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 100, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'burn_editorial_application', amount: -30, timestamp: now }
      ]

      const balance = calculateCPBalance(entries, 'u1')
      expect(balance.available).toBe(70)
      expect(balance.totalSpent).toBe(30)
    })

    test('ロック中CPは利用不可', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 100, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'lock_stake_recommendation', amount: -50, timestamp: now }
      ]

      const balance = calculateCPBalance(entries, 'u1')
      expect(balance.available).toBe(50)
      expect(balance.locked).toBe(50)
    })
  })

  describe('countRecentEvents', () => {
    const now = Date.now()

    test('時間窓内のイベントをカウントする', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 1000 },
        { id: '2', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 2000 },
        { id: '3', userId: 'u1', eventType: 'mint_bridge_success', amount: 20, timestamp: now - 3000 }
      ]

      const count = countRecentEvents(entries, 'u1', 'note_adopted', 24)
      expect(count).toBe(2)
    })

    test('時間窓外のイベントは除外される', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 1000 },
        { id: '2', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 100000000 } // 古い
      ]

      const count = countRecentEvents(entries, 'u1', 'note_adopted', 24)
      expect(count).toBe(1)
    })
  })

  describe('createMintEntry', () => {
    test('台帳エントリを作成できる', () => {
      const entry = createMintEntry(
        'u1',
        'mint_note_adopted',
        [],
        1.0,
        { type: 'note', id: 'n1' }
      )

      expect(entry.userId).toBe('u1')
      expect(entry.eventType).toBe('mint_note_adopted')
      expect(entry.amount).toBeGreaterThan(0)
      expect(entry.relatedObjectType).toBe('note')
      expect(entry.relatedObjectId).toBe('n1')
    })
  })

  describe('createStakeRecommendation', () => {
    test('残高が十分なら推薦を作成できる', () => {
      const balance: CPBalanceSummary = {
        userId: 'u1',
        available: 100,
        locked: 0,
        totalEarned: 100,
        totalSpent: 0,
        totalSlashed: 0,
        calculatedAt: Date.now()
      }

      const result = createStakeRecommendation('u1', 'work', 'w1', 50, balance)

      if ('error' in result) {
        throw new Error('Expected stake, got error')
      }

      expect(result.stake.userId).toBe('u1')
      expect(result.stake.stakedAmount).toBe(50)
      expect(result.stake.status).toBe('active')
      expect(result.lockEntry.amount).toBe(-50)
    })

    test('残高不足ならエラー', () => {
      const balance: CPBalanceSummary = {
        userId: 'u1',
        available: 30,
        locked: 0,
        totalEarned: 30,
        totalSpent: 0,
        totalSlashed: 0,
        calculatedAt: Date.now()
      }

      const result = createStakeRecommendation('u1', 'work', 'w1', 50, balance)

      expect('error' in result).toBe(true)
    })

    test('最小ステーク量未満ならエラー', () => {
      const balance: CPBalanceSummary = {
        userId: 'u1',
        available: 100,
        locked: 0,
        totalEarned: 100,
        totalSpent: 0,
        totalSlashed: 0,
        calculatedAt: Date.now()
      }

      const result = createStakeRecommendation('u1', 'work', 'w1', 10, balance)

      expect('error' in result).toBe(true)
    })
  })

  describe('evaluateStakeOutcome', () => {
    const stake: StakeRecommendation = {
      id: 's1',
      userId: 'u1',
      targetType: 'work',
      targetId: 'w1',
      stakedAmount: 100,
      lockDurationDays: 14,
      startedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      endsAt: Date.now(),
      status: 'active'
    }

    test('指標が改善したら成功', () => {
      const outcome = evaluateStakeOutcome(stake, {
        supportDensityBefore: 0.1,
        supportDensityAfter: 0.2,
        breadthBefore: 2,
        breadthAfter: 4,
        contextCountBefore: 3,
        contextCountAfter: 8,
        crossClusterReactionsBefore: 0,
        crossClusterReactionsAfter: 5
      })

      expect(outcome.isSuccess).toBe(true)
      expect(outcome.totalScore).toBeGreaterThan(0.5)
    })

    test('指標が改善しなければ失敗', () => {
      const outcome = evaluateStakeOutcome(stake, {
        supportDensityBefore: 0.1,
        supportDensityAfter: 0.1,
        breadthBefore: 2,
        breadthAfter: 2,
        contextCountBefore: 3,
        contextCountAfter: 3,
        crossClusterReactionsBefore: 0,
        crossClusterReactionsAfter: 0
      })

      expect(outcome.isSuccess).toBe(false)
    })
  })

  describe('resolveStake', () => {
    const stake: StakeRecommendation = {
      id: 's1',
      userId: 'u1',
      targetType: 'work',
      targetId: 'w1',
      stakedAmount: 100,
      lockDurationDays: 14,
      startedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      endsAt: Date.now(),
      status: 'active'
    }

    test('成功時はボーナス付きでアンロック', () => {
      const outcome = {
        supportDensityImprovement: 1,
        breadthIncrease: 3,
        contextIncrease: 5,
        crossClusterReactions: 10,
        totalScore: 0.9,
        isSuccess: true
      }

      const { updatedStake, entries } = resolveStake(stake, outcome)

      expect(updatedStake.status).toBe('success')
      expect(entries.some(e => e.eventType === 'mint_community_reward')).toBe(true)
      expect(entries.some(e => e.eventType === 'unlock_stake_success')).toBe(true)
    })

    test('失敗時は一部没収', () => {
      const outcome = {
        supportDensityImprovement: 0,
        breadthIncrease: 0,
        contextIncrease: 0,
        crossClusterReactions: 0,
        totalScore: 0.1,
        isSuccess: false
      }

      const { updatedStake, entries } = resolveStake(stake, outcome)

      expect(updatedStake.status).toBe('failure')
      expect(entries.some(e => e.eventType === 'slash_stake_failure')).toBe(true)
    })
  })

  describe('detectCPFraud', () => {
    const now = Date.now()

    test('正常なパターンは不正検出されない', () => {
      const entries: CPLedgerEntry[] = Array(5).fill(null).map((_, i) => ({
        id: `${i}`,
        userId: 'u1',
        eventType: 'mint_note_adopted' as const,
        amount: 10,
        timestamp: now - i * 3600000, // 1時間ごと
        diminishingApplied: false
      }))

      const result = detectCPFraud(entries, 'u1', 7)
      expect(result.isFraudulent).toBe(false)
      expect(result.recommendedAction).toBe('none')
    })

    test('異常な頻度は検出される', () => {
      const entries: CPLedgerEntry[] = Array(500).fill(null).map((_, i) => ({
        id: `${i}`,
        userId: 'u1',
        eventType: 'mint_note_adopted' as const,
        amount: 1,
        timestamp: now - i * 1000, // 1秒ごと
        diminishingApplied: true
      }))

      const result = detectCPFraud(entries, 'u1', 7)
      expect(result.isFraudulent).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0.5)
    })
  })

  describe('generateCPSummary', () => {
    test('サマリーを生成できる', () => {
      const now = Date.now()
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'mint_bridge_success', amount: 20, timestamp: now },
        { id: '3', userId: 'u1', eventType: 'burn_editorial_application', amount: -5, timestamp: now }
      ]

      const summary = generateCPSummary(entries, 'u1')

      expect(summary).toContain('Culture Points')
      expect(summary).toContain('u1')
      expect(summary).toContain('利用可能')
    })
  })
})
