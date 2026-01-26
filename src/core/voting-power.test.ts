/**
 * Voting Power System Tests (v2.1)
 *
 * votingPower = CR
 * - いいね回数による分割なし
 * - 各いいねが同じCR重みを持つ
 */
import { describe, it, expect } from 'vitest'
import {
  calculateVotingPower,
  getVotingPowerExplanation,
  predictNextVotingPower
} from './voting-power'

describe('calculateVotingPower', () => {
  describe('basic calculation', () => {
    it('returns voting power equal to CR for first like', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      // v2.1: votingPower = CR
      expect(result.votingPower).toBeCloseTo(1.0, 2)
      expect(result.votingPowerPercent).toBe(100)
      expect(result.crMultiplier).toBeCloseTo(1.0, 2)
      expect(result.isRapid).toBe(false)
    })

    it('returns same voting power regardless of like count', () => {
      const result = calculateVotingPower({
        likeWindowCount: 20,
        curatorReputation: 1.0
      })

      // v2.1: votingPower = CR (no /n division)
      expect(result.votingPower).toBeCloseTo(1.0, 2)
      expect(result.votingPowerPercent).toBe(100)
    })

    it('treats n < 1 as n = 1 for stats', () => {
      const result = calculateVotingPower({
        likeWindowCount: 0,
        curatorReputation: 1.0
      })

      expect(result.breakdown.dailyLikeCount).toBe(1)
      expect(result.votingPower).toBeCloseTo(1.0, 2)
    })

    it('voting power is constant regardless of like count', () => {
      const testCases = [1, 5, 10, 50, 100]
      const cr = 1.0

      for (const n of testCases) {
        const result = calculateVotingPower({
          likeWindowCount: n,
          curatorReputation: cr
        })

        // v2.1: votingPower = CR (constant)
        expect(result.votingPower).toBeCloseTo(cr, 5)
      }
    })
  })

  describe('CR multiplier', () => {
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

      expect(result.crMultiplier).toBeCloseTo(1.0, 2)
      expect(result.breakdown.crLevel).toBe('finder')
    })

    it('applies 2.0x for curator (CR=2.0)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 2.0
      })

      expect(result.crMultiplier).toBeCloseTo(2.0, 2)
      expect(result.breakdown.crLevel).toBe('curator')
    })

    it('voting power equals CR regardless of like count', () => {
      const result = calculateVotingPower({
        likeWindowCount: 20,
        curatorReputation: 10.0
      })

      // v2.1: votingPower = CR (no /n division)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.votingPower).toBeCloseTo(10.0, 1)
    })

    it('each like has same weight for any like count', () => {
      const testCases = [1, 10, 50]
      const cr = 5.0

      for (const n of testCases) {
        const result = calculateVotingPower({
          likeWindowCount: n,
          curatorReputation: cr
        })

        // v2.1: votingPower = CR (constant for each like)
        expect(result.votingPower).toBeCloseTo(cr, 3)
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

  describe('rapid detection (連打検出)', () => {
    it('detects rapid liking (3+ in 30s)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0,
        recentLikeCount30s: 50
      })

      // isRapid = recentLikeCount30s >= 3
      expect(result.isRapid).toBe(true)
      // rapidPenaltyMultiplier is informational only (doesn't affect votingPower)
      expect(result.rapidPenaltyMultiplier).toBeCloseTo(0.169, 2)
      // votingPower is still CR (rapid doesn't affect it)
      expect(result.votingPower).toBeCloseTo(1.0, 2)
    })

    it('does not flag moderate liking as rapid', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0,
        recentLikeCount30s: 2  // < 3, not rapid
      })

      expect(result.isRapid).toBe(false)
    })

    it('treats undefined recentLikeCount30s as no rapid', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      expect(result.isRapid).toBe(false)
      expect(result.rapidPenaltyMultiplier).toBe(1.0)
    })

    it('rapid detection does not affect voting power', () => {
      const result = calculateVotingPower({
        likeWindowCount: 20,
        curatorReputation: 10.0,
        recentLikeCount30s: 50
      })

      // v2.1: votingPower = CR (rapid doesn't reduce it)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.votingPower).toBeCloseTo(10.0, 1)
      expect(result.isRapid).toBe(true)
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
    expect(explanation).toContain('文化度:')
    expect(explanation).toContain('本日5件いいね')
  })

  it('generates English explanation', () => {
    const output = calculateVotingPower({
      likeWindowCount: 5,
      curatorReputation: 2.0
    })
    const explanation = getVotingPowerExplanation(output, 'en')

    expect(explanation).toContain('Voting Power:')
    expect(explanation).toContain('Cultural:')
    expect(explanation).toContain('5 likes today')
  })

  it('includes rapid warning when applicable', () => {
    const output = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 1.0,
      recentLikeCount30s: 50
    })

    const jaExplanation = getVotingPowerExplanation(output, 'ja')
    const enExplanation = getVotingPowerExplanation(output, 'en')

    expect(jaExplanation).toContain('連打検出中')
    expect(enExplanation).toContain('Rapid liking detected')
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

    // v2.1: votingPower = CR (same regardless of like count)
    expect(next.breakdown.dailyLikeCount).toBe(6)
    expect(next.votingPower).toBeCloseTo(current.votingPower, 2)
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
  it('handles very high like count', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1000,
      curatorReputation: 1.0
    })

    // v2.1: votingPower = CR (constant)
    expect(result.votingPower).toBeCloseTo(1.0, 4)
  })

  it('handles very low CR', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 0.01
    })

    expect(result.crMultiplier).toBeGreaterThan(0)
    expect(result.crMultiplier).toBeCloseTo(0.01, 3)
  })

  it('handles very high CR', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 100
    })

    expect(result.crMultiplier).toBeCloseTo(100, 1)
    expect(result.votingPower).toBeCloseTo(100, 1)
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
