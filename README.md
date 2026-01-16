# @bunkarium/algorithm

Pure TypeScript recommendation algorithms focused on cultural diversity.
Stateless, DB-agnostic, and built as composable functions.

## Features
- Like decay (always pressable, but diminishing weight)
- Public metrics based on ratios/density (not raw totals)
- Multi-objective scoring (PRS/CVS/DNS)
- Diversity-aware reranking (MMR/DPP)
- Explainable reason codes for exposure
- Curator Reputation (CR) and Culture Points (CP)
- Offline evaluation metrics (Gini, long-tail, cluster coverage)
- Embedding utilities (LSH, PCA, K-means)

## Install
```bash
bun add @bunkarium/algorithm
```

## Usage

Like decay:
```ts
import { calculateLikeWeight } from '@bunkarium/algorithm'

const { weight, supportPowerPercent } = calculateLikeWeight(5, 0.05)
```

Public metrics:
```ts
import { calculatePublicMetrics } from '@bunkarium/algorithm'

const metrics = calculatePublicMetrics({
  weightedLikeSum: 10.5,
  weightedViews: 40.2,
  qualifiedUniqueViews: 100,
  clusterWeights: { jazz: 6, hiphop: 3, electronic: 1 },
  daysSinceFirstReaction: 7,
  recentReactionRate: 0.8
})
```

Ranking:
```ts
import { rank } from '@bunkarium/algorithm'

const { ranked, constraintsReport } = rank({
  contractVersion: '1.0',
  requestId: 'req_1',
  requestSeed: 'req_1',
  userState,
  candidates,
  context: { surface: 'home_mix', nowTs: Date.now() },
  params: { diversityCapN: 20, diversityCapK: 5, explorationBudget: 0.15 }
})
```

## Detailed Specification

### Inputs
- UserStateSnapshot: `userKey`, `likeWindowCount24h`, `recentLikeCount30s`,
  `recentClusterExposures`, `diversitySlider`, `curatorReputation`, `cpEarned90d`
- Candidate: `itemKey`, `type`, `clusterId`, `createdAt`, `features`
- CandidateFeatures: `cvsComponents`, `qualifiedUniqueViews`, `qualityFlags`,
  `embedding?`, `prs?`, `prsSource?`, `publicMetrics?`

### Like decay
```
w(u) = 1 / (1 + alpha * (n - 1))
```
- Rapid penalty: if `recentLikeCount30s >= 50` in 30s, apply `weight * 0.1`.

### Cultural View Value (spec)
- `crMultiplier = getCRMultiplier(CR)` (0.5 to 2.0)
- `cpMultiplier = clamp(0.8, 1.2, 0.8 + 0.2 * log10(1 + CP_earned_90d / 50))`
- `viewWeight = clamp(0.2, 2.0, crMultiplier * cpMultiplier)`
- Unique view: one add per user/target per 24h window.
- `weightedViews = sum(viewWeight)` and `qualifiedUniqueViews` tracked separately.
- Support metrics use `qualifiedUniqueViews` as the denominator in v1.0.

### Public metrics
- `supportDensity = (weightedLikeSum + priorLikes) / ((qualifiedUniqueViews + priorViews) ^ beta)` (beta default 1.0)
- `supportRate = min(1, (weightedLikeSum + priorLikes) / (qualifiedUniqueViews + priorViews))`
- `breadth = exp(entropy(clusterDistribution))` (`clusterWeights` is normalized internally)
- `topClusterShare = max(p_i)`
- `persistence = recentReactionRate * (1 - exp(-ln(2) * ageDays / halfLifeDays)) * halfLifeDays`
- Recommended: `clusterWeights` built from weighted likes per cluster (`weight_snapshot * user_cr_snapshot`).

Note: `qualifiedUniqueViews` is expected to be deduped and fraud-filtered. It
remains the denominator for v1.0. `weightedViews` is
reported separately as Cultural View Value.

### Scoring
```
CVS = a*LikeSignal + b*ContextSignal + d*CollectionSignal
    + e*BridgeSignal + f*SustainSignal
```
- PRS: `candidate.features.prs` (defaults to 0).
- DNS: `0.6 * clusterNovelty + 0.4 * timeNovelty`
  - `clusterNovelty = 1 / (1 + exposureCount * factor)`
  - `timeNovelty = exp(-ln(2) * ageHours / halfLifeHours)`
- PRS/CVS/DNS are clamped to 0..1 in the algorithm.
- Penalty:
  - `spamSuspect`: +0.5
  - similarity penalties are applied in reranking only
```
finalScore = w_prs*PRS + w_cvs*CVS + w_dns*DNS - penalty
```

### Diversity reranking
- Apply caps to the top N (default 20).
- Limit same-cluster exposure to K (default 5).
- Exploration budget default 0.15.
- Rerank candidates are capped (default 200).
- MMR/DPP variants supported with stabilized determinant math.
- Deterministic tie-break: `finalScore desc -> createdAt desc -> itemKey asc`.

### Explain codes
`SIMILAR_TO_SAVED`, `GROWING_CONTEXT`, `BRIDGE_SUCCESS`, `DIVERSITY_SLOT`,
`EXPLORATION`, `HIGH_SUPPORT_DENSITY`, `FOLLOWING`, `NEW_IN_CLUSTER`, `EDITORIAL`

### Curator Reputation (CR)
- Weighted events with time decay (half-life 90 days).
- Update: `newCR = currentCR + 0.1 * crDelta`
- Clamp between `minCR` and `maxCR`.
- Scale: default `0.1` to `10.0` (`DEFAULT_CR_CONFIG`).
- Multiplier: `clamp(0.5, 2.0, 0.5 + 0.5 * log10(cr * 10))`.

### Culture Points (CP)
- Issued on contribution events (note adopted/referenced, collection adopted/
  referenced, bridge success, archive contribution, quality edit, community
  reward).
- Diminishing: `max(minMultiplier, 1 / (1 + rate * (n - 1)))`.
- Amount: `round(baseAmount * diminishing * crMultiplier)`, with `crMultiplier`
  capped to `0.9..1.1` in v1.0.
- Stakes lock CP and can unlock/bonus/slash based on outcomes.

### Contribution attribution (spec)
- Contribution value equals CP issuance amount.
- Events are attributed to target content with split rules (note/collection/
  bridge/etc).
- Attribution is recorded in a ContributionLedger and aggregated into
  ContentCulturalStats for CVS components (app responsibility).

### Edge cases and stability
- Clamp percentile to 0..1.
- Clamp CR to avoid `log10(0)`.
- Diminishing count uses a minimum of 1.
- Clamp `viewWeight` to 0.2..2.0; unique views are 24h-windowed.
- LSH uses `u1 >= 1e-12`; DNS ages are non-negative; K-means clamps `k`.

## Design Notes
- Inputs are snapshots. The package does not store state or read databases.
- CVS requires precomputed components (like/context/collection/bridge/sustain).
- Reason codes use optional public metrics and PRS sources when available.

## Specifications (monorepo)
- `docs/SPECS/algorithm.md`
- `docs/SPECS/cultural-contribution.md`

## Build and Test
```bash
cd packages/algorithm
bun install
bun run build
bun run typecheck
bun run test
```

## Version
- ALGORITHM_ID: bunkarium-culture-rank
- ALGORITHM_VERSION: 1.0.0
- CONTRACT_VERSION: 1.0
