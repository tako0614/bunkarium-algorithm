import { describe, expect, test } from 'bun:test'
import {
  determineReasonCodes,
  formatReasonCodes,
  generateDetailedExplanation,
  calculateContributionRates
} from './explain'
import type { Candidate, CandidateFeatures, ReasonCode } from '../types'
import { DEFAULT_EXPLAIN_THRESHOLDS } from '../types'

const baseFeatures: CandidateFeatures = {
  cvsComponents: {
    like: 0,
    context: 0,
    collection: 0,
    bridge: 0,
    sustain: 0
  },
  qualifiedUniqueViewers: 1
}

const createCandidate = (overrides?: Partial<Candidate>): Candidate => ({
  itemKey: 'item-1',
  type: 'post',
  clusterId: 'c1',
  createdAt: 0,
  qualityFlags: {
    moderated: true,
    spamSuspect: false
  },
  features: { ...baseFeatures },
  ...overrides
})

describe('explain', () => {
  describe('determineReasonCodes', () => {
    test('GROWING_CONTEXT triggers when context >= contextHigh', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            context: 0.75
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('GROWING_CONTEXT')
    })

    test('GROWING_CONTEXT does not trigger when context < contextHigh', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            context: 0.65
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('GROWING_CONTEXT')
    })

    test('BRIDGE_SUCCESS triggers when bridge >= bridgeHigh', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            bridge: 0.80
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('BRIDGE_SUCCESS')
    })

    test('BRIDGE_SUCCESS does not trigger when bridge < bridgeHigh', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            bridge: 0.60
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('BRIDGE_SUCCESS')
    })

    test('HIGH_SUPPORT_DENSITY triggers when supportDensity >= supportDensityHigh', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          publicMetricsHint: {
            supportDensity: 0.20
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('HIGH_SUPPORT_DENSITY')
    })

    test('HIGH_SUPPORT_DENSITY does not trigger when supportDensity < supportDensityHigh', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          publicMetricsHint: {
            supportDensity: 0.10
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('HIGH_SUPPORT_DENSITY')
    })

    test('HIGH_SUPPORT_DENSITY does not trigger when supportDensity is undefined', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          publicMetricsHint: undefined
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('HIGH_SUPPORT_DENSITY')
    })

    test('NEW_IN_CLUSTER triggers when exposure <= newClusterExposureMax', () => {
      const candidate = createCandidate({ clusterId: 'c1' })
      const recentClusterExposures = { c1: 2 }

      const codes = determineReasonCodes(candidate, recentClusterExposures)
      expect(codes).toContain('NEW_IN_CLUSTER')
    })

    test('NEW_IN_CLUSTER triggers when cluster has zero exposure', () => {
      const candidate = createCandidate({ clusterId: 'c1' })
      const recentClusterExposures = {}

      const codes = determineReasonCodes(candidate, recentClusterExposures)
      expect(codes).toContain('NEW_IN_CLUSTER')
    })

    test('NEW_IN_CLUSTER does not trigger when exposure > newClusterExposureMax', () => {
      const candidate = createCandidate({ clusterId: 'c1' })
      const recentClusterExposures = { c1: 5 }

      const codes = determineReasonCodes(candidate, recentClusterExposures)
      expect(codes).not.toContain('NEW_IN_CLUSTER')
    })

    test('SIMILAR_TO_SAVED triggers when prsSource is saved and prs >= prsSimilarityMin', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: 0.70,
          prsSource: 'saved'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('SIMILAR_TO_SAVED')
    })

    test('SIMILAR_TO_LIKED triggers when prsSource is liked and prs >= prsSimilarityMin', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: 0.75,
          prsSource: 'liked'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('SIMILAR_TO_LIKED')
    })

    test('FOLLOWING triggers when prsSource is following and prs >= prsSimilarityMin', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: 0.80,
          prsSource: 'following'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('FOLLOWING')
    })

    test('SIMILAR_TO_* does not trigger when prs < prsSimilarityMin', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: 0.50,
          prsSource: 'saved'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('SIMILAR_TO_SAVED')
    })

    test('SIMILAR_TO_* does not trigger when prs is undefined', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: undefined,
          prsSource: 'saved'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('SIMILAR_TO_SAVED')
    })

    test('TRENDING_IN_CLUSTER triggers as fallback when no other codes match', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            like: 0.3,
            context: 0.3,
            collection: 0.3,
            bridge: 0.3,
            sustain: 0.3
          }
        }
      })
      const recentClusterExposures = { c1: 10 }

      const codes = determineReasonCodes(candidate, recentClusterExposures)
      expect(codes).toContain('TRENDING_IN_CLUSTER')
    })

    test('TRENDING_IN_CLUSTER does not trigger when other codes match', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            context: 0.75
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('TRENDING_IN_CLUSTER')
    })

    test('priority order: GROWING_CONTEXT has highest priority', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            like: 0.5,
            context: 0.75,
            collection: 0.5,
            bridge: 0.75,
            sustain: 0.5
          },
          prs: 0.80,
          prsSource: 'saved',
          publicMetricsHint: {
            supportDensity: 0.20
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      // Should have multiple codes with GROWING_CONTEXT first
      expect(codes[0]).toBe('GROWING_CONTEXT')
      expect(codes).toContain('BRIDGE_SUCCESS')
      expect(codes).toContain('HIGH_SUPPORT_DENSITY')
    })

    test('priority order: BRIDGE_SUCCESS before HIGH_SUPPORT_DENSITY', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            bridge: 0.75
          },
          publicMetricsHint: {
            supportDensity: 0.20
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      const bridgeIndex = codes.indexOf('BRIDGE_SUCCESS')
      const densityIndex = codes.indexOf('HIGH_SUPPORT_DENSITY')
      expect(bridgeIndex).toBeLessThan(densityIndex)
    })

    test('priority order: HIGH_SUPPORT_DENSITY before NEW_IN_CLUSTER', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          publicMetricsHint: {
            supportDensity: 0.20
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      const densityIndex = codes.indexOf('HIGH_SUPPORT_DENSITY')
      const newIndex = codes.indexOf('NEW_IN_CLUSTER')
      expect(densityIndex).toBeLessThan(newIndex)
    })

    test('priority order: NEW_IN_CLUSTER before SIMILAR_TO_*', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: 0.70,
          prsSource: 'saved'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      const newIndex = codes.indexOf('NEW_IN_CLUSTER')
      const similarIndex = codes.indexOf('SIMILAR_TO_SAVED')
      expect(newIndex).toBeLessThan(similarIndex)
    })

    test('respects custom thresholds', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            context: 0.60
          }
        }
      })

      const customThresholds = {
        ...DEFAULT_EXPLAIN_THRESHOLDS,
        contextHigh: 0.50
      }

      const codes = determineReasonCodes(candidate, {}, customThresholds)
      expect(codes).toContain('GROWING_CONTEXT')
    })

    test('handles threshold boundary conditions exactly', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            context: 0.70
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('GROWING_CONTEXT')
    })

    test('handles multiple simultaneous reason codes', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            like: 0.5,
            context: 0.75,
            collection: 0.5,
            bridge: 0.80,
            sustain: 0.5
          },
          prs: 0.70,
          prsSource: 'saved',
          publicMetricsHint: {
            supportDensity: 0.20
          }
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes.length).toBeGreaterThan(1)
      expect(codes).toContain('GROWING_CONTEXT')
      expect(codes).toContain('BRIDGE_SUCCESS')
      expect(codes).toContain('HIGH_SUPPORT_DENSITY')
      expect(codes).toContain('NEW_IN_CLUSTER')
      expect(codes).toContain('SIMILAR_TO_SAVED')
    })

    test('handles edge case: all features are zero', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures
        }
      })
      const recentClusterExposures = { c1: 10 }

      const codes = determineReasonCodes(candidate, recentClusterExposures)
      expect(codes).toEqual(['TRENDING_IN_CLUSTER'])
    })

    test('handles edge case: missing publicMetricsHint entirely', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          cvsComponents: {
            ...baseFeatures.cvsComponents,
            context: 0.75
          }
        }
      })
      delete candidate.features.publicMetricsHint

      const codes = determineReasonCodes(candidate, {})
      expect(codes).toContain('GROWING_CONTEXT')
      expect(codes).not.toContain('HIGH_SUPPORT_DENSITY')
    })

    test('handles unknown prsSource gracefully', () => {
      const candidate = createCandidate({
        features: {
          ...baseFeatures,
          prs: 0.80,
          prsSource: 'unknown'
        }
      })

      const codes = determineReasonCodes(candidate, {})
      expect(codes).not.toContain('SIMILAR_TO_SAVED')
      expect(codes).not.toContain('SIMILAR_TO_LIKED')
      expect(codes).not.toContain('FOLLOWING')
    })
  })

  describe('formatReasonCodes', () => {
    test('converts single reason code to label', () => {
      const codes: ReasonCode[] = ['GROWING_CONTEXT']
      const formatted = formatReasonCodes(codes)
      expect(formatted).toEqual(['注釈が増えている'])
    })

    test('converts multiple reason codes to labels', () => {
      const codes: ReasonCode[] = ['GROWING_CONTEXT', 'BRIDGE_SUCCESS', 'HIGH_SUPPORT_DENSITY']
      const formatted = formatReasonCodes(codes)
      expect(formatted).toEqual([
        '注釈が増えている',
        '翻訳ブリッジで到達',
        '支持密度が高い'
      ])
    })

    test('converts all reason codes correctly', () => {
      const allCodes: ReasonCode[] = [
        'SIMILAR_TO_SAVED',
        'SIMILAR_TO_LIKED',
        'FOLLOWING',
        'GROWING_CONTEXT',
        'BRIDGE_SUCCESS',
        'DIVERSITY_SLOT',
        'EXPLORATION',
        'HIGH_SUPPORT_DENSITY',
        'TRENDING_IN_CLUSTER',
        'NEW_IN_CLUSTER'
      ]
      const formatted = formatReasonCodes(allCodes)
      expect(formatted.length).toBe(10)
      expect(formatted).toContain('あなたの保存した作品に近い')
      expect(formatted).toContain('あなたが支持した作品に近い')
      expect(formatted).toContain('フォロー中のユーザーから')
      expect(formatted).toContain('注釈が増えている')
      expect(formatted).toContain('翻訳ブリッジで到達')
      expect(formatted).toContain('多様性枠')
      expect(formatted).toContain('新しいシーンから')
      expect(formatted).toContain('支持密度が高い')
      expect(formatted).toContain('シーン内で注目')
      expect(formatted).toContain('シーンの新着')
    })

    test('handles empty array', () => {
      const codes: ReasonCode[] = []
      const formatted = formatReasonCodes(codes)
      expect(formatted).toEqual([])
    })
  })

  describe('generateDetailedExplanation', () => {
    test('generates explanation with all score factors', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.5,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0,
        finalScore: 1.0
      }
      const reasonCodes: ReasonCode[] = ['GROWING_CONTEXT']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.factors.length).toBe(3)
      expect(explanation.factors[0].name).toBe('PRS')
      expect(explanation.factors[0].value).toBe(0.5)
      expect(explanation.factors[1].name).toBe('CVS')
      expect(explanation.factors[1].value).toBe(0.3)
      expect(explanation.factors[2].name).toBe('DNS')
      expect(explanation.factors[2].value).toBe(0.2)
    })

    test('includes penalty factor when penalty > 0', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.5,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0.1,
        finalScore: 0.9
      }
      const reasonCodes: ReasonCode[] = ['GROWING_CONTEXT']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.factors.length).toBe(4)
      expect(explanation.factors[3].name).toBe('Penalty')
      expect(explanation.factors[3].value).toBe(-0.1)
      expect(explanation.factors[3].description).toBe('Quality penalties')
    })

    test('does not include penalty factor when penalty is 0', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.5,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0,
        finalScore: 1.0
      }
      const reasonCodes: ReasonCode[] = ['GROWING_CONTEXT']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.factors.length).toBe(3)
      expect(explanation.factors.every(f => f.name !== 'Penalty')).toBe(true)
    })

    test('generates humanReadable from reason codes', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.5,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0,
        finalScore: 1.0
      }
      const reasonCodes: ReasonCode[] = ['GROWING_CONTEXT', 'BRIDGE_SUCCESS']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.humanReadable).toEqual([
        '注釈が増えている',
        '翻訳ブリッジで到達'
      ])
    })

    test('summary identifies PRS as main factor when highest', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.8,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0,
        finalScore: 1.3
      }
      const reasonCodes: ReasonCode[] = ['SIMILAR_TO_SAVED']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.summary).toBe('Personal relevance is the main factor.')
    })

    test('summary identifies CVS as main factor when highest', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.2,
        cvs: 0.9,
        dns: 0.1,
        penalty: 0,
        finalScore: 1.2
      }
      const reasonCodes: ReasonCode[] = ['GROWING_CONTEXT']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.summary).toBe('Cultural value is the main factor.')
    })

    test('summary identifies DNS as main factor when highest', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.1,
        cvs: 0.2,
        dns: 0.8,
        penalty: 0,
        finalScore: 1.1
      }
      const reasonCodes: ReasonCode[] = ['NEW_IN_CLUSTER']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.summary).toBe('Diversity/novelty is the main factor.')
    })

    test('summary considers absolute value for penalties', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0.1,
        cvs: 0.1,
        dns: 0.1,
        penalty: 0.5,
        finalScore: -0.2
      }
      const reasonCodes: ReasonCode[] = ['TRENDING_IN_CLUSTER']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.summary).toBe('Quality penalties is the main factor.')
    })

    test('handles all zero scores', () => {
      const candidate = createCandidate()
      const scoreBreakdown = {
        prs: 0,
        cvs: 0,
        dns: 0,
        penalty: 0,
        finalScore: 0
      }
      const reasonCodes: ReasonCode[] = ['TRENDING_IN_CLUSTER']

      const explanation = generateDetailedExplanation(candidate, scoreBreakdown, reasonCodes)

      expect(explanation.summary).toContain('is the main factor.')
      expect(explanation.factors.length).toBe(3)
    })
  })

  describe('calculateContributionRates', () => {
    test('calculates percentages for non-zero scores', () => {
      const breakdown = {
        prs: 0.55,
        cvs: 0.25,
        dns: 0.20,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      expect(rates.prs).toBe(55)
      expect(rates.cvs).toBe(25)
      expect(rates.dns).toBe(20)
    })

    test('rounds to nearest integer', () => {
      const breakdown = {
        prs: 0.333,
        cvs: 0.333,
        dns: 0.334,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      expect(rates.prs).toBe(33)
      expect(rates.cvs).toBe(33)
      expect(rates.dns).toBe(33)
    })

    test('handles zero total gracefully', () => {
      const breakdown = {
        prs: 0,
        cvs: 0,
        dns: 0,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      expect(rates.prs).toBe(0)
      expect(rates.cvs).toBe(0)
      expect(rates.dns).toBe(0)
    })

    test('ignores penalty in calculation', () => {
      const breakdown = {
        prs: 0.5,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0.5
      }

      const rates = calculateContributionRates(breakdown)

      // Total should be prs + cvs + dns = 1.0
      expect(rates.prs).toBe(50)
      expect(rates.cvs).toBe(30)
      expect(rates.dns).toBe(20)
    })

    test('handles very small values', () => {
      const breakdown = {
        prs: 0.001,
        cvs: 0.001,
        dns: 0.001,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      expect(rates.prs).toBe(33)
      expect(rates.cvs).toBe(33)
      expect(rates.dns).toBe(33)
    })

    test('handles very large values', () => {
      const breakdown = {
        prs: 100,
        cvs: 50,
        dns: 50,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      expect(rates.prs).toBe(50)
      expect(rates.cvs).toBe(25)
      expect(rates.dns).toBe(25)
    })

    test('handles negative values in total calculation', () => {
      const breakdown = {
        prs: -0.5,
        cvs: 0.3,
        dns: 0.2,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      // Total is 0, should return all zeros
      expect(rates.prs).toBe(0)
      expect(rates.cvs).toBe(0)
      expect(rates.dns).toBe(0)
    })

    test('calculates correct percentages with unequal distribution', () => {
      const breakdown = {
        prs: 0.7,
        cvs: 0.2,
        dns: 0.1,
        penalty: 0
      }

      const rates = calculateContributionRates(breakdown)

      expect(rates.prs).toBe(70)
      expect(rates.cvs).toBe(20)
      expect(rates.dns).toBe(10)
    })
  })
})
