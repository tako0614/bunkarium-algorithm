/**
 * Voting Power System Tests
 */
import { describe, it, expect } from 'vitest'
import {
  calculateVotingPower,
  getVotingPowerExplanation,
  predictNextVotingPower
} from './voting-power'

describe('calculateVotingPower', () => {
  describe('basic calculation', () => {
    it('returns voting power for first like with CR=1.0', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      // CR is now used directly (unbounded CR design)
      // votingPower = baseWeight × crMultiplier = 1.0 × 1.0 = 1.0
      expect(result.votingPower).toBeCloseTo(1.0, 2)
      expect(result.votingPowerPercent).toBe(100)
      expect(result.baseWeight).toBeCloseTo(1.0, 2)
      expect(result.crMultiplier).toBeCloseTo(1.0, 2)
      expect(result.isRapid).toBe(false)
    })

    it('applies zero-sum distribution for multiple likes', () => {
      const result = calculateVotingPower({
        likeWindowCount: 20,
        curatorReputation: 1.0
      })

      // ゼロサム設計: w = 1/n = 1/20 = 0.05
      // 総発言力 = 20 × 0.05 = 1.0 (一定)
      expect(result.baseWeight).toBeCloseTo(0.05, 2)
      expect(result.votingPower).toBeCloseTo(0.05, 2)
      expect(result.votingPowerPercent).toBe(5)
    })

    it('treats n < 1 as n = 1', () => {
      const result = calculateVotingPower({
        likeWindowCount: 0,
        curatorReputation: 1.0
      })

      expect(result.baseWeight).toBeCloseTo(1.0, 2)
      expect(result.breakdown.dailyLikeCount).toBe(1)
    })

    it('maintains constant total voting power (zero-sum)', () => {
      // ゼロサム設計: いいね回数に関わらず総発言力は一定
      const testCases = [1, 5, 10, 50, 100]

      for (const n of testCases) {
        const result = calculateVotingPower({
          likeWindowCount: n,
          curatorReputation: 1.0
        })

        // 各いいねの重み × いいね回数 = 総発言力 = 1.0
        const totalVotingPower = result.baseWeight * n
        expect(totalVotingPower).toBeCloseTo(1.0, 5)
      }
    })
  })

  describe('CR multiplier', () => {
    // Note: In the new unbounded CR design, CR is used directly as the multiplier
    // This is balanced by cluster normalization at the application level

    it('applies 0.1x for explorer (CR=0.1)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 0.1
      })

      expect(result.crMultiplier).toBeCloseTo(0.1, 1)
      expect(result.votingPower).toBeCloseTo(0.1, 1)
      expect(result.breakdown.crLevel).toBe('explorer')
    })

    it('applies 10.0x for archiver (CR=10.0)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 10.0
      })

      // CR is used directly (unbounded design)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.votingPower).toBeCloseTo(10.0, 1)
      expect(result.votingPowerPercent).toBe(1000)
      expect(result.breakdown.crLevel).toBe('archiver')
    })

    it('applies 1.0x for finder (CR=1.0)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      // CR is used directly (no logarithmic scaling)
      expect(result.crMultiplier).toBeCloseTo(1.0, 2)
      expect(result.breakdown.crLevel).toBe('finder')
    })

    it('applies 2.0x for curator (CR=2.0)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 2.0
      })

      // CR is used directly (no logarithmic scaling)
      expect(result.crMultiplier).toBeCloseTo(2.0, 2)
      expect(result.breakdown.crLevel).toBe('curator')
    })

    it('combines CR multiplier with zero-sum base weight', () => {
      const result = calculateVotingPower({
        likeWindowCount: 20,
        curatorReputation: 10.0
      })

      // baseWeight = 1/20 = 0.05, crMultiplier = 10.0
      // votingPower = 0.05 * 10.0 = 0.5
      // 総発言力 = 20 × 0.5 = 10.0 (= CR)
      expect(result.baseWeight).toBeCloseTo(0.05, 2)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.votingPower).toBeCloseTo(0.5, 1)
    })

    it('total voting power equals CR regardless of like count', () => {
      // CR=5.0のユーザーは何回いいねしても総発言力は5.0
      const testCases = [1, 10, 50]
      const cr = 5.0

      for (const n of testCases) {
        const result = calculateVotingPower({
          likeWindowCount: n,
          curatorReputation: cr
        })

        const totalVotingPower = result.votingPower * n
        expect(totalVotingPower).toBeCloseTo(cr, 3)
      }
    })
  })

  describe('CR levels', () => {
    it('classifies CR < 0.5 as explorer', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 0.3
      })
      expect(result.breakdown.crLevel).toBe('explorer')
    })

    it('classifies CR 0.5-2.0 as finder', () => {
      const result1 = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 0.5
      })
      const result2 = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.9
      })
      expect(result1.breakdown.crLevel).toBe('finder')
      expect(result2.breakdown.crLevel).toBe('finder')
    })

    it('classifies CR 2.0-5.0 as curator', () => {
      const result1 = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 2.0
      })
      const result2 = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 4.9
      })
      expect(result1.breakdown.crLevel).toBe('curator')
      expect(result2.breakdown.crLevel).toBe('curator')
    })

    it('classifies CR >= 5.0 as archiver', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 5.0
      })
      expect(result.breakdown.crLevel).toBe('archiver')
    })
  })

  describe('rapid penalty (逓減式)', () => {
    // 逓減式: rapidMultiplier = 1 / (1 + β(n-1))
    // β = 0.1 (default), isRapid = rapidMultiplier < 0.5

    it('applies diminishing penalty for many rapid likes', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0,
        recentLikeCount30s: 50
      })

      // rapidMultiplier = 1 / (1 + 0.1 * 49) = 1/5.9 ≈ 0.169
      expect(result.isRapid).toBe(true)
      expect(result.rapidPenaltyMultiplier).toBeCloseTo(0.169, 2)
    })

    it('moderate penalty for fewer rapid likes', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0,
        recentLikeCount30s: 6  // 逓減式: 1/(1+0.1*5) = 1/1.5 ≈ 0.67
      })

      // rapidMultiplier ≈ 0.67 > 0.5 なので isRapid = false
      expect(result.isRapid).toBe(false)
      expect(result.rapidPenaltyMultiplier).toBeCloseTo(0.67, 2)
    })

    it('treats undefined recentLikeCount30s as no rapid', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      expect(result.isRapid).toBe(false)
      expect(result.rapidPenaltyMultiplier).toBe(1.0)
    })

    it('combines all multipliers: base × CR × rapid', () => {
      const result = calculateVotingPower({
        likeWindowCount: 20,
        curatorReputation: 10.0,
        recentLikeCount30s: 50
      })

      // baseWeight = 1/20 = 0.05
      // crMultiplier = 10.0 (direct)
      // rapidMultiplier = 1 / (1 + 0.1 * 49) ≈ 0.169
      // votingPower = 0.05 * 10.0 * 0.169 ≈ 0.085
      expect(result.baseWeight).toBeCloseTo(0.05, 2)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.rapidPenaltyMultiplier).toBeCloseTo(0.169, 2)
      expect(result.votingPower).toBeCloseTo(0.085, 2)
    })
  })

  describe('breakdown', () => {
    it('includes all breakdown fields', () => {
      const result = calculateVotingPower({
        likeWindowCount: 5,
        curatorReputation: 3.0
      })

      expect(result.breakdown).toHaveProperty('dailyLikeCount')
      expect(result.breakdown).toHaveProperty('curatorReputation')
      expect(result.breakdown).toHaveProperty('crLevel')
      expect(result.breakdown.dailyLikeCount).toBe(5)
      expect(result.breakdown.curatorReputation).toBe(3.0)
    })
  })
})

