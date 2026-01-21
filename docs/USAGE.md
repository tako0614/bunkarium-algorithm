# Usage Guide

## Installation

```bash
# Bun
bun add @bunkarium/algorithm

# npm
npm install @bunkarium/algorithm

# pnpm
pnpm add @bunkarium/algorithm
```

## Quick Start

### Basic Ranking

```typescript
import { rank, CONTRACT_VERSION } from '@bunkarium/algorithm'

const request = {
  contractVersion: CONTRACT_VERSION,
  clusterVersion: 'v1.0',
  requestId: crypto.randomUUID(),
  requestSeed: 'stable-seed-123',

  userState: {
    userKey: 'user-123',
    likeWindowCount: 15,
    recentLikeCount30s: 2,
    recentClusterExposures: {
      'tech': 5,
      'art': 2
    },
    diversitySlider: 0.5,
    curatorReputation: 1.2,
    cpEarned90d: 50
  },

  candidates: [
    {
      itemKey: 'post-1',
      type: 'post',
      clusterId: 'tech',
      createdAt: Date.now() - 3600000, // 1 hour ago
      qualityFlags: {
        moderated: true
      },
      features: {
        cvsComponents: {
          like: 0.8,
          context: 0.3,
          collection: 0.1,
          bridge: 0.05,
          sustain: 0.2
        },
        qualifiedUniqueViewers: 150
      }
    },
    // ...more candidates
  ],

  context: {
    surface: 'home_mix',
    nowTs: Date.now()
  },

  params: {
    weights: { prs: 0.70, cvs: 0.30 }
  }
}

const response = await rank(request)

console.log(response.ranked)
// [
//   {
//     itemKey: 'post-42',
//     finalScore: 0.876543210,
//     reasonCodes: ['HIGH_CVS', 'BRIDGE_SIGNAL'],
//     scoreBreakdown: { prs: 0.6, cvs: 0.9, penalty: 1.0 }
//   },
//   ...
// ]
```

---

## Core Primitives

### Like Decay

Calculate how much a user's next like is worth:

```typescript
import { calculateLikeWeight, predictNextLikeWeight } from '@bunkarium/algorithm'

// Current like weight
const current = calculateLikeWeight({
  likeWindowCount: 10,
  alpha: 0.05
})
console.log(current.weight) // ~0.689
console.log(current.supportPowerPercent) // 68.9%

// Predict next like
const next = predictNextLikeWeight({
  likeWindowCount: 10,
  alpha: 0.05
})
console.log(next.weight) // ~0.667
```

With rapid penalty:

```typescript
const rapid = calculateLikeWeight({
  likeWindowCount: 10,
  recentLikeCount30s: 60, // Exceeded threshold!
  rapidPenaltyThreshold: 50,
  rapidPenaltyMultiplier: 0.1
})
console.log(rapid.weight) // ~0.0689 (10% of normal)
console.log(rapid.rapidPenaltyApplied) // true
```

### Weighted Like Aggregation

Combine multiple likes with CR multipliers:

```typescript
import { calculateWeightedLikeSignal, getCRMultiplier } from '@bunkarium/algorithm'

const likes = [
  { likeWeight: 1.0, curatorReputation: 2.0 },
  { likeWeight: 0.8, curatorReputation: 1.5 },
  { likeWeight: 0.6, curatorReputation: 0.5 }
]

const totalSignal = calculateWeightedLikeSignal(
  likes.map(l => ({
    likeWeight: l.likeWeight,
    crMultiplier: getCRMultiplier(l.curatorReputation)
  }))
)
console.log(totalSignal) // ~3.12
```

### Public Metrics

Calculate cultural impact metrics:

```typescript
import { calculatePublicMetrics } from '@bunkarium/algorithm'

const metrics = calculatePublicMetrics({
  weightedLikeSum: 45.5,
  uniqueLikers: 30,
  qualifiedUniqueViewers: 150,
  weightedViews: 220.5,
  clusterWeights: {
    'tech': 20.0,
    'art': 15.5,
    'music': 10.0
  },
  daysSinceFirstReaction: 5,
  recentReactionRate: 0.6
}, {
  beta: 1.0,
  priorViews: 10,
  priorLikes: 1,
  priorUniqueLikers: 1,
  halfLifeDays: 14
})

console.log(metrics)
// {
//   supportDensity: 0.29,      // 29% of viewers liked
//   supportRate: 0.194,        // 19.4% raw conversion
//   breadth: 2.8,              // ~3 clusters
//   persistenceDays: 3.0,      // Sustained for 3 days
//   ...
// }
```

Display-friendly formatting:

```typescript
import { formatMetricsForDisplay } from '@bunkarium/algorithm'

const labels = formatMetricsForDisplay(metrics)
console.log(labels)
// [
//   "支持密度: 中 (29%)",
//   "広がり: 2.8シーンに到達",
//   "持続: 3日間反応が継続"
// ]
```

### Curator Reputation (CR)

Calculate CR from events:

```typescript
import { calculateCR, getCRLevel } from '@bunkarium/algorithm'

const events = [
  {
    eventType: 'noteAdopted' as const,
    outcome: 1.0, // Success
    timestamp: Date.now() - 86400000 * 10, // 10 days ago
    weight: 0.15
  },
  {
    eventType: 'bridgeSuccess' as const,
    outcome: 0.8,
    timestamp: Date.now() - 86400000 * 5,
    weight: 0.25
  },
  {
    eventType: 'stakeFailure' as const,
    outcome: -0.5, // Penalty
    timestamp: Date.now() - 86400000 * 2,
    weight: -0.15
  }
]

const cr = calculateCR(events, {
  baseCR: 1.0,
  minCR: 0.1,
  maxCR: 10.0,
  decayHalfLifeDays: 90,
  learningRate: 0.1
})

console.log(cr.finalCR) // ~1.15
console.log(cr.multiplier) // ~1.28
console.log(getCRLevel(cr.finalCR)) // 'medium'
```

Evaluate bridge success:

```typescript
import { evaluateBridgeSuccess } from '@bunkarium/algorithm'

const bridgeOutcome = evaluateBridgeSuccess({
  crossClusterLikes: 5,
  crossClusterSaves: 2,
  crossClusterComments: 1,
  uniqueClusters: 3
}, {
  minClusters: 2,
  minEngagement: 1.0,
  reactionWeights: {
    like: 0.3,
    save: 0.5,
    comment: 0.8
  }
})

console.log(bridgeOutcome.isSuccess) // true
console.log(bridgeOutcome.score) // ~0.75
```

### Culture Points (CP)

Calculate CP issuance:

```typescript
import { calculateCPIssuance, createMintEntry } from '@bunkarium/algorithm'

// Calculate issuance for 5th note adoption in 24h
const issuance = calculateCPIssuance(
  'mint_note_adopted',
  5, // Event count in window
  1.5 // User's CR
)

console.log(issuance.amount) // ~7.8 CP
console.log(issuance.diminishingApplied) // true
console.log(issuance.crMultiplier) // 1.05

// Create ledger entry
const entry = createMintEntry(
  'user-123',
  'mint_note_adopted',
  [], // Existing entries
  1.5, // CR
  { type: 'note', id: 'note-456' }
)

console.log(entry)
// {
//   id: 'uuid',
//   userId: 'user-123',
//   eventType: 'mint_note_adopted',
//   amount: 7.8,
//   timestamp: 1234567890,
//   relatedObjectType: 'note',
//   relatedObjectId: 'note-456'
// }
```

Check CP balance:

