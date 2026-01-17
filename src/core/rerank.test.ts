import { describe, expect, test } from 'bun:test'
import { diversityRerank, primaryRank, rank } from './rerank'
import type { Candidate } from '../types'

const baseFeatures = {
  cvsComponents: {
    likeSignal: 0,
    contextSignal: 0,
    collectionSignal: 0,
    bridgeSignal: 0,
    sustainSignal: 0
  },
  qualifiedUniqueViews: 1,
  qualityFlags: {
    moderated: true,
    spamSuspect: false
  }
}

const createCandidate = (itemKey: string, clusterId: string, prs: number): Candidate => ({
  itemKey,
  type: 'post',
  clusterId,
  createdAt: Date.now(),
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

    const { report, reranked } = diversityRerank(scored, recentClusterExposures, {
      diversityCapN: 2,
      diversityCapK: 2,
      explorationBudget: 1
    })

    expect(reranked.length).toBe(2)
    expect(report.explorationSlotsUsed).toBeGreaterThan(0)
  })

  test('rank filters hardBlock candidates', () => {
    const candidates: Candidate[] = [
      createCandidate('a', 'c1', 0.8),
      {
        ...createCandidate('b', 'c2', 0.9),
        features: {
          ...baseFeatures,
          qualityFlags: {
            moderated: true,
            spamSuspect: false,
            hardBlock: true
          },
          prs: 0.9,
          prsSource: 'saved'
        }
      }
    ]

    const response = rank({
      contractVersion: '1.0',
      requestId: 'req-1',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentLikeCount30s: 0,
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

  test('rank filters unmoderated candidates by default', () => {
    const candidates: Candidate[] = [
      createCandidate('a', 'c1', 0.8),
      {
        ...createCandidate('b', 'c2', 0.9),
        features: {
          ...baseFeatures,
          qualityFlags: {
            moderated: false,
            spamSuspect: false
          },
          prs: 0.9,
          prsSource: 'saved'
        }
      }
    ]

    const response = rank({
      contractVersion: '1.0',
      requestId: 'req-2',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentLikeCount30s: 0,
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

  test('rank keeps at least one candidate per cluster when configured', () => {
    const candidates: Candidate[] = [
      createCandidate('a1', 'c1', 1.0),
      createCandidate('a2', 'c1', 0.9),
      createCandidate('b1', 'c2', 0.1)
    ]

    const response = rank({
      contractVersion: '1.0',
      requestId: 'req-3',
      userState: {
        userKey: 'user-1',
        likeWindowCount: 0,
        recentLikeCount30s: 0,
        recentClusterExposures: {},
        diversitySlider: 0.5,
        curatorReputation: 1.0,
        cpEarned90d: 0
      },
      candidates,
      context: { surface: 'home_mix', nowTs: Date.now() },
      params: {
        rerankMaxCandidates: 2,
        rerankMinCandidatesPerCluster: 1,
        diversityCapN: 2,
        diversityCapK: 2,
        explorationBudget: 0
      }
    })

    const rankedKeys = response.ranked.map(item => item.itemKey)
    expect(rankedKeys).toContain('b1')
  })
})