describe('getVotingPowerExplanation', () => {
  it('generates Japanese explanation', () => {
    const output = calculateVotingPower({
      likeWindowCount: 5,
      curatorReputation: 2.0
    })
    const explanation = getVotingPowerExplanation(output, 'ja')

    expect(explanation).toContain('投票力:')
    expect(explanation).toContain('基礎:')
    expect(explanation).toContain('文化度:')
    expect(explanation).toContain('本日5件目')
  })

  it('generates English explanation', () => {
    const output = calculateVotingPower({
      likeWindowCount: 5,
      curatorReputation: 2.0
    })
    const explanation = getVotingPowerExplanation(output, 'en')

    expect(explanation).toContain('Voting Power:')
    expect(explanation).toContain('Base:')
    expect(explanation).toContain('Cultural:')
    expect(explanation).toContain('5 likes today')
  })

  it('includes rapid penalty warning when applicable', () => {
    const output = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 1.0,
      recentLikeCount30s: 50,
      rapidPenaltyThreshold: 50
    })

    const jaExplanation = getVotingPowerExplanation(output, 'ja')
    const enExplanation = getVotingPowerExplanation(output, 'en')

    expect(jaExplanation).toContain('連打ペナルティ')
    expect(enExplanation).toContain('Rapid penalty')
  })

  it('defaults to Japanese', () => {
    const output = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 1.0
    })
    const explanation = getVotingPowerExplanation(output)

    expect(explanation).toContain('投票力:')
  })

  it('shows correct CR level labels in Japanese', () => {
    const explorer = calculateVotingPower({ likeWindowCount: 1, curatorReputation: 0.3 })
    const finder = calculateVotingPower({ likeWindowCount: 1, curatorReputation: 1.0 })
    const curator = calculateVotingPower({ likeWindowCount: 1, curatorReputation: 3.0 })
    const archiver = calculateVotingPower({ likeWindowCount: 1, curatorReputation: 10.0 })

    expect(getVotingPowerExplanation(explorer, 'ja')).toContain('探索者')
    expect(getVotingPowerExplanation(finder, 'ja')).toContain('発見者')
    expect(getVotingPowerExplanation(curator, 'ja')).toContain('目利き')
    expect(getVotingPowerExplanation(archiver, 'ja')).toContain('継承者')
  })
})