```typescript
import { calculateCPBalance } from '@bunkarium/algorithm'

const ledger = [
  { id: '1', userId: 'user-123', eventType: 'mint_note_adopted', amount: 10, timestamp: 1000 },
  { id: '2', userId: 'user-123', eventType: 'mint_bridge_success', amount: 20, timestamp: 2000 },
  { id: '3', userId: 'user-123', eventType: 'lock_stake_recommendation', amount: -15, timestamp: 3000 }
]

const balance = calculateCPBalance(ledger, 'user-123')

console.log(balance)
// {
//   userId: 'user-123',
//   available: 15,   // Can spend
//   locked: 15,      // Staked
//   totalEarned: 30,
//   totalSpent: 0,
//   totalSlashed: 0
// }
```

Create recommendation stake:

```typescript
import { createStakeRecommendation } from '@bunkarium/algorithm'

const result = createStakeRecommendation(
  'user-123',
  'work',
  'work-789',
  50, // Stake amount
  balance
)

if ('stake' in result) {
  console.log(result.stake)
  // {
  //   id: 'uuid',
  //   userId: 'user-123',
  //   targetType: 'work',
  //   targetId: 'work-789',
  //   stakedAmount: 50,
  //   lockDurationDays: 14,
  //   status: 'active'
  // }

  console.log(result.lockEntry)
  // { eventType: 'lock_stake_recommendation', amount: -50, ... }
} else {
  console.error(result.error) // "Insufficient balance"
}
```

Evaluate and resolve stake:

```typescript
import { evaluateStakeOutcome, resolveStake } from '@bunkarium/algorithm'

const outcome = evaluateStakeOutcome(stake, {
  supportDensityBefore: 0.1,
  supportDensityAfter: 0.25,
  breadthBefore: 2,
  breadthAfter: 4,
  contextCountBefore: 3,
  contextCountAfter: 10,
  crossClusterReactionsBefore: 0,
  crossClusterReactionsAfter: 8
})

console.log(outcome.isSuccess) // true
console.log(outcome.totalScore) // ~0.65

const { updatedStake, entries } = resolveStake(stake, outcome)

console.log(updatedStake.status) // 'success'
console.log(entries)
// [
//   { eventType: 'unlock_stake_success', amount: 50 },
//   { eventType: 'mint_community_reward', amount: 10 }
// ]
```

### Explainability

Generate reason codes:

```typescript
import { determineReasonCodes, formatReasonCodes } from '@bunkarium/algorithm'

const codes = determineReasonCodes(
  candidate,
  { prs: 0.8, cvs: 0.6 },
  { surface: 'home_mix' },
  { prs: 0.70, cvs: 0.30 }
)

console.log(codes)
// ['HIGH_PRS', 'FOLLOWING', 'CONTEXT_SIGNAL']

const texts = formatReasonCodes(codes)
console.log(texts)
// ['フォロー中のユーザー', 'コンテキスト反応が多い', '新しいシーン']
```

Generate detailed explanation:

```typescript
import { generateDetailedExplanation, calculateContributionRates } from '@bunkarium/algorithm'

const explanation = generateDetailedExplanation(
  candidate,
  { prs: 0.8, cvs: 0.6, penalty: 1.0 },
  0.687654321,
  codes
)

console.log(explanation)
// "このアイテムは、フォロー中のユーザーからの投稿で、
//  コンテキスト反応が多いです。
//  スコア: 0.688 (PRS: 80%, CVS: 60%)"

const contributions = calculateContributionRates(
  { prs: 0.8, cvs: 0.6 },
  { prs: 0.70, cvs: 0.30 }
)

console.log(contributions)
// {
//   prs: 0.76,  // 76% of final score from PRS
//   cvs: 0.24   // 24% from CVS
// }
```

---

## Offline Evaluation

### Dataset Evaluation

