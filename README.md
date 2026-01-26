# @bunkarium/algorithm

Pure TypeScript recommendation algorithms focused on **cultural value**.

**Stateless**, **DB-agnostic**, and designed as **composable functions** with a strict, versioned contract.
Built for applications that want transparent, auditable ranking without turning "likes" into a hard limit.

- **ALGORITHM_ID**: `bunkarium-culture-rank`
- **ALGORITHM_VERSION**: `2.0.0`
- **CONTRACT_VERSION**: `2.0`

---

## Why

Most social feeds optimize for raw totals (views/likes/follows), which tends to concentrate attention and homogenize culture.
Bunkarium's approach is different:

- Users can always react (likes are **always pressable**).
- Reaction impact diminishes with volume (**diminishing weight**, not "blocked likes").
- Public-facing metrics emphasize **ratios/density/distribution**, not raw totals.
- Ranking is **multi-objective** (personal relevance + cultural value).
- Every exposure can carry **explainable reason codes** ("Why this?").

---

## Features (Contract v2.0)

### Core ranking
- Like decay (always pressable, diminishing weight)
- Voting power: `votingPower = CR / n` (zero-sum design)
- Public metrics based on **density / rate / breadth / persistence**
- Multi-objective scoring (**PRS / CVS**)
- Deterministic results (same input → same output)
- Explainable exposure reason codes

### Culture primitives
- Curator Reputation (**CR**) utilities (outcome-oriented, not follower count)
- Culture Points (**CP**) issuance utilities (non-transferable, farming-resistant)
- Cultural View Value (**CVV**) weighting utilities (value of attention, separate axis)
- Delayed discovery evaluation (遅延評価型の発見CR)

### Evaluation (offline)
- Concentration metrics (Gini, long-tail share)
- Cluster coverage metrics
- Replay-style evaluation helpers (dataset snapshot in → report out)

> This package does **not** do fraud detection, moderation decisions, or model training.
> Those remain application responsibilities by design.

---

## Install

### Bun
```bash
bun add @bunkarium/algorithm
```

### npm
```bash
npm install @bunkarium/algorithm
```

---

## Quick Start

```typescript
import { rank, CONTRACT_VERSION } from '@bunkarium/algorithm'

const response = await rank({
  contractVersion: CONTRACT_VERSION,
  clusterVersion: 'v1.0',
  requestId: crypto.randomUUID(),
  userState: {
    userKey: 'user-123',
    likeWindowCount: 15,
    recentLikeCount30s: 2,
    recentClusterExposures: { 'tech': 5, 'art': 2 },
    diversitySlider: 0.5,
    curatorReputation: 1.2,
    cpEarned90d: 50
  },
  candidates: [
    {
      itemKey: 'post-1',
      type: 'post',
      clusterId: 'tech',
      createdAt: Date.now(),
      qualityFlags: { moderated: true },
      features: {
        cvsComponents: {
          like: 0.8, context: 0.3, collection: 0.1,
          bridge: 0.05, sustain: 0.2
        },
        qualifiedUniqueViewers: 150
      }
    }
    // ...more candidates
  ],
  context: { surface: 'home_mix', nowTs: Date.now() },
  params: {
    weights: { prs: 0.70, cvs: 0.30 }
  }
})

// Access ranked results
response.ranked.forEach(item => {
  console.log(item.itemKey, item.finalScore, item.reasonCodes)
})
```

See [Usage Guide](./docs/USAGE.md) for more examples.

---

## Documentation

### Core Guides
- **[Architecture](./docs/ARCHITECTURE.md)** - System design, data flow, and component responsibilities
- **[Formulas](./docs/FORMULAS.md)** - Mathematical formulas and calculations in detail
- **[Usage Guide](./docs/USAGE.md)** - Code examples, primitives, and best practices
- **[Parameter Tuning](./docs/PARAMETERS.md)** - Tuning guide for different use cases

### Specification
- **[Algorithm Spec](../../docs/SPECS/algorithm.md)** - Normative contract specification

### Key Concepts

#### Like Decay
```typescript
import { calculateLikeWeight } from '@bunkarium/algorithm'

const weight = calculateLikeWeight({ likeWindowCount: 10 })
console.log(weight.weight) // ~0.689
console.log(weight.supportPowerPercent) // 68.9%
```

#### Public Metrics
```typescript
import { calculatePublicMetrics } from '@bunkarium/algorithm'

const metrics = calculatePublicMetrics({
  weightedLikeSum: 45.5,
  uniqueLikers: 30,
  qualifiedUniqueViewers: 150,
  weightedViews: 220.5,
  clusterWeights: { 'tech': 20, 'art': 15 },
  daysSinceFirstReaction: 5,
  recentReactionRate: 0.6
})

console.log(metrics.supportDensity) // 0.29 (29% liked)
console.log(metrics.breadth) // 2.8 (~3 clusters)
```

#### Curator Reputation
```typescript
import { calculateCR, getCRMultiplier } from '@bunkarium/algorithm'

const cr = calculateCR(events, config)
console.log(cr.finalCR) // 1.5
console.log(getCRMultiplier(1.5)) // 1.35
```

#### Culture Points
```typescript
import { calculateCPIssuance } from '@bunkarium/algorithm'

const issuance = calculateCPIssuance('mint_note_adopted', 5, 1.5)
console.log(issuance.amount) // ~7.8 CP
```

---

## Design Principles

