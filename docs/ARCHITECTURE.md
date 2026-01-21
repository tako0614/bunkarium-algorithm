# Architecture

## Overview

`@bunkarium/algorithm` is a **pure, stateless** TypeScript package that implements culture-focused ranking algorithms. It processes snapshots of aggregated data and returns ranked recommendations without any database access or external I/O.

## Design Principles

### 1. Pure Functions
All exported APIs are deterministic functions of their inputs. Same input always produces same output.

```typescript
// Pure function example
const result1 = rank(request)
const result2 = rank(request)
// result1 === result2 (always)
```

### 2. Stateless Boundary
The algorithm package does NOT:
- Store any persistent state
- Read from databases
- Make network requests
- Access file systems

All state is passed in via function parameters.

### 3. DB-Agnostic Design
The algorithm works with **aggregated snapshots** provided by the application:
- `weightedLikeSum` (not individual like records)
- `qualifiedUniqueViewers` (not raw view events)
- `clusterWeights` (not user-cluster memberships)

This separation allows the application to:
- Use any database (SQL, NoSQL, graph, etc.)
- Implement fraud detection independently
- Cache aggregates efficiently

### 4. Composable Primitives
Core functions can be used independently:

```typescript
// Use just like decay
const likeWeight = calculateLikeWeight({ likeWindowCount: 10 })

// Use just public metrics
const metrics = calculatePublicMetrics(input, params)

// Use just diversity reranking
const diverse = mmrRerank(candidates, { lambda: 0.7 })

// Or use the full pipeline
const result = rank(request)
```

### 5. Versioned Contract
Every request includes `contractVersion` to ensure compatibility:

```typescript
const request: RankRequest = {
  contractVersion: '1.0',
  clusterVersion: 'v1.0',
  // ...
}
```

## System Architecture

```
┌─────────────────────────────────────────────────┐
│              Application Layer                   │
│  (Database, Fraud Detection, Aggregation)       │
└─────────────────┬───────────────────────────────┘
                  │
                  │ RankRequest (snapshot)
                  ▼
┌─────────────────────────────────────────────────┐
│         @bunkarium/algorithm (Stateless)         │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │ Like Decay │  │ CR/CP/CVV  │  │  Metrics  │ │
│  └────────────┘  └────────────┘  └───────────┘ │
│                                                  │
│  ┌────────────┐  ┌────────────┐  ┌───────────┐ │
│  │  Scoring   │  │  Ranking   │  │  Explain  │ │
│  │  PRS/CVS   │  │            │  │   Codes   │ │
│  └────────────┘  └────────────┘  └───────────┘ │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │         Offline Evaluation              │   │
│  │  (Gini, Coverage, Diversity Metrics)    │   │
│  └─────────────────────────────────────────┘   │
└─────────────────┬───────────────────────────────┘
                  │
                  │ RankResponse (ranked items)
                  ▼
┌─────────────────────────────────────────────────┐
│              Application Layer                   │
│    (Logging, Personalization, Rendering)        │
└─────────────────────────────────────────────────┘
```

## Data Flow

### 1. Input: RankRequest

```typescript
{
  contractVersion: '1.0',
  clusterVersion: 'v1.0',
  requestId: 'uuid',
  requestSeed: 'seed-for-determinism',

  userState: {
    userKey: 'user123',
    likeWindowCount: 15,        // From DB aggregation
    recentLikeCount30s: 2,      // From DB aggregation
    recentClusterExposures: {   // From exposure log
      'cluster-a': 5,
      'cluster-b': 2
    },
    curatorReputation: 1.5,     // CR score
    cpEarned90d: 120            // CP total
  },

  candidates: [
    {
      itemKey: 'post-1',
      type: 'post',
      clusterId: 'cluster-a',
      createdAt: 1234567890000,
      qualityFlags: {
        moderated: true,
        spamSuspect: false
      },
      features: {
        cvsComponents: {
          like: 0.8,
          context: 0.3,
          collection: 0.1,
          bridge: 0.05,
          sustain: 0.2
        },
        qualifiedUniqueViewers: 150,
        publicMetricsHint: { ... },
        prsSource: 'following'
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
```

### 2. Processing Pipeline

```
Candidates (unranked)
  │
  ├─> Quality Filtering (moderation requirements)
  │
  ├─> Primary Scoring
  │   ├─> PRS (Personal Relevance Score)
  │   └─> CVS (Cultural Value Score)
  │
  ├─> Mixed Score = PRS * wprs + CVS * wcvs
  │
  ├─> Penalty Application (spam, low quality)
  │
  └─> Primary Ranking (by finalScore)

Final Ranked List
  │
  └─> Reason Code Generation
```

### 3. Output: RankResponse