```typescript
import { evaluateOffline } from '@bunkarium/algorithm'

const exposures = [
  { userId: 'u1', itemId: 'a', clusterId: 'c1', position: 0, timestamp: 1000, clicked: true },
  { userId: 'u2', itemId: 'b', clusterId: 'c2', position: 1, timestamp: 2000, liked: true },
  { userId: 'u3', itemId: 'a', clusterId: 'c1', position: 2, timestamp: 3000 }
]

const popularity = [
  { itemId: 'a', clusterId: 'c1', totalExposures: 100, totalLikes: 20, totalSaves: 5, createdAt: 0 },
  { itemId: 'b', clusterId: 'c2', totalExposures: 50, totalLikes: 10, totalSaves: 2, createdAt: 0 }
]

const result = evaluateOffline(exposures, popularity, 5) // 5 total clusters

console.log(result)
// {
//   giniCoefficient: 0.25,
//   exposureGini: 0.15,
//   likeGini: 0.20,
//   longTailExposureRate: 0.35,
//   longTailClickRate: 0.28,
//   clusterCoverage: 0.4,      // 2/5 clusters
//   clusterEntropy: 0.72,
//   positionBias: 1.0,
//   freshItemExposureRate: 0.6,
//   details: { ... }
// }
```

### A/B Test Comparison

```typescript
import { compareABTest } from '@bunkarium/algorithm'

const controlExposures = [...] // Algorithm A
const treatmentExposures = [...] // Algorithm B

const comparison = compareABTest(
  controlExposures,
  treatmentExposures,
  popularity,
  5
)

console.log(comparison)
// {
//   control: { giniCoefficient: 0.45, ... },
//   treatment: { giniCoefficient: 0.32, ... },
//   improvement: {
//     giniCoefficient: -0.29,  // -29% (better!)
//     clusterCoverage: 0.25,   // +25%
//     clusterEntropy: 0.15     // +15%
//   }
// }
```

Generate human-readable summary:

```typescript
import { generateEvaluationSummary } from '@bunkarium/algorithm'

const summary = generateEvaluationSummary(result)

console.log(summary)
// ===== Offline Evaluation Summary =====
// Total Exposures: 1,250
// Unique Items: 85
// Unique Clusters: 12
//
// [Concentration]
// Gini Coefficient: 0.32 (moderate concentration)
// Long Tail Exposure Rate: 42% (healthy)
//
// [Diversity]
// Cluster Coverage: 60% (12/20 clusters)
// Cluster Entropy: 0.78 (good distribution)
// ...
```

---

## Advanced Usage

### Custom Similarity Function

```typescript
import type { Candidate, SimilarityFunction } from '@bunkarium/algorithm'

const customSimilarity: SimilarityFunction = (a, b) => {
  // Combine cluster and tag similarity
  const clusterMatch = a.clusterId === b.clusterId ? 0.5 : 0

  const aTags = new Set(a.features.tags ?? [])
  const bTags = new Set(b.features.tags ?? [])
  const intersection = new Set([...aTags].filter(t => bTags.has(t)))
  const union = new Set([...aTags, ...bTags])
  const tagSim = union.size > 0 ? intersection.size / union.size : 0

  return clusterMatch + 0.5 * tagSim
}

const reranked = mmrRerank(ranked, {
  similarityFn: customSimilarity,
  lambda: 0.6
})
```

### Embedding-based Diversity

```typescript
import { cosineSim, mmrRerank } from '@bunkarium/algorithm'

// Ensure candidates have embeddings
const candidatesWithEmbeddings = candidates.map(c => ({
  ...c,
  features: {
    ...c.features,
    embedding: getEmbeddingFromDB(c.itemKey) // Your embedding source
  }
}))

const reranked = mmrRerank(candidatesWithEmbeddings, {
  similarityFn: 'cosine', // Use embedding cosine similarity
  lambda: 0.7
})
```

### Surface-specific Configuration

Different surfaces may need different parameters:

```typescript
function getParamsForSurface(surface: string) {
  switch (surface) {
    case 'home_mix':
      return {
        weights: { prs: 0.70, cvs: 0.30 }
      }

    case 'following':
      return {
        weights: { prs: 0.80, cvs: 0.20 }
      }

    case 'scenes':
      return {
        weights: { prs: 0.50, cvs: 0.50 }
      }

    default:
      return {
        weights: { prs: 0.70, cvs: 0.30 }
      }
  }
}
```

