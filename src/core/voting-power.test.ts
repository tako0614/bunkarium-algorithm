/**
 * Voting Power System Tests
 */
import { describe, it, expect } from 'vitest'
import {
  calculateVotingPower,
  getVotingPowerExplanation,
  predictNextVotingPower,
  CR_MULTIPLIER_TABLE
} from './voting-power'

describe('calculateVotingPower', () => {
  describe('basic calculation', () => {
    it('returns voting power for first like with CR=1.0', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      // CR=1.0 maps to CRm=5.05 (log scale: x = log10(10)/2 = 0.5, CRm = 0.1 + 9.9*0.5 = 5.05)
      expect(result.votingPower).toBeCloseTo(5.05, 2)
      expect(result.votingPowerPercent).toBe(505)
      expect(result.baseWeight).toBeCloseTo(1.0, 2)
      expect(result.crMultiplier).toBeCloseTo(5.05, 2)
      expect(result.isRapid).toBe(false)
    })

    it('applies daily decay for multiple likes', () => {
      const result = calculateVotingPower({
        likeWindowCount: 21,
        curatorReputation: 1.0,
        alpha: 0.05
      })

      // w = 1 / (1 + 0.05 * (21-1)) = 1 / (1 + 1) = 0.5
      // votingPower = 0.5 * 5.05 = 2.525
      expect(result.baseWeight).toBeCloseTo(0.5, 2)
      expect(result.votingPower).toBeCloseTo(2.525, 2)
      expect(result.votingPowerPercent).toBe(253)
    })

    it('treats n < 1 as n = 1', () => {
      const result = calculateVotingPower({
        likeWindowCount: 0,
        curatorReputation: 1.0
      })

      expect(result.baseWeight).toBeCloseTo(1.0, 2)
      expect(result.breakdown.dailyLikeCount).toBe(1)
    })

    it('clamps alpha to [0, 1]', () => {
      const resultHighAlpha = calculateVotingPower({
        likeWindowCount: 5,
        curatorReputation: 1.0,
        alpha: 1.5 // Should be clamped to 1.0
      })

      const resultNegativeAlpha = calculateVotingPower({
        likeWindowCount: 5,
        curatorReputation: 1.0,
        alpha: -0.5 // Should be clamped to 0.0
      })

      // With alpha=1.0: w = 1 / (1 + 1 * 4) = 0.2
      expect(resultHighAlpha.baseWeight).toBeCloseTo(0.2, 2)

      // With alpha=0.0: w = 1 / (1 + 0 * 4) = 1.0
      expect(resultNegativeAlpha.baseWeight).toBeCloseTo(1.0, 2)
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

    it('applies 5.05x for finder (CR=1.0)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      // CR=1.0: x = log10(10)/2 = 0.5, CRm = 0.1 + 9.9*0.5 = 5.05
      expect(result.crMultiplier).toBeCloseTo(5.05, 2)
      expect(result.breakdown.crLevel).toBe('finder')
    })

    it('applies ~6.5x for curator (CR=2.0)', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 2.0
      })

      // CR=2.0: x = log10(20)/2 ≈ 0.65, CRm ≈ 6.5
      expect(result.crMultiplier).toBeGreaterThan(6.4)
      expect(result.crMultiplier).toBeLessThan(6.6)
      expect(result.breakdown.crLevel).toBe('curator')
    })

    it('combines CR multiplier with daily decay', () => {
      const result = calculateVotingPower({
        likeWindowCount: 21,
        curatorReputation: 10.0,
        alpha: 0.05
      })

      // baseWeight = 0.5, crMultiplier = 10.0
      // votingPower = 0.5 * 10.0 = 5.0
      expect(result.baseWeight).toBeCloseTo(0.5, 2)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.votingPower).toBeCloseTo(5.0, 1)
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

  describe('rapid penalty', () => {
    it('applies 0.1x penalty when rapid threshold exceeded', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0,
        recentLikeCount30s: 50,
        rapidPenaltyThreshold: 50,
        rapidPenaltyMultiplier: 0.1
      })

      expect(result.isRapid).toBe(true)
      expect(result.rapidPenaltyMultiplier).toBe(0.1)
      // votingPower = 1.0 (baseWeight) * 5.05 (CR) * 0.1 (rapid) = 0.505
      expect(result.votingPower).toBeCloseTo(0.505, 2)
    })

    it('does not apply penalty below threshold', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0,
        recentLikeCount30s: 49,
        rapidPenaltyThreshold: 50
      })

      expect(result.isRapid).toBe(false)
      expect(result.rapidPenaltyMultiplier).toBe(1.0)
    })

    it('treats undefined recentLikeCount30s as no rapid', () => {
      const result = calculateVotingPower({
        likeWindowCount: 1,
        curatorReputation: 1.0
      })

      expect(result.isRapid).toBe(false)
      expect(result.rapidPenaltyMultiplier).toBe(1.0)
    })

    it('combines all multipliers: decay × CR × rapid', () => {
      const result = calculateVotingPower({
        likeWindowCount: 21,
        curatorReputation: 10.0,
        recentLikeCount30s: 50,
        alpha: 0.05,
        rapidPenaltyThreshold: 50,
        rapidPenaltyMultiplier: 0.1
      })

      // baseWeight = 0.5, crMultiplier = 10.0, rapidMultiplier = 0.1
      // votingPower = 0.5 * 10.0 * 0.1 = 0.5
      expect(result.baseWeight).toBeCloseTo(0.5, 2)
      expect(result.crMultiplier).toBeCloseTo(10.0, 1)
      expect(result.rapidPenaltyMultiplier).toBe(0.1)
      expect(result.votingPower).toBeCloseTo(0.5, 1)
      expect(result.votingPowerPercent).toBe(50)
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

describe('CR_MULTIPLIER_TABLE', () => {
  it('exports reference table', () => {
    expect(CR_MULTIPLIER_TABLE).toBeInstanceOf(Array)
    expect(CR_MULTIPLIER_TABLE.length).toBe(6)
  })

  it('has correct structure', () => {
    for (const entry of CR_MULTIPLIER_TABLE) {
      expect(entry).toHaveProperty('cr')
      expect(entry).toHaveProperty('multiplier')
      expect(entry).toHaveProperty('level')
    }
  })

  it('has expected values', () => {
    const table = CR_MULTIPLIER_TABLE

    expect(table[0]).toEqual({ cr: 0.1, multiplier: 0.1, level: 'explorer' })
    expect(table[1]).toEqual({ cr: 0.5, multiplier: 3.56, level: 'finder' })
    expect(table[2]).toEqual({ cr: 1.0, multiplier: 5.05, level: 'finder' })
    expect(table[3]).toEqual({ cr: 2.0, multiplier: 6.54, level: 'curator' })
    expect(table[4]).toEqual({ cr: 5.0, multiplier: 8.52, level: 'archiver' })
    expect(table[5]).toEqual({ cr: 10.0, multiplier: 10.0, level: 'archiver' })
  })
})

describe('edge cases', () => {
  it('handles very high like count', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1000,
      curatorReputation: 1.0,
      alpha: 0.05
    })

    // w = 1 / (1 + 0.05 * 999) ≈ 0.0196
    expect(result.baseWeight).toBeGreaterThan(0)
    expect(result.baseWeight).toBeLessThan(0.03)
  })

  it('handles very low CR', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 0.01 // Below minCR
    })

    // Should still produce a valid result (clamped to minCR=0.1, which gives CRm=0.1)
    expect(result.crMultiplier).toBeGreaterThanOrEqual(0.1)
    expect(result.crMultiplier).toBeLessThanOrEqual(0.2)
  })

  it('handles very high CR', () => {
    const result = calculateVotingPower({
      likeWindowCount: 1,
      curatorReputation: 100 // Above maxCR
    })

    // Should be clamped to maxCR, which gives CRm=10.0
    expect(result.crMultiplier).toBeLessThanOrEqual(10.0)
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