```typescript
{
  ranked: [
    {
      itemKey: 'post-42',
      finalScore: 0.876543210,
      reasonCodes: ['HIGH_CVS', 'BRIDGE_SIGNAL', 'NEW_CLUSTER'],
      scoreBreakdown: {
        prs: 0.6,
        cvs: 0.9,
        penalty: 1.0
      }
    },
    // ...more items
  ],

  metadata: {
    requestId: 'uuid',
    contractVersion: '2.0',
    paramSetId: 'sha256-hash-of-params',
    totalCandidates: 150,
    totalRanked: 20
  }
}
```

## Component Responsibilities

### Like Decay
- **Input**: User's recent like count
- **Output**: Weight multiplier (0.0-1.0)
- **Purpose**: Prevent spam/farming while keeping likes always pressable

### CR (Curator Reputation)
- **Input**: Historical curation outcomes
- **Output**: CR score (0.1-10.0) and multiplier (0.5-2.0)
- **Purpose**: Reward quality curation, not just volume

### CP (Culture Points)
- **Input**: Community contribution events
- **Output**: CP issuance amounts, stake outcomes
- **Purpose**: Non-transferable reputation currency

### CVV (Cultural View Value)
- **Input**: Viewer's CR, CP, view uniqueness
- **Output**: View weight
- **Purpose**: Value attention from engaged curators higher

### Public Metrics
- **Input**: Aggregated likes, views, clusters
- **Output**: Density, rate, breadth, persistence
- **Purpose**: Show cultural impact, not raw popularity

### Scoring (PRS/CVS)
- **PRS**: Personal relevance (following, saved, liked sources)
- **CVS**: Cultural value (like/context/collection/bridge/sustain signals)

### Explain Codes
- **Input**: Candidate features and scores
- **Output**: Human-readable reason codes
- **Purpose**: Transparency ("Why am I seeing this?")

## Determinism and Auditability

### Deterministic Randomness
All random operations use `Xorshift64` PRNG seeded with `requestSeed`:

```typescript
const rng = new Xorshift64(hashSeed(requestSeed))
const explorationIndices = sampleExplorationSlots(rng, count, budget)
```

Same `requestSeed` → same random choices → same output

### Parameter Hash (paramSetId)
All effective parameters are hashed to create an audit trail:

```typescript
const paramSetId = sha256Hash(JSON.stringify({
  contractVersion,
  clusterVersion,
  params,
  weights,
  // ...all config
}))
```

This allows:
- A/B test analysis (compare paramSetId groups)
- Debugging (reproduce exact conditions)
- Compliance (prove parameters at request time)

## Edge Cases and Stability

### Division by Zero Protection
All divisions include priors or clamping:

```typescript
// Support density with prior
const supportDensity = (weightedLikeSum + priorLikes) /
                       (qualifiedUniqueViewers + priorViews)

// Breadth (effective cluster count)
const breadth = totalWeight > 0 ? sumSquares / totalWeight : 0
```

### Numerical Precision
- `finalScore`: 9 decimal places
- Public metrics: 6 decimal places
- All intermediate calculations use `Math.fround` for consistency

### Empty Input Handling
- Empty candidate array → empty ranked array
- No qualified viewers → prior-based metrics
- No cluster exposures → all clusters considered novel

## Performance Characteristics

### Time Complexity
- Primary scoring: O(n) where n = candidate count
- Full pipeline: O(n) typically

### Space Complexity
- O(n) for candidate storage
- O(1) for metrics calculation (streaming)

### Optimization Tips
1. **Cache parameter hashes** if params don't change often
2. **Batch requests** when possible (same user state)

## Extension Points

### Custom Reason Code Logic
Extend `determineReasonCodes`:

```typescript
const customReasons = (candidate: Candidate, ...args) => {
  const baseCodes = determineReasonCodes(candidate, ...args)

  // Add custom logic
  if (candidate.features.customFlag) {
    baseCodes.push('CUSTOM_REASON')
  }

  return baseCodes
}
```

## Testing Strategy

### Unit Tests
Each primitive function has isolated tests:
- Like decay edge cases
- Metric calculations
- Scoring formulas
- Diversity algorithms

### Integration Tests
Full pipeline tests with realistic data:
- End-to-end ranking
- Determinism verification
- Edge case handling

### Conformance Tests
Verification against spec test vectors:
- Known inputs → expected outputs
- Numerical precision checks
- Contract validation

## Migration and Versioning

### Contract Evolution
When contract changes:
1. Increment `CONTRACT_VERSION`
2. Add new optional fields (backward compatible)
3. Deprecate old fields (support for N versions)
4. Document breaking changes

### Algorithm Versioning
`ALGORITHM_VERSION` changes when:
- Formulas change
- Default parameters change
- Behavior changes

Applications can pin to specific versions:
```json
{
  "dependencies": {
    "@bunkarium/algorithm": "1.0.0"
  }
}
```

## Further Reading

- [Formulas](./FORMULAS.md) - Detailed mathematical formulas
- [Usage Guide](./USAGE.md) - Examples and best practices
- [Parameters](./PARAMETERS.md) - Tuning guide
- [Main Spec](../../../docs/SPECS/algorithm.md) - Normative specification