1. **Pure Functions** - Deterministic, no side effects
2. **Stateless** - No database access, no I/O
3. **Composable** - Use primitives independently
4. **Auditable** - Versioned contract, parameter hashing
5. **Explainable** - Transparent reason codes

---

## Architecture Overview

```
Application (DB, Fraud Detection, Aggregation)
              ↓
         RankRequest (snapshot)
              ↓
    @bunkarium/algorithm (Stateless)
    ┌──────────────────────────────┐
    │ Like Decay | CR/CP/CVV        │
    │ Metrics    | Scoring          │
    │ Reranking  | Explain Codes    │
    │ Evaluation                    │
    └──────────────────────────────┘
              ↓
        RankResponse (ranked items)
              ↓
  Application (Logging, Rendering)
```

See [Architecture](./docs/ARCHITECTURE.md) for detailed flow diagrams and component responsibilities.

---

## Testing

```bash
# Run tests
bun test

# Type check
bun run typecheck

# Build
bun run build
```

All tests: **519 pass, 0 fail** (includes conformance, precision, and comprehensive coverage)

---

## API Reference

### Main Functions

#### `rank(request: RankRequest): Promise<RankResponse>`
Full ranking pipeline (scoring + reason codes).

#### `rankSync(request: RankRequest): RankResponse`
Synchronous version.

#### `calculateLikeWeight(input: LikeWeightInput): LikeWeightOutput`
Like decay calculation.

#### `calculatePublicMetrics(input: PublicMetricsInput, params?: Partial<PublicMetricsParams>): PublicMetrics`
Cultural impact metrics (density, breadth, persistence).

#### `calculateCR(events: CREvent[], config?: Partial<CRConfig>): CRResult`
Curator reputation from historical events.

**CR Event Types**:
- `early_discovery` (+0.30 × magnitude): 小さい投稿を発見して伸びた
- `failed_discovery` (-0.15 × magnitude): いいねした投稿が伸びなかった
- `cross_cluster_discovery` (+0.20): 自分のクラスタ外で発見
- `bridge_success`, `note_adopted`, `stake_success/failure`, `spam_flag`

**Discovery Evaluation (非対称設計)**:
- 成功: `discoveryValue = growth × (1/popularity)` → 小さい投稿ほど大ボーナス
- 失敗: `failureValue = stagnation × (1+popularity)` → デカい投稿ほど大ペナルティ

#### `calculateCPIssuance(eventType: CPEventType, recentEventCount: number, curatorReputation?: number): CPIssuanceResult`
Culture Points issuance with diminishing.

#### `evaluateOffline(exposures: ExposureLog[], popularity: ItemPopularity[], totalClusters: number): OfflineMetrics`
Offline evaluation (Gini, coverage, diversity).

See [Usage Guide](./docs/USAGE.md) for detailed API documentation and examples.

---

## Parameter Defaults

```typescript
import { DEFAULT_PARAMS } from '@bunkarium/algorithm'

console.log(DEFAULT_PARAMS)
// {
//   likeWindowMs: 86400000,      // 24 hours
//   likeDecayAlpha: 0.05,
//   weights: { prs: 0.70, cvs: 0.30 },
//   ...
// }
```

See [Parameter Tuning](./docs/PARAMETERS.md) for optimization guide.

---

## Advanced Usage

### Surface-specific Parameters
```typescript
function getParamsForSurface(surface: string) {
  return surface === 'following'
    ? { weights: { prs: 0.80, cvs: 0.20 } }
    : { weights: { prs: 0.70, cvs: 0.30 } }
}
```

### Offline Evaluation
```typescript
import { evaluateOffline, compareABTest } from '@bunkarium/algorithm'

const metrics = evaluateOffline(exposures, popularity, totalClusters)
console.log(metrics.giniCoefficient) // 0.32
console.log(metrics.clusterCoverage) // 0.6

const comparison = compareABTest(controlExposures, treatmentExposures, popularity, totalClusters)
console.log(comparison.improvement.giniCoefficient) // -0.15 (better!)
```

---

## Performance

- **Primary scoring**: O(n) where n = candidates

Typical performance:
- 1000 candidates → ~5ms (scoring only)
- 200 candidates → ~8ms (full pipeline)

---

## Versioning

This package follows semantic versioning:
- **Patch** (1.0.X): Bug fixes, no behavior change
- **Minor** (1.X.0): New features, backward compatible
- **Major** (X.0.0): Breaking changes

Contract version changes require major version bump.

---

## Contributing

This package is part of the Bunkarium monorepo. See main repository for contribution guidelines.

Key areas for improvement:
- Performance optimization
- More evaluation metrics
- Documentation and examples

---

## License

See main repository for license information.

---

## Related Projects

- **[@bunkarium/shared](../shared)** - Shared types and utilities
- **[@bunkarium/sns-backend](../sns/backend)** - SNS backend implementation
- **[@bunkarium/sns-frontend](../sns/frontend)** - SNS frontend application

---

## Support

- **Issues**: Report bugs and feature requests in the main repository
- **Documentation**: See [docs/](./docs/) for detailed guides
- **Specification**: See [algorithm.md](../../docs/SPECS/algorithm.md) for normative spec

---

## Changelog

### v2.0.0 (2026-01-22)
- Voting power simplified to `CR / n`
- Scoring simplified to PRS + CVS
- Cluster normalization removed (raw CR used)
- Delayed discovery evaluation added

### v1.0.0 (2026-01-18)
- Initial release
- Contract v1.0 implementation
- Full test coverage (515 tests)
- Complete documentation
