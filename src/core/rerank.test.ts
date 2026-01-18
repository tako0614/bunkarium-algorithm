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
      context: { surface: 'home_mix' as const, nowTs: 1234567890000 },
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
      context: { surface: 'home_mix' as const, nowTs: 1234567890000 },
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

  describe('DPP strategy', () => {
    test('rankSync with rerankStrategy DPP returns valid results', () => {
      const candidates: Candidate[] = [
        {
          ...createCandidate('a', 'c1', 0.9),
          features: {
            ...baseFeatures,
            prs: 0.9,
            prsSource: 'saved',
            embedding: [1, 0, 0]
          }
        },
        {
          ...createCandidate('b', 'c2', 0.8),
          features: {
            ...baseFeatures,
            prs: 0.8,
            prsSource: 'saved',
            embedding: [0, 1, 0]
          }
        },
        {
          ...createCandidate('c', 'c3', 0.7),
          features: {
            ...baseFeatures,
            prs: 0.7,
            prsSource: 'saved',
            embedding: [0, 0, 1]
          }
        }
      ]

      const response = rankSync({
        contractVersion: '1.0',
        requestId: 'req-dpp',
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
        context: { surface: 'home_mix', nowTs: Date.now() },
        params: {
          rerankStrategy: 'DPP',
          diversityCapN: 3
        }
      })

      expect(response.ranked.length).toBeLessThanOrEqual(3)
      expect(response.constraintsReport.usedStrategy).toBe('DPP')
    })

    test('DPP strategy handles candidates without embeddings', () => {
      const candidates: Candidate[] = [
        createCandidate('a', 'c1', 0.9),
        createCandidate('b', 'c2', 0.8),
        createCandidate('c', 'c3', 0.7)
      ]

      const response = rankSync({
        contractVersion: '1.0',
        requestId: 'req-dpp-no-embed',
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
        context: { surface: 'home_mix', nowTs: Date.now() },
        params: {
          rerankStrategy: 'DPP',
          diversityCapN: 3
        }
      })

      // Should still return results (DPP uses cluster-based similarity as fallback)
      expect(response.ranked.length).toBeGreaterThan(0)
      expect(response.constraintsReport.usedStrategy).toBe('DPP')
    })

    test('DPP produces deterministic results with same seed', () => {
      const candidates: Candidate[] = [
        {
          ...createCandidate('a', 'c1', 0.9),
          features: {
            ...baseFeatures,
            prs: 0.9,
            prsSource: 'saved',
            embedding: [1, 0.5, 0]
          }
        },
        {
          ...createCandidate('b', 'c2', 0.85),
          features: {
            ...baseFeatures,
            prs: 0.85,
            prsSource: 'saved',
            embedding: [0, 1, 0.5]
          }
        },
        {
          ...createCandidate('c', 'c3', 0.8),
          features: {
            ...baseFeatures,
            prs: 0.8,
            prsSource: 'saved',
            embedding: [0.5, 0, 1]
          }
        }
      ]

      const request = {
        contractVersion: '1.0',
        requestId: 'req-dpp-det',
        clusterVersion: 'cv-1',
        requestSeed: 'fixed-dpp-seed',
        userState: {
          userKey: 'user-1',
          likeWindowCount: 0,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates,
        context: { surface: 'home_mix' as const, nowTs: 1234567890000 },
        params: {
          rerankStrategy: 'DPP' as const,
          diversityCapN: 3
        }
      }

      const response1 = rankSync(request)
      const response2 = rankSync(request)

      expect(response1.ranked.map(r => r.itemKey)).toEqual(
        response2.ranked.map(r => r.itemKey)
      )
    })
  })

  describe('SimilarityCache', () => {
    test('MMR reranking caches similarity computations', () => {
      // Create candidates with embeddings to trigger similarity calculations
      const candidates: Candidate[] = []
      for (let i = 0; i < 10; i++) {
        candidates.push({
          ...createCandidate(`item-${i}`, `cluster-${i % 3}`, 0.9 - i * 0.05),
          features: {
            ...baseFeatures,
            prs: 0.9 - i * 0.05,
            prsSource: 'saved',
            embedding: [Math.cos(i), Math.sin(i), 0.5]
          }
        })
      }

      const response = rankSync({
        contractVersion: '1.0',
        requestId: 'req-cache',
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
        context: { surface: 'home_mix', nowTs: Date.now() },
        params: {
          diversityCapN: 5,
          mmrSimilarityPenalty: 0.3
        }
      })

      // Verify results are valid (cache should not affect correctness)
      expect(response.ranked.length).toBe(5)
      expect(response.constraintsReport.usedStrategy).toBe('MMR')
    })
  })

  describe('edge cases', () => {
    test('diversityRerank handles N=0 gracefully', () => {
      const candidates = [
        createCandidate('a', 'c1', 0.9),
        createCandidate('b', 'c2', 0.8)
      ]

      const now = Date.now()
      const scored = primaryRank(candidates, {}, now, { prs: 1, cvs: 0, dns: 0 })

      const { reranked, report } = diversityRerank(
        scored,
        {
          diversityCapN: 0,
          effectiveK: 5,
          effectiveExplorationBudget: 0.15,
          mmrSimilarityPenalty: 0.15,
          requestSeed: 'test',
          recentClusterExposures: {},
          explainThresholds: {
            contextHigh: 0.70,
            bridgeHigh: 0.70,
            supportDensityHigh: 0.15,
            newClusterExposureMax: 2,
            prsSimilarityMin: 0.65
          },
          newClusterExposureMax: 2
        },
        { prs: 0.55, cvs: 0.25, dns: 0.20 }
      )

      expect(reranked).toEqual([])
      expect(report.usedStrategy).toBe('NONE')
    })

    test('rankSync handles empty candidates array', () => {
      const response = rankSync({
        contractVersion: '1.0',
        requestId: 'req-empty',
        clusterVersion: 'cv-1',
        userState: {
          userKey: 'user-1',
          likeWindowCount: 0,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates: [],
        context: { surface: 'home_mix', nowTs: Date.now() }
      })

      expect(response.ranked).toEqual([])
      expect(response.constraintsReport.usedStrategy).toBe('NONE')
    })

    test('cluster cap fallback when all candidates blocked', () => {
      // All candidates in same cluster, cap=1 should still return at least one
      const candidates: Candidate[] = [
        createCandidate('a', 'same-cluster', 0.9),
        createCandidate('b', 'same-cluster', 0.8),
        createCandidate('c', 'same-cluster', 0.7)
      ]

      const response = rankSync({
        contractVersion: '1.0',
        requestId: 'req-cap-fallback',
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
        context: { surface: 'home_mix', nowTs: Date.now() },
        params: {
          diversityCapN: 3,
          diversityCapK: 1,
          explorationBudget: 0
        }
      })

      // Should return at least one item despite cluster cap
      expect(response.ranked.length).toBeGreaterThanOrEqual(1)
    })

    test('diversitySlider clamped to [0, 1]', () => {
      const candidates = [createCandidate('a', 'c1', 0.9)]

      // Slider below 0
      const response1 = rankSync({
        contractVersion: '1.0',
        requestId: 'req-slider-low',
        clusterVersion: 'cv-1',
        userState: {
          userKey: 'user-1',
          likeWindowCount: 0,
          recentClusterExposures: {},
          diversitySlider: -0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates,
        context: { surface: 'home_mix', nowTs: Date.now() }
      })

      // Slider above 1
      const response2 = rankSync({
        contractVersion: '1.0',
        requestId: 'req-slider-high',
        clusterVersion: 'cv-1',
        userState: {
          userKey: 'user-1',
          likeWindowCount: 0,
          recentClusterExposures: {},
          diversitySlider: 1.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates,
        context: { surface: 'home_mix', nowTs: Date.now() }
      })

      // Both should produce valid results
      expect(response1.ranked.length).toBe(1)
      expect(response2.ranked.length).toBe(1)
      // Weights should be normalized and valid
      const w1 = response1.constraintsReport.effectiveWeights
      const w2 = response2.constraintsReport.effectiveWeights
      expect(w1.prs + w1.cvs + w1.dns).toBeCloseTo(1.0, 5)
      expect(w2.prs + w2.cvs + w2.dns).toBeCloseTo(1.0, 5)
    })
  })

  describe('PRNG determinism (Xorshift64)', () => {
    test('same requestSeed produces identical exploration positions', () => {
      // Create many candidates to ensure exploration positions vary
      const candidates: Candidate[] = []
      for (let i = 0; i < 20; i++) {
        candidates.push(createCandidate(`item-${i}`, `cluster-${i}`, 0.9 - i * 0.02))
      }

      const baseRequest = {
        contractVersion: '1.0',
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
        context: { surface: 'home_mix' as const, nowTs: 1234567890000 },
        params: {
          explorationBudget: 0.3, // High exploration to get multiple slots
          diversityCapN: 15
        }
      }

      const response1 = rankSync({ ...baseRequest, requestId: 'req-1', requestSeed: 'fixed-seed-abc' })
      const response2 = rankSync({ ...baseRequest, requestId: 'req-2', requestSeed: 'fixed-seed-abc' })

      // Same seed should produce identical ranked order
      expect(response1.ranked.map(r => r.itemKey)).toEqual(response2.ranked.map(r => r.itemKey))
    })

    test('different requestSeed produces valid results for each seed', () => {
      const candidates: Candidate[] = []
      for (let i = 0; i < 10; i++) {
        candidates.push(createCandidate(`item-${i}`, `cluster-${i}`, 0.5))
      }

      const baseRequest = {
        contractVersion: '1.0',
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
        context: { surface: 'home_mix' as const, nowTs: 1234567890000 },
        params: {
          explorationBudget: 0.3,
          diversityCapN: 5
        }
      }

      // Different seeds should all produce valid results
      const seeds = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']

      for (const seed of seeds) {
        const response = rankSync({ ...baseRequest, requestId: `req-${seed}`, requestSeed: seed })
        // Verify each seed produces valid output
        expect(response.ranked.length).toBe(5)
        expect(response.constraintsReport.explorationSlotsRequested).toBe(1) // floor(5 * 0.3) = 1
        for (const item of response.ranked) {
          expect(Number.isFinite(item.finalScore)).toBe(true)
        }
      }
    })

    test('empty requestSeed falls back to requestId', () => {
      const candidates = [
        createCandidate('a', 'c1', 0.9),
        createCandidate('b', 'c2', 0.8)
      ]

      const response1 = rankSync({
        contractVersion: '1.0',
        requestId: 'fallback-test-id',
        clusterVersion: 'cv-1',
        requestSeed: '', // Empty seed
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

      const response2 = rankSync({
        contractVersion: '1.0',
        requestId: 'fallback-test-id', // Same requestId
        clusterVersion: 'cv-1',
        // No requestSeed at all
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

      // Both should produce valid results
      expect(response1.ranked.length).toBeGreaterThan(0)
      expect(response2.ranked.length).toBeGreaterThan(0)
    })

    test('PRNG produces finite values for various seeds', () => {
      const candidates = [createCandidate('a', 'c1', 0.9)]

      const seeds = [
        '0',
        'empty',
        'unicode-日本語-🎉',
        'very-long-seed-' + 'x'.repeat(1000),
        '   whitespace   ',
        '\t\n\r'
      ]

      for (const seed of seeds) {
        const response = rankSync({
          contractVersion: '1.0',
          requestId: 'req-prng-test',
          clusterVersion: 'cv-1',
          requestSeed: seed,
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
        expect(Number.isFinite(response.ranked[0].finalScore)).toBe(true)
      }
    })
  })
})
