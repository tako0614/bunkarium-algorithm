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

const { weight, supportPowerPercent, rapidPenaltyApplied } = calculateLikeWeight({
  likeWindowCount: 5,
  alpha: 0.05,
  recentLikeCount30s: 12,
  rapidPenaltyThreshold: 50,
  rapidPenaltyMultiplier: 0.1
})
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
  params: {
    diversityCapN: 20,
    diversityCapK: 5,
    explorationBudget: 0.15,
    rerankMinCandidatesPerCluster: 1,
    publicMetrics: {
      beta: 1.0,
      priorViews: 10,
      priorLikes: 1,
      halfLifeDays: 14,
      metricsWindowDays: 14
    },
    variantId: 'default'
  }
})
```
`RankResponse.paramSetId` mirrors the applied `variantId` for audit trails.

## Detailed Specification

### Inputs
- UserStateSnapshot: `userKey`, `likeWindowCount`, `recentLikeCount30s`,
  `recentClusterExposures`, `diversitySlider`, `curatorReputation`, `cpEarned90d`
- Candidate: `itemKey`, `type`, `clusterId`, `createdAt`, `features`
- CandidateFeatures: `cvsComponents`, `qualifiedUniqueViews`, `qualityFlags`,
  `embedding?`, `prs?`, `prsSource?`, `publicMetrics?`
- QualityFlags: `moderated` (passed moderation for the surface), `hardBlock?`, `spamSuspect`
- AlgorithmParams.surfacePolicies: `requireModerated` per surface (default true)

### Like decay
```
w(u) = 1 / (1 + alpha * (n - 1))
```
- Rapid penalty: if `recentLikeCount30s >= 50` in 30s, apply `weight * 0.1`.
- `calculateLikeWeight` applies the rapid penalty when `recentLikeCount30s` is provided.
- `likeWindowMs` defines the aggregation window (default 24h).

### Cultural View Value (spec)
- `crMultiplier = getCRMultiplier(CR)` (0.5 to 2.0)
- `cpMultiplier = clamp(0.8, 1.2, 0.8 + 0.2 * log10(1 + CP_earned_90d / 50))`
- `viewWeight = clamp(0.2, 2.0, crMultiplier * cpMultiplier)`
- Dedup/aggregation (24h window, fraud filtering) is app responsibility.
- `weightedViews = sum(viewWeight)` and `qualifiedUniqueViews` tracked separately.
- Support metrics use `qualifiedUniqueViews` as the denominator in v1.0.

### Public metrics
- `supportDensity = (weightedLikeSum + priorLikes) / ((qualifiedUniqueViews + priorViews) ^ beta)` (beta default 1.0)
- `supportRate = min(1, (weightedLikeSum + priorLikes) / (qualifiedUniqueViews + priorViews))`
- `breadth = exp(entropy(clusterDistribution))` (`clusterWeights` is normalized internally)
- `topClusterShare = max(p_i)`
- `persistence = recentReactionRate * (1 - exp(-ln(2) * ageDays / halfLifeDays)) * halfLifeDays`
- `CRm = getCRMultiplier(CR)` for weighted like aggregation
- Recommended: `clusterWeights` built from weighted likes per cluster (`weight_snapshot * getCRMultiplier(user_cr_snapshot)`).
- Default params (v1.0 contract): `priorLikes=1`, `priorViews=10`, `beta=1.0`, `halfLifeDays=14`.
- `persistenceLevel` thresholds scale with `halfLifeDays` (high >= 0.8*halfLifeDays, medium >= 0.5*halfLifeDays).
- Default aggregation window: `metricsWindowDays = 14` (applies to `clusterWeights`).
- `weightedLikeSum` / `qualifiedUniqueViews` / `weightedViews` must use the same window as `metricsWindowDays` for v1.0 conformance.
- `weightedLikeSum` should use `weight_snapshot * getCRMultiplier(user_cr_snapshot)`.
- The same values can be passed as `RankRequest.params.publicMetrics` to keep the contract explicit.
- If you override them, treat it as a named algorithm variant (`variantId`).

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
- PRS/CVS/DNS are expected to be normalized to 0..1 by the application; the
  algorithm only clamps as a safety guard.
- Recommended normalization: quantile-based 0..1 over a trailing window.
- Penalty:
  - `hardBlock` candidates are excluded
  - `moderated=false` is excluded when the surface requires moderation
  - `spamSuspect`: +0.5 (0..1 scale)
  - quality penalty is clamped to 0..1; similarity penalty is added in rerank
  - finalScore may be negative
  - similarity penalties are applied in reranking only
```
finalScore = w_prs*PRS + w_cvs*CVS + w_dns*DNS - penalty
```

### Diversity reranking
- Apply caps to the top N (default 20).
- Limit same-cluster exposure to K (default 5).
- Exploration budget default 0.15.
- Rerank candidates use per-cluster minimums (default 1) and may expand beyond the base cap (default 200).
- MMR/DPP variants supported with stabilized determinant math.
- Deterministic tie-break: `finalScore desc -> createdAt desc -> itemKey asc`.
- `requestSeed` is used for deterministic sampling in exploration slots.

### Explain codes
`SIMILAR_TO_SAVED`, `SIMILAR_TO_LIKED`, `FOLLOWING`, `GROWING_CONTEXT`,
`BRIDGE_SUCCESS`, `DIVERSITY_SLOT`, `EXPLORATION`, `HIGH_SUPPORT_DENSITY`,
`TRENDING_IN_CLUSTER`, `NEW_IN_CLUSTER`
Trigger conditions and priority are specified in `docs/SPECS/algorithm.md`.
SurfaceReasonCode: `EDITORIAL` (assigned by the feed layer).
`RankedItem.surfaceReasonCodes` can carry surface-specific reasons.
Use `SURFACE_REASON_DESCRIPTIONS` for labels.

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
- `docs/SPECS/metrics-pipeline.md`

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