### Caching and Performance

Cache parameter hashes for reuse:

```typescript
import { createHash } from 'crypto'

const paramCache = new Map<string, string>()

function getOrCreateParamSetId(params: any): string {
  const key = JSON.stringify(params)

  if (!paramCache.has(key)) {
    const hash = createHash('sha256').update(key).digest('hex')
    paramCache.set(key, hash)
  }

  return paramCache.get(key)!
}
```

Batch ranking for multiple users:

```typescript
async function rankForUsers(users: User[], candidates: Candidate[]) {
  const results = await Promise.all(
    users.map(user => rank({
      contractVersion: CONTRACT_VERSION,
      clusterVersion: 'v1.0',
      requestId: crypto.randomUUID(),
      userState: getUserState(user),
      candidates, // Same candidates
      context: { surface: 'home_mix', nowTs: Date.now() },
      params: getParamsForUser(user)
    }))
  )

  return results
}
```

---

## Testing

### Unit Testing Primitives

```typescript
import { describe, test, expect } from 'bun:test'
import { calculateLikeWeight } from '@bunkarium/algorithm'

describe('Like Decay', () => {
  test('first like has weight 1.0', () => {
    const result = calculateLikeWeight({ likeWindowCount: 1 })
    expect(result.weight).toBe(1.0)
  })

  test('weight decreases with volume', () => {
    const result10 = calculateLikeWeight({ likeWindowCount: 10 })
    const result20 = calculateLikeWeight({ likeWindowCount: 20 })

    expect(result10.weight).toBeGreaterThan(result20.weight)
  })
})
```

### Integration Testing

```typescript
test('end-to-end ranking produces valid output', async () => {
  const request = createTestRequest()
  const response = await rank(request)

  expect(response.ranked.length).toBeGreaterThan(0)
  expect(response.ranked[0].finalScore).toBeGreaterThanOrEqual(0)
  expect(response.ranked[0].finalScore).toBeLessThanOrEqual(1)
  expect(response.metadata.contractVersion).toBe(CONTRACT_VERSION)
})
```

### Determinism Testing

```typescript
test('same input produces same output', async () => {
  const request = createTestRequest()

  const result1 = await rank(request)
  const result2 = await rank(request)

  expect(result1.ranked).toEqual(result2.ranked)
  expect(result1.metadata.paramSetId).toBe(result2.metadata.paramSetId)
})
```

---

## Troubleshooting

### Empty Results

```typescript
// Check if candidates were filtered out
console.log('Candidates before:', request.candidates.length)
console.log('Ranked after:', response.ranked.length)

// Check moderation requirements
console.log('Surface policies:', request.params?.surfacePolicies)
console.log('Moderated candidates:',
  request.candidates.filter(c => c.qualityFlags.moderated).length
)
```

### Score Debugging

```typescript
// Log score breakdown
response.ranked.forEach((item, i) => {
  console.log(`${i + 1}. ${item.itemKey}`)
  console.log(`   Score: ${item.finalScore.toFixed(6)}`)
  console.log(`   PRS: ${item.scoreBreakdown.prs.toFixed(3)}`)
  console.log(`   CVS: ${item.scoreBreakdown.cvs.toFixed(3)}`)
  console.log(`   Penalty: ${item.scoreBreakdown.penalty.toFixed(3)}`)
  console.log(`   Reasons: ${item.reasonCodes.join(', ')}`)
})
```

---

## Further Reading

- [Architecture](./ARCHITECTURE.md) - System design principles
- [Formulas](./FORMULAS.md) - Mathematical details
- [Parameters](./PARAMETERS.md) - Tuning guide
- [Main Spec](../../../docs/SPECS/algorithm.md) - Complete specification
