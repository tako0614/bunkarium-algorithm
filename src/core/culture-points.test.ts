import { describe, expect, test } from 'bun:test'
import {
  calculateCPDiminishingMultiplier,
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
  describe('calculateCPDiminishingMultiplier', () => {
    test('first event has multiplier 1.0', () => {
      const multiplier = calculateCPDiminishingMultiplier(1)
      expect(multiplier).toBe(1.0)
    })

    test('non-positive counts are treated as 1', () => {
      const zero = calculateCPDiminishingMultiplier(0)
      const negative = calculateCPDiminishingMultiplier(-3)
      expect(zero).toBe(1.0)
      expect(negative).toBe(1.0)
    })

    test('multiplier decreases as events increase', () => {
      const m1 = calculateCPDiminishingMultiplier(1)
      const m5 = calculateCPDiminishingMultiplier(5)
      const m10 = calculateCPDiminishingMultiplier(10)

      expect(m1).toBeGreaterThan(m5)
      expect(m5).toBeGreaterThan(m10)
    })

    test('multiplier is not below minimum', () => {
      const multiplier = calculateCPDiminishingMultiplier(1000)
      expect(multiplier).toBeGreaterThanOrEqual(DEFAULT_CP_CONFIG.diminishing.minMultiplier)
    })

    test('spec-compliant signature: (n: number, rate: number, minMultiplier: number)', () => {
      const multiplier = calculateCPDiminishingMultiplier(10, 0.05, 0.1)
      // With n=10, rate=0.05: multiplier = 1 / (1 + 0.05 * 9) = 1 / 1.45 ≈ 0.689
      expect(multiplier).toBeCloseTo(0.689, 2)
    })

    test('spec signature with min multiplier clamping', () => {
      const multiplier = calculateCPDiminishingMultiplier(100, 0.1, 0.5)
      // With n=100, rate=0.1: multiplier = 1 / (1 + 0.1 * 99) = 1 / 10.9 ≈ 0.092
      // But min is 0.5, so should return 0.5
      expect(multiplier).toBe(0.5)
    })

    test('backward-compatible signature still works', () => {
      const m1 = calculateCPDiminishingMultiplier(10)
      const m2 = calculateCPDiminishingMultiplier(10, DEFAULT_CP_CONFIG)
      expect(m1).toBeCloseTo(m2)
    })
  })

  describe('calculateCPIssuance', () => {
    test('uses base amount for first mint', () => {
      const result = calculateCPIssuance('mint_note_adopted', 1)
      expect(result.amount).toBe(DEFAULT_CP_CONFIG.baseAmounts.noteAdopted)
    })

    test('diminishing reduces issuance over time', () => {
      const first = calculateCPIssuance('mint_note_adopted', 1)
      const tenth = calculateCPIssuance('mint_note_adopted', 10)

      expect(first.amount).toBeGreaterThan(tenth.amount)
    })

    test('CR multiplier is capped', () => {
      const normal = calculateCPIssuance('mint_note_adopted', 1, 1.0)
      const highCR = calculateCPIssuance('mint_note_adopted', 1, 2.0)

      expect(highCR.crMultiplier).toBeLessThanOrEqual(1.1)
      expect(highCR.amount).toBeGreaterThanOrEqual(normal.amount)
    })
  })

  describe('calculateCPBalance', () => {
    const now = Date.now()

    test('sum of mint events increases balance', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'mint_bridge_success', amount: 20, timestamp: now }
      ]

      const balance = calculateCPBalance(entries, 'u1')
      expect(balance.available).toBe(30)
      expect(balance.totalEarned).toBe(30)
    })

    test('burn events reduce available balance', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 100, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'burn_editorial_application', amount: -30, timestamp: now }
      ]

      const balance = calculateCPBalance(entries, 'u1')
      expect(balance.available).toBe(70)
      expect(balance.totalSpent).toBe(30)
    })

    test('locked CP is not available', () => {
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

    test('counts events within the window', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 1000 },
        { id: '2', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 2000 },
        { id: '3', userId: 'u1', eventType: 'mint_bridge_success', amount: 20, timestamp: now - 3000 }
      ]

      const count = countRecentEvents(entries, 'u1', 'note_adopted', 24)
      expect(count).toBe(2)
    })

    test('ignores events outside the window', () => {
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 1000 },
        { id: '2', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now - 100000000 }
      ]

      const count = countRecentEvents(entries, 'u1', 'note_adopted', 24)
      expect(count).toBe(1)
    })
  })

  describe('createMintEntry', () => {
    test('creates a new mint entry', () => {
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
    test('creates stake when balance is sufficient', () => {
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

    test('returns error when balance is insufficient', () => {
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

    test('returns error when below minimum stake', () => {
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

    test('successful outcome passes threshold', () => {
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

    test('no improvement fails', () => {
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

    test('success returns bonus and unlock entries', () => {
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

    test('failure includes slash entry', () => {
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

    test('normal patterns are not flagged', () => {
      const entries: CPLedgerEntry[] = Array(5).fill(null).map((_, i) => ({
        id: `${i}`,
        userId: 'u1',
        eventType: 'mint_note_adopted' as const,
        amount: 10,
        timestamp: now - i * 3600000,
        diminishingApplied: false
      }))

      const result = detectCPFraud(entries, 'u1', 7)
      expect(result.isFraudulent).toBe(false)
      expect(result.recommendedAction).toBe('none')
    })

    test('high frequency patterns are flagged', () => {
      const entries: CPLedgerEntry[] = Array(500).fill(null).map((_, i) => ({
        id: `${i}`,
        userId: 'u1',
        eventType: 'mint_note_adopted' as const,
        amount: 1,
        timestamp: now - i * 1000,
        diminishingApplied: true
      }))

      const result = detectCPFraud(entries, 'u1', 7)
      expect(result.isFraudulent).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0.5)
    })
  })

  describe('generateCPSummary', () => {
    test('summary contains balances and events', () => {
      const now = Date.now()
      const entries: CPLedgerEntry[] = [
        { id: '1', userId: 'u1', eventType: 'mint_note_adopted', amount: 10, timestamp: now },
        { id: '2', userId: 'u1', eventType: 'mint_bridge_success', amount: 20, timestamp: now },
        { id: '3', userId: 'u1', eventType: 'burn_editorial_application', amount: -5, timestamp: now }
      ]

      const summary = generateCPSummary(entries, 'u1')

      expect(summary).toContain('Culture Points Summary')
      expect(summary).toContain('u1')
      expect(summary).toContain('[Balances]')
    })
  })
})