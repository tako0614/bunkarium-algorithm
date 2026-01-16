import { describe, expect, test } from 'bun:test'
import { diversityRerank, primaryRank } from './rerank'
import type { Candidate } from '../types'

const baseFeatures = {
  cvsComponents: {
    likeSignal: 0,
    contextSignal: 0,
    collectionSignal: 0,
    bridgeSignal: 0,
    sustainSignal: 0
  },
  uniqueViews: 1,
  qualityFlags: {
    moderated: true,
    nsfw: false,
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
})
