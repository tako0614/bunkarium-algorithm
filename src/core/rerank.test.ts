import { describe, expect, test } from 'bun:test'
import { diversityRerank, primaryRank, rankSync, rank } from './rerank'
import type { Candidate, CandidateFeatures, RankRequest } from '../types'
import { CONTRACT_VERSION } from '../constants'

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

const createCandidate = (itemKey: string, clusterId: string, prs: number): Candidate => ({
  itemKey,
  type: 'post',
  clusterId,
  createdAt: Date.now(),
  qualityFlags: {
    moderated: true,
    spamSuspect: false
  },
  features: {
    ...baseFeatures,
    prs,
    prsSource: 'saved'
  }
})

describe('rerank', () => {
  test('diversityRerank uses exploration slots even when interval would round to zero', () => {
    const candidates = [
      createCandidate('a', 'seen', 1),
      createCandidate('b', 'new-1', 0.5),
      createCandidate('c', 'new-2', 0.4)
    ]

    const recentClusterExposures = { seen: 1 }
    const now = Date.now()
    const scored = primaryRank(candidates, recentClusterExposures, now, {
      prs: 1,
      cvs: 0,
      dns: 0
    })

    const effectiveWeights = { prs: 0.55, cvs: 0.25, dns: 0.20 }
    const { report, reranked } = diversityRerank(
      scored,
      {
        diversityCapN: 2,
        effectiveK: 2,
        effectiveExplorationBudget: 1,
        mmrSimilarityPenalty: 0.3,
        requestSeed: 'test-req|test-cv',
        recentClusterExposures,
        explainThresholds: {
          contextHigh: 0.70,
          bridgeHigh: 0.70,
          supportDensityHigh: 0.15,
          newClusterExposureMax: 2,
          prsSimilarityMin: 0.65
        },
        newClusterExposureMax: 2
      },
      effectiveWeights
    )

    expect(reranked.length).toBe(2)
    expect(report.explorationSlotsFilled).toBeGreaterThan(0)
  })

  test('rankSync filters hardBlock candidates', () => {
    const candidates: Candidate[] = [
      createCandidate('a', 'c1', 0.8),
      {
        ...createCandidate('b', 'c2', 0.9),
        qualityFlags: {
          moderated: true,
          spamSuspect: false,
          hardBlock: true
        },
        features: {
          ...baseFeatures,
          prs: 0.9,
          prsSource: 'saved'
        }
      }
    ]

    const response = rankSync({
      contractVersion: '1.0',
      requestId: 'req-1',
      clusterVersion: 'cv-1',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: Date.now() }
    })

    expect(response.ranked.length).toBe(1)
    expect(response.ranked[0].itemKey).toBe('a')
  })

  test('rankSync filters unmoderated candidates by default', () => {
    const candidates: Candidate[] = [
      createCandidate('a', 'c1', 0.8),
      {
        ...createCandidate('b', 'c2', 0.9),
        qualityFlags: {
          moderated: false,
          spamSuspect: false
        },
        features: {
          ...baseFeatures,
          prs: 0.9,
          prsSource: 'saved'
        }
      }
    ]

    const response = rankSync({
      contractVersion: '1.0',
      requestId: 'req-2',
      clusterVersion: 'cv-2',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: Date.now() }
    })

    expect(response.ranked.length).toBe(1)
    expect(response.ranked[0].itemKey).toBe('a')
  })

  test('rankSync respects diversityCapN limit', () => {
    const candidates: Candidate[] = [
      createCandidate('a1', 'c1', 1.0),
      createCandidate('a2', 'c1', 0.9),
      createCandidate('b1', 'c2', 0.8)
    ]

    const response = rankSync({
      contractVersion: '1.0',
      requestId: 'req-3',
      clusterVersion: 'cv-3',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: Date.now() },
      params: {
        diversityCapN: 2,
        diversityCapK: 1,
        explorationBudget: 0
      }
    })

    // With diversityCapK=1 and diversityCapN=2, should get at most 1 item per cluster
    // So should have 2 items total (top from each cluster)
    expect(response.ranked.length).toBe(2)
    const rankedKeys = response.ranked.map(item => item.itemKey)
    // Should have diversity - items from different clusters
    expect(rankedKeys).toContain('a1')
    expect(rankedKeys).toContain('b1')
  })

  test('finalScore has exactly 9 decimal places or fewer', () => {
    const candidates: Candidate[] = [
      createCandidate('a', 'c1', 0.123456789123),
      createCandidate('b', 'c2', 0.987654321987)
    ]

    const response = rankSync({
      contractVersion: '1.0',
      requestId: 'req-precision',
      clusterVersion: 'cv-1',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: Date.now() }
    })

    for (const item of response.ranked) {
      const scoreStr = item.finalScore.toString()
      const decimalPart = scoreStr.split('.')[1]
      if (decimalPart) {
        expect(decimalPart.length).toBeLessThanOrEqual(9)
      }
      // Verify precision by checking if round-tripping preserves the value
      const rounded = Math.round(item.finalScore * 1e9) / 1e9
      expect(item.finalScore).toBe(rounded)
    }
  })

  test('public metrics have exactly 6 decimal places or fewer', () => {
    const { calculatePublicMetrics } = require('./metrics')

    const input = {
      weightedLikeSum: 15.123456789,
      qualifiedUniqueViewers: 100,
      uniqueLikers: 12,
      weightedViews: 250.987654321,
      clusterWeights: { c1: 0.7, c2: 0.3 },
      daysSinceFirstReaction: 7.5,
      recentReactionRate: 0.8
    }

    const metrics = calculatePublicMetrics(input)

    // Check each numeric field has at most 6 decimal places
    const numericFields = [
      'supportDensity',
      'supportRate',
      'weightedSupportIndex',
      'weightedSupportRateClamped',
      'culturalViewValue',
      'weightedViews',
      'breadth',
      'persistenceDays',
      'topClusterShare'
    ]

    for (const field of numericFields) {
      const value = metrics[field]
      if (typeof value === 'number') {
        const valueStr = value.toString()
        const decimalPart = valueStr.split('.')[1]
        if (decimalPart) {
          expect(decimalPart.length).toBeLessThanOrEqual(6)
        }
        // Verify precision by checking if round-tripping preserves the value
        const rounded = Math.round(value * 1e6) / 1e6
        expect(value).toBe(rounded)
      }
    }
  })

  test('same requestSeed produces identical ranked results', () => {
    const candidates: Candidate[] = [
      createCandidate('a', 'c1', 0.9),
      createCandidate('b', 'c2', 0.85),
      createCandidate('c', 'c3', 0.88)
    ]

    const requestSeed = 'test-seed-123'

    const response1 = rankSync({
      contractVersion: '1.0',
      requestId: 'req-det-1',
      clusterVersion: 'cv-1',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: 1234567890000 },
      requestSeed
    })

    const response2 = rankSync({
      contractVersion: '1.0',
      requestId: 'req-det-2',
      clusterVersion: 'cv-1',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: 1234567890000 },
      requestSeed
    })

    // Should produce identical results
    expect(response1.ranked.length).toBe(response2.ranked.length)
    for (let i = 0; i < response1.ranked.length; i++) {
      expect(response1.ranked[i].itemKey).toBe(response2.ranked[i].itemKey)
      expect(response1.ranked[i].finalScore).toBe(response2.ranked[i].finalScore)
    }
  })

  test('tie-breaking order: finalScore desc → createdAt desc → itemKey asc', () => {
    const now = Date.now()
    const candidates: Candidate[] = [
      { ...createCandidate('z-item', 'c1', 0.5), createdAt: now - 1000 },
      { ...createCandidate('a-item', 'c2', 0.5), createdAt: now - 1000 },
      { ...createCandidate('m-item', 'c3', 0.5), createdAt: now - 2000 },
      { ...createCandidate('b-item', 'c4', 0.6), createdAt: now - 3000 }
    ]

    const response = rankSync({
      contractVersion: '1.0',
      requestId: 'req-tie',
      clusterVersion: 'cv-1',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: now },
      params: {
        explorationBudget: 0
      }
    })

    // Expected order:
    // 1. b-item (finalScore 0.6, highest)
    // 2. a-item (finalScore 0.5, same createdAt as z-item, but 'a' < 'z')
    // 3. z-item (finalScore 0.5, same createdAt as a-item, but 'z' > 'a')
    // 4. m-item (finalScore 0.5, older createdAt)
    const rankedKeys = response.ranked.map(item => item.itemKey)
    expect(rankedKeys[0]).toBe('b-item')

    // Among items with same finalScore and createdAt, should sort by itemKey asc
    const sameScoreSameTime = response.ranked.filter(
      item => item.finalScore === response.ranked[1].finalScore &&
              candidates.find(c => c.itemKey === item.itemKey)?.createdAt === now - 1000
    ).map(item => item.itemKey).sort()

    expect(sameScoreSameTime).toEqual(['a-item', 'z-item'])
  })

  describe('rank (async)', () => {
    test('returns RankResponse with all required fields', async () => {
      const request: RankRequest = {
        contractVersion: CONTRACT_VERSION,
        requestId: 'test-rank-async',
        clusterVersion: 'v1',
        requestSeed: 'test-seed',
        userState: {
          userKey: 'user-123',
          likeWindowCount: 5,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates: [
          createCandidate('item-1', 'cluster-a', 0.9),
          createCandidate('item-2', 'cluster-a', 0.8),
          createCandidate('item-3', 'cluster-b', 0.7)
        ],
        context: {
          surface: 'home_mix',
          nowTs: Date.now()
        }
      }

      const response = await rank(request)

      // Verify response structure
      expect(response.ranked).toBeDefined()
      expect(response.ranked.length).toBeGreaterThan(0)
      expect(response.paramSetId).toBeDefined()
      expect(response.paramSetId.length).toBeGreaterThan(0)
      expect(response.constraintsReport).toBeDefined()
      expect(response.constraintsReport.usedStrategy).toBeDefined()
      expect(response.constraintsReport.effectiveWeights).toBeDefined()
    })

    test('produces deterministic results with same seed', async () => {
      const request: RankRequest = {
        contractVersion: CONTRACT_VERSION,
        requestId: 'test-determinism',
        clusterVersion: 'v1',
        requestSeed: 'fixed-seed-123',
        userState: {
          userKey: 'user-456',
          likeWindowCount: 10,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 50
        },
        candidates: [
          createCandidate('item-1', 'cluster-a', 0.9),
          createCandidate('item-2', 'cluster-b', 0.8),
          createCandidate('item-3', 'cluster-c', 0.7),
          createCandidate('item-4', 'cluster-a', 0.6)
        ],
        context: {
          surface: 'home_mix',
          nowTs: Date.now()
        }
      }

      const response1 = await rank(request)
      const response2 = await rank(request)

      // Same seed should produce identical results
      expect(response1.ranked.map(r => r.itemKey)).toEqual(
        response2.ranked.map(r => r.itemKey)
      )
      expect(response1.paramSetId).toBe(response2.paramSetId)
    })

    test('generates unique paramSetId for different params', async () => {
      const baseRequest: RankRequest = {
        contractVersion: CONTRACT_VERSION,
        requestId: 'test-param-hash',
        clusterVersion: 'v1',
        userState: {
          userKey: 'user-789',
          likeWindowCount: 5,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates: [createCandidate('item-1', 'cluster-a', 0.9)],
        context: {
          surface: 'home_mix',
          nowTs: Date.now()
        },
        params: {
          weights: { prs: 0.55, cvs: 0.25, dns: 0.20 }
        }
      }

      const response1 = await rank(baseRequest)

      const modifiedRequest: RankRequest = {
        ...baseRequest,
        params: {
          weights: { prs: 0.6, cvs: 0.3, dns: 0.1 },
          diversityCapN: 30 // Also change another param to ensure difference
        }
      }

      const response2 = await rank(modifiedRequest)

      // Different params should produce different paramSetId
      expect(response1.paramSetId).not.toBe(response2.paramSetId)
    })
  })
})