describe('predictNextVotingPower', () => {
  it('predicts voting power for next like', () => {
    const current = calculateVotingPower({
      likeWindowCount: 5,
      curatorReputation: 2.0
    })

    const next = predictNextVotingPower(5, 2.0)

    // next should be calculated with likeWindowCount = 6
    expect(next.breakdown.dailyLikeCount).toBe(6)
    expect(next.baseWeight).toBeLessThan(current.baseWeight)
  })

  it('uses same CR for prediction', () => {
    const next = predictNextVotingPower(10, 5.0)

    expect(next.breakdown.curatorReputation).toBe(5.0)
    expect(next.breakdown.crLevel).toBe('archiver')
  })

  it('accepts custom CR config', () => {
    const next = predictNextVotingPower(10, 5.0, {
      minCR: 0.1,
      maxCR: 10.0,
      halfLifeDays: 90
    })

    expect(next.crMultiplier).toBeGreaterThan(1.0)
  })
})

describe('edge cases', () => {
  it('handles very high like count with zero-sum', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1000,
      curatorReputation: 1.0
    })

    // w = 1/1000 = 0.001
    // 総発言力 = 1000 × 0.001 = 1.0 (一定)
    expect(result.baseWeight).toBeCloseTo(0.001, 4)
    const totalVotingPower = result.baseWeight * 1000
    expect(totalVotingPower).toBeCloseTo(1.0, 5)
  })

  it('handles very low CR', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 0.01
    })

    // CR is now used directly without artificial limits
    // Very low CR should still produce a valid, positive result
    expect(result.crMultiplier).toBeGreaterThan(0)
    expect(result.crMultiplier).toBeCloseTo(0.01, 3)
  })

  it('handles very high CR', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 100
    })

    // CR is now unbounded - high CR users have proportionally higher voting power
    // This is balanced by cluster normalization at the application level
    expect(result.crMultiplier).toBeCloseTo(100, 1)
  })

  it('produces consistent results for same input', () => {
    const input = {
      likeWindowCount: 10,
      curatorReputation: 3.0,
      recentLikeCount30s: 20
    }

    const result1 = calculateVotingPower(input)
    const result2 = calculateVotingPower(input)

    expect(result1.votingPower).toBe(result2.votingPower)
    expect(result1.votingPowerPercent).toBe(result2.votingPowerPercent)
    expect(result1.crMultiplier).toBe(result2.crMultiplier)
  })
})
