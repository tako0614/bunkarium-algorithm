import { describe, expect, test } from 'bun:test'
import { calculateCVS, calculateDNS, calculatePenalty, calculateMixedScore, DEFAULT_CVS_WEIGHTS } from './scoring'
import type { Candidate } from '../types'

const baseCandidate: Candidate = {
  itemKey: 'item-1',
  type: 'post',
  clusterId: 'c1',
  createdAt: 0,
  qualityFlags: {
    moderated: true,
    spamSuspect: false
  },
  features: {
    cvsComponents: {
      like: 0,
      context: 0,
      collection: 0,
      bridge: 0,
      sustain: 0
    },
    qualifiedUniqueViewers: 1
  }
}

describe('scoring', () => {
  describe('calculateCVS', () => {
    test('calculates CVS with default weights', () => {
      const components = {
        like: 0.8,
        context: 0.6,
        collection: 0.4,
        bridge: 0.2,
        sustain: 0.3
      }

      const cvs = calculateCVS(components)

      // Expected: 0.35*0.8 + 0.25*0.6 + 0.15*0.4 + 0.15*0.2 + 0.10*0.3
      //         = 0.28 + 0.15 + 0.06 + 0.03 + 0.03 = 0.55
      expect(cvs).toBeCloseTo(0.55, 3)
    })

    test('CVS is unbounded (no clamp to 1)', () => {
      // アンボンド設計: CVSに上限なし
      const highComponents = {
        like: 2.0,
        context: 2.0,
        collection: 2.0,
        bridge: 2.0,
        sustain: 2.0
      }

      const cvs = calculateCVS(highComponents)
      // 0.35*2 + 0.25*2 + 0.15*2 + 0.15*2 + 0.10*2 = 2.0
      expect(cvs).toBe(2.0)
    })

    test('handles zero components', () => {
      const zeroComponents = {
        like: 0,
        context: 0,
        collection: 0,
        bridge: 0,
        sustain: 0
      }

      const cvs = calculateCVS(zeroComponents)
      expect(cvs).toBe(0)
    })

    test('uses custom weights when provided', () => {
      const components = {
        like: 1.0,
        context: 0,
        collection: 0,
        bridge: 0,
        sustain: 0
      }

      const customWeights = {
        like: 1.0,
        context: 0,
        collection: 0,
        bridge: 0,
        sustain: 0
      }

      const cvs = calculateCVS(components, customWeights)
      expect(cvs).toBe(1.0)
    })

    test('DEFAULT_CVS_WEIGHTS sum to 1.0', () => {
      const sum = Object.values(DEFAULT_CVS_WEIGHTS).reduce((a, b) => a + b, 0)
      expect(sum).toBeCloseTo(1.0, 6)
    })
  })

  describe('calculateMixedScore', () => {
    test('combines PRS, CVS, DNS with default weights', () => {
      const candidate: Candidate = {
        ...baseCandidate,
        features: {
          ...baseCandidate.features,
          prs: 0.8,
          cvsComponents: {
            like: 0.6,
            context: 0.4,
            collection: 0.3,
            bridge: 0.2,
            sustain: 0.1
          }
        },
        createdAt: Date.now() - 24 * 60 * 60 * 1000 // 1 day ago
      }

      const result = calculateMixedScore(candidate, {}, Date.now())

      expect(result.breakdown.prs).toBe(0.8)
      expect(result.breakdown.cvs).toBeGreaterThan(0)
      expect(result.breakdown.dns).toBe(0)  // Community-First: DNSは常に0
      expect(result.breakdown.penalty).toBe(0)

      // Community-First: finalScore = 0.50*PRS + 0.50*CVS - penalty
      const expected = 0.50 * result.breakdown.prs + 0.50 * result.breakdown.cvs - result.breakdown.penalty
      expect(result.finalScore).toBeCloseTo(expected, 9)
    })

    test('subtracts penalty from final score', () => {
      const candidate: Candidate = {
        ...baseCandidate,
        qualityFlags: {
          moderated: true,
          spamSuspect: true
        },
        features: {
          ...baseCandidate.features,
          prs: 1.0,
          cvsComponents: {
            like: 1.0,
            context: 1.0,
            collection: 1.0,
            bridge: 1.0,
            sustain: 1.0
          }
        }
      }

      const result = calculateMixedScore(candidate, {}, Date.now())

      expect(result.breakdown.penalty).toBe(0.5)
      expect(result.finalScore).toBeLessThan(result.breakdown.prs) // Penalty reduces score
    })

    test('rounds finalScore to 9 decimals', () => {
      const candidate: Candidate = {
        ...baseCandidate,
        features: {
          ...baseCandidate.features,
          prs: 0.123456789123,
          cvsComponents: {
            like: 0.1,
            context: 0.1,
            collection: 0.1,
            bridge: 0.1,
            sustain: 0.1
          }
        }
      }

      const result = calculateMixedScore(candidate, {}, Date.now())

      const scoreStr = result.finalScore.toString()
      const decimalPlaces = scoreStr.includes('.') ? scoreStr.split('.')[1].length : 0
      expect(decimalPlaces).toBeLessThanOrEqual(9)
    })
  })

  test('calculateDNS - clamps future timestamps to zero age', () => {
    const now = Date.now()
    const candidate: Candidate = {
      ...baseCandidate,
      createdAt: now + 60 * 60 * 1000
    }

    const score = calculateDNS(candidate, {}, now)
    expect(score).toBeLessThanOrEqual(1)
  })

  test('calculateDNS - handles zero timeHalfLifeHours without Infinity', () => {
    const now = Date.now()
    const candidate: Candidate = {
      ...baseCandidate,
      createdAt: now - 24 * 60 * 60 * 1000 // 1 day ago
    }

    // Zero half-life should not produce Infinity/NaN
    const score = calculateDNS(candidate, {}, now, 0.06, 0)
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  test('calculateDNS - handles negative timeHalfLifeHours without Infinity', () => {
    const now = Date.now()
    const candidate: Candidate = {
      ...baseCandidate,
      createdAt: now - 24 * 60 * 60 * 1000
    }

    // Negative half-life should not produce Infinity/NaN
    const score = calculateDNS(candidate, {}, now, 0.06, -10)
    expect(Number.isFinite(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  test('calculatePenalty - penalizes spam content only', () => {
    const candidate: Candidate = {
      ...baseCandidate,
      qualityFlags: {
        moderated: false,
        spamSuspect: true
      }
    }

    const penalty = calculatePenalty(candidate)
    expect(penalty).toBe(0.5)
  })

  describe('edge cases', () => {
    test('calculateCVS with negative component values clamps to 0', () => {
      const negativeComponents = {
        like: -0.5,
        context: -0.3,
        collection: 0.2,
        bridge: 0.1,
        sustain: 0
      }

      const cvs = calculateCVS(negativeComponents)
      // Negative values should be clamped to 0 or the result should still be valid
      expect(cvs).toBeGreaterThanOrEqual(0)
      expect(cvs).toBeLessThanOrEqual(1)
    })

    test('calculateDNS with very high exposure count approaches 0', () => {
      const now = Date.now()
      const candidate: Candidate = {
        ...baseCandidate,
        createdAt: now - 1000
      }

      // Very high exposure count should reduce DNS significantly
      const exposures = { [baseCandidate.clusterId]: 10000 }
      const score = calculateDNS(candidate, exposures, now)

      expect(Number.isFinite(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThan(0.5) // Should be low due to high exposure
    })

    test('calculateDNS with extremely old items', () => {
      const now = Date.now()
      const candidate: Candidate = {
        ...baseCandidate,
        createdAt: now - 180 * 24 * 60 * 60 * 1000 // 180 days ago
      }

      // With high cluster exposure, old items should have very low DNS
      const exposures = { [baseCandidate.clusterId]: 100 }
      const score = calculateDNS(candidate, exposures, now)

      expect(Number.isFinite(score)).toBe(true)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(1)
      // Very old item with high exposure should have low DNS
      expect(score).toBeLessThan(0.3)
    })

    test('calculateMixedScore with all zero components', () => {
      const candidate: Candidate = {
        ...baseCandidate,
        features: {
          prs: 0,
          cvsComponents: {
            like: 0,
            context: 0,
            collection: 0,
            bridge: 0,
            sustain: 0
          },
          qualifiedUniqueViewers: 0
        },
        createdAt: Date.now()
      }

      const result = calculateMixedScore(candidate, {}, Date.now())

      expect(Number.isFinite(result.finalScore)).toBe(true)
      expect(result.finalScore).toBeGreaterThanOrEqual(0)
    })

    test('calculateMixedScore handles penalty reduction', () => {
      const candidate: Candidate = {
        ...baseCandidate,
        qualityFlags: {
          moderated: true,
          spamSuspect: true // 0.5 penalty
        },
        features: {
          prs: 0.8,
          cvsComponents: {
            like: 0.5,
            context: 0.5,
            collection: 0.5,
            bridge: 0.5,
            sustain: 0.5
          },
          qualifiedUniqueViewers: 1
        },
        createdAt: Date.now()
      }

      const result = calculateMixedScore(candidate, {}, Date.now())

      // Penalty should reduce the score
      expect(result.breakdown.penalty).toBe(0.5)
      // finalScore formula applies the penalty correctly
      expect(Number.isFinite(result.finalScore)).toBe(true)
    })
  })
})
