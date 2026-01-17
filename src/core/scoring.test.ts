import { describe, expect, test } from 'bun:test'
import { calculateDNS, calculatePenalty } from './scoring'
import type { Candidate } from '../types'

const baseCandidate: Candidate = {
  itemKey: 'item-1',
  type: 'post',
  clusterId: 'c1',
  createdAt: 0,
  features: {
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
}

describe('scoring', () => {
  test('calculateDNS - clamps future timestamps to zero age', () => {
    const now = Date.now()
    const candidate: Candidate = {
      ...baseCandidate,
      createdAt: now + 60 * 60 * 1000
    }

    const score = calculateDNS(candidate, {}, now)
    expect(score).toBeLessThanOrEqual(1)
  })

  test('calculatePenalty - penalizes spam content only', () => {
    const candidate: Candidate = {
      ...baseCandidate,
      features: {
        ...baseCandidate.features,
        qualityFlags: {
          moderated: false,
          spamSuspect: true
        }
      }
    }

    const penalty = calculatePenalty(candidate)
    expect(penalty).toBe(0.5)
  })
})
