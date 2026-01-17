# Parameter Tuning Guide

## Overview

This guide helps you understand and tune algorithm parameters for different use cases.

## Quick Reference

| Parameter | Default | Range | Purpose |
|-----------|---------|-------|---------|
| **Like Decay** |
| `likeDecayAlpha` | 0.05 | 0.01-0.20 | Decay rate |
| `rapidPenaltyThreshold` | 50 | 10-100 | Spam threshold |
| `rapidPenaltyMultiplier` | 0.1 | 0.05-0.5 | Spam penalty |
| **Scoring Weights** |
| `weights.prs` | 0.55 | 0.0-1.0 | Personal relevance |
| `weights.cvs` | 0.25 | 0.0-1.0 | Cultural value |
| `weights.dns` | 0.20 | 0.0-1.0 | Diversity/novelty |
| **CVS Components** |
| `cvsComponentWeights.like` | 0.40 | 0.0-1.0 | Like signal |
| `cvsComponentWeights.context` | 0.25 | 0.0-1.0 | Context signal |
| `cvsComponentWeights.collection` | 0.20 | 0.0-1.0 | Collection signal |
| `cvsComponentWeights.bridge` | 0.10 | 0.0-1.0 | Bridge signal |
| `cvsComponentWeights.sustain` | 0.05 | 0.0-1.0 | Sustain signal |
| **DNS** |
| `clusterNoveltyFactor` | 0.06 | 0.01-0.20 | Exposure decay |
| `timeHalfLifeHours` | 72 | 12-168 | Time novelty |
| `dnsClusterNoveltyWeight` | 0.6 | 0.0-1.0 | Cluster weight |
| `dnsTimeNoveltyWeight` | 0.4 | 0.0-1.0 | Time weight |
| **Diversity** |
| `diversityCapN` | 20 | 10-50 | Window size |
| `diversityCapK` | 5 | 2-10 | Cluster cap |
| `explorationBudget` | 0.15 | 0.0-0.30 | Random sampling |
| `mmrLambda` | 0.7 | 0.0-1.0 | Relevance vs diversity |
| **Public Metrics** |
| `beta` | 1.0 | 0.5-2.0 | Density sensitivity |
| `priorViews` | 10 | 1-100 | Bayesian prior |
| `priorLikes` | 1 | 0-10 | Bayesian prior |
| `halfLifeDays` | 14 | 7-90 | Persistence decay |
| **CR** |
| `minCR` | 0.1 | 0.01-1.0 | CR floor |
| `maxCR` | 10.0 | 2.0-100.0 | CR ceiling |
| `decayHalfLifeDays` | 90 | 30-365 | CR decay |
| `learningRate` | 0.1 | 0.01-0.5 | Update speed |
| **CP** |
| `diminishing.rate` | 0.1 | 0.05-0.30 | Issuance decay |
| `diminishing.minMultiplier` | 0.2 | 0.1-0.5 | Issuance floor |
| `stake.minStakeAmount` | 50 | 10-500 | Min stake CP |
| `stake.successBonusRate` | 0.2 | 0.0-0.5 | Success bonus |
| `stake.failureSlashRate` | 0.3 | 0.1-0.5 | Failure penalty |

---

## Like Decay Parameters

### Alpha (Decay Coefficient)

Controls how quickly like weight decreases.

**Default**: `0.05`

**Effects**:
- **Lower (0.01-0.03)**: Slower decay, more tolerance for volume
  - User can like 50 items before weight drops to 50%
  - Use for: Communities with high engagement
- **Default (0.05)**: Moderate decay
  - ~20 likes to reach 50% weight
  - Use for: General purpose
- **Higher (0.10-0.20)**: Faster decay, stricter farming prevention
  - <10 likes to reach 50% weight
  - Use for: Small, quality-focused communities

**Example**:
```typescript
// Lenient (high-engagement community)
const params = {
  likeDecayAlpha: 0.02 // Weight stays high longer
}

// Strict (anti-farming)
const params = {
  likeDecayAlpha: 0.15 // Weight drops quickly
}
```

### Rapid Penalty Threshold

Number of likes in 30 seconds that triggers spam penalty.

**Default**: `50`

**Effects**:
- **Lower (10-30)**: Stricter bot detection
  - Use for: Public, anonymous platforms
- **Higher (50-100)**: More tolerant
  - Use for: Trusted communities, batch operations

**Example**:
```typescript
// Strict spam prevention
const params = {
  rapidPenaltyThreshold: 20,
  rapidPenaltyMultiplier: 0.05 // 95% reduction
}
```

---

## Scoring Weight Parameters

### PRS / CVS / DNS Balance

**Default**: `{ prs: 0.55, cvs: 0.25, dns: 0.20 }`

**Must sum to 1.0**.

#### Use Cases

**1. Following-heavy feed** (Twitter-like):
```typescript
const params = {
  weights: {
    prs: 0.70, // High personal relevance
    cvs: 0.20,
    dns: 0.10  // Low diversity
  }
}
```

**2. Discovery feed** (TikTok-like):
```typescript
const params = {
  weights: {
    prs: 0.20, // Low personal relevance
    cvs: 0.30,
    dns: 0.50  // High diversity
  }
}
```

**3. Balanced home feed**:
```typescript
const params = {
  weights: {
    prs: 0.45,
    cvs: 0.35,
    dns: 0.20
  }
}
```

**4. Quality-first**:
```typescript
const params = {
  weights: {
    prs: 0.30,
    cvs: 0.60, // High cultural value
    dns: 0.10
  }
}
```

#### Dynamic Adjustment

Map user diversity slider (0.0-1.0) to weights:

```typescript
function getWeights(diversitySlider: number) {
  const dnsWeight = 0.15 + diversitySlider * 0.20 // 0.15-0.35
  const prsWeight = 0.60 - diversitySlider * 0.15 // 0.45-0.60
  const cvsWeight = 0.25 // Fixed

  return { prs: prsWeight, cvs: cvsWeight, dns: dnsWeight }
}

// Slider at 0.0 (no diversity): { prs: 0.60, cvs: 0.25, dns: 0.15 }
// Slider at 0.5 (medium):       { prs: 0.525, cvs: 0.25, dns: 0.225 }
// Slider at 1.0 (max diversity): { prs: 0.45, cvs: 0.25, dns: 0.35 }
```

---

## CVS Component Weights

**Default**: `{ like: 0.40, context: 0.25, collection: 0.20, bridge: 0.10, sustain: 0.05 }`

**Must sum to 1.0**.

### Like Component

Weight of direct like signal.

**Higher (0.50-0.60)**: Popularity-focused
**Lower (0.20-0.30)**: De-emphasize virality

### Context Component

Weight of context notes (annotations, references).

**Higher (0.30-0.40)**: Reward thoughtful engagement
**Lower (0.10-0.20)**: De-emphasize complexity

### Collection Component

Weight of saves to collections.

**Higher (0.25-0.35)**: Reward curation
**Lower (0.10-0.15)**: De-emphasize bookmarking

### Bridge Component

Weight of cross-cluster engagement.

**Higher (0.15-0.25)**: Reward bridging content
**Lower (0.05-0.10)**: Focus within clusters

### Sustain Component

Weight of long-term engagement.

**Higher (0.10-0.20)**: Reward evergreen content
**Lower (0.02-0.05)**: Focus on recent activity

#### Example Profiles

**Community-building focus**:
```typescript
const cvsComponentWeights = {
  like: 0.30,
  context: 0.30,
  collection: 0.20,
  bridge: 0.15, // Reward bridging
  sustain: 0.05
}
```

**Viral content focus**:
```typescript
const cvsComponentWeights = {
  like: 0.60,    // High like weight
  context: 0.15,
  collection: 0.15,
  bridge: 0.05,
  sustain: 0.05
}
```

**Curation focus**:
```typescript
const cvsComponentWeights = {
  like: 0.25,
  context: 0.25,
  collection: 0.35, // High collection weight
  bridge: 0.10,
  sustain: 0.05
}
```

---

## DNS Parameters

### Cluster Novelty Factor

Controls how quickly cluster exposure reduces novelty.

**Default**: `0.06`

Formula: `novelty = exp(-k × exposureCount)`

**Effects**:
- **Lower (0.02-0.04)**: Slower decay
  - 10 exposures → novelty ≈ 0.67
  - Use for: Small cluster sets
- **Higher (0.10-0.15)**: Faster decay
  - 10 exposures → novelty ≈ 0.22
  - Use for: Large cluster sets, strict variety

### Time Half-Life Hours

How quickly time novelty decays.

**Default**: `72` (3 days)

**Effects**:
- **Shorter (24-48)**: Favor very recent content
  - Use for: News, real-time events
- **Longer (168-336)**: Tolerate older content
  - Use for: Evergreen, educational content

**Example**:
```typescript
// News feed (fresh content only)
const params = {
  timeHalfLifeHours: 24,
  dnsTimeNoveltyWeight: 0.6 // Emphasize recency
}

// Evergreen feed
const params = {
  timeHalfLifeHours: 168, // 7 days
  dnsTimeNoveltyWeight: 0.3 // De-emphasize recency
}
```

### DNS Component Weights

**Default**: `{ clusterNovelty: 0.6, timeNovelty: 0.4 }`

**Must sum to 1.0**.

**Cluster-focused**:
```typescript
const params = {
  dnsClusterNoveltyWeight: 0.8,
  dnsTimeNoveltyWeight: 0.2
}
```

**Time-focused**:
```typescript
const params = {
  dnsClusterNoveltyWeight: 0.3,
  dnsTimeNoveltyWeight: 0.7
}
```

---

## Diversity Reranking Parameters

### Diversity Cap (N-in-K Rule)

**Default**: `{ diversityCapN: 20, diversityCapK: 5 }`

Within any N items, at most K from same cluster.

**Examples**:

**Strict diversity**:
```typescript
const params = {
  diversityCapN: 15,
  diversityCapK: 3 // Max 3 per 15 (20%)
}
```

**Moderate diversity** (default):
```typescript
const params = {
  diversityCapN: 20,
  diversityCapK: 5 // Max 5 per 20 (25%)
}
```

**Lenient diversity**:
```typescript
const params = {
  diversityCapN: 20,
  diversityCapK: 8 // Max 8 per 20 (40%)
}
```

**No cluster caps** (disable):
```typescript
const params = {
  diversityCapN: 1000,
  diversityCapK: 1000
}
```

### Exploration Budget

Fraction of feed filled by random exploration.

**Default**: `0.15` (15%)

**Effects**:
- **Lower (0.05-0.10)**: More predictable, relevance-focused
  - Use for: Following feeds
- **Higher (0.20-0.30)**: More serendipity
  - Use for: Discovery feeds

**Example**:
```typescript
// Following feed (low exploration)
const params = {
  explorationBudget: 0.05
}

// Discovery feed (high exploration)
const params = {
  explorationBudget: 0.25
}
```

### MMR Lambda

Balance between relevance and diversity in MMR reranking.

**Default**: `0.7`

**Formula**: `MMR = λ × relevance - (1 - λ) × similarity`

**Effects**:
- **Higher (0.8-0.9)**: Favor relevance (less diversity)
- **Lower (0.5-0.6)**: Favor diversity (more variety)

**Example**:
```typescript
// Relevance-focused
const params = {
  mmrLambda: 0.85
}

// Diversity-focused
const params = {
  mmrLambda: 0.55
}
```

---

## Public Metrics Parameters

### Beta (Support Density Sensitivity)

Adjusts support density calculation.

**Default**: `1.0`

**Formula**: `supportDensity^β`

**Effects**:
- **< 1.0 (0.5-0.9)**: Compress differences (more egalitarian)
  - 30% → 55%, 60% → 77%
- **= 1.0**: Linear (no adjustment)
- **> 1.0 (1.5-2.0)**: Amplify differences (reward winners)
  - 30% → 9%, 60% → 36%

**Example**:
```typescript
// Compress differences (anti-winner-takes-all)
const params = {
  publicMetrics: {
    beta: 0.7
  }
}

// Amplify differences (reward popularity)
const params = {
  publicMetrics: {
    beta: 1.5
  }
}
```

### Priors (Bayesian Smoothing)

Prevent extreme metrics for low-sample items.

**Default**: `{ priorViews: 10, priorLikes: 1, priorUniqueLikers: 1 }`

**Effects**:
- **Higher priors**: More conservative, favor established content
- **Lower priors**: Allow new content to spike quickly

**Example**:
```typescript
// Conservative (established content advantage)
const params = {
  publicMetrics: {
    priorViews: 50,
    priorLikes: 5
  }
}

// Aggressive (allow viral spikes)
const params = {
  publicMetrics: {
    priorViews: 5,
    priorLikes: 0
  }
}
```

### Half-Life Days (Persistence Decay)

How quickly persistence decays over time.

**Default**: `14` days

**Example**:
```typescript
// Fast decay (favor fresh engagement)
const params = {
  publicMetrics: {
    halfLifeDays: 7
  }
}

// Slow decay (reward long-term value)
const params = {
  publicMetrics: {
    halfLifeDays: 30
  }
}
```

---

## CR Parameters

### Min/Max CR

Bounds for CR scores.

**Default**: `{ minCR: 0.1, maxCR: 10.0 }`

**Wider range (0.01-100.0)**: More extreme multipliers
**Narrower range (0.5-5.0)**: More moderate effects

### Decay Half-Life

How quickly CR decays toward baseline (1.0) without activity.

**Default**: `90` days

**Shorter (30-60)**: Requires frequent activity
**Longer (180-365)**: More persistent reputation

### Learning Rate

How quickly CR updates from events.

**Default**: `0.1`

**Lower (0.01-0.05)**: Slow, stable changes
**Higher (0.20-0.30)**: Fast, volatile changes

**Example**:
```typescript
// Stable, long-term CR
const params = {
  cr: {
    decayHalfLifeDays: 180,
    learningRate: 0.05
  }
}

// Responsive, short-term CR
const params = {
  cr: {
    decayHalfLifeDays: 60,
    learningRate: 0.20
  }
}
```

---

## CP Parameters

### Diminishing Rate

How quickly CP issuance diminishes with frequent events.

**Default**: `0.1`

**Formula**: `multiplier = 1 / (1 + rate × count)`

**Lower (0.05)**: Slower diminishing
**Higher (0.20)**: Faster diminishing

### Min Multiplier

Floor for CP issuance (even with spam).

**Default**: `0.2` (20% of base)

**Higher (0.4-0.5)**: More tolerant of volume
**Lower (0.1-0.15)**: Stricter farming prevention

### Stake Parameters

**Min Stake Amount**: Minimum CP to stake
- Default: 50 CP
- Higher: Limit to established curators

**Success Bonus Rate**: Bonus for successful stake
- Default: 0.2 (20% bonus)
- Higher: Reward risk-taking

**Failure Slash Rate**: Penalty for failed stake
- Default: 0.3 (30% slash)
- Higher: Punish bad recommendations

**Example**:
```typescript
// Encourage staking (low barrier, high reward)
const params = {
  cp: {
    stake: {
      minStakeAmount: 25,
      successBonusRate: 0.30,
      failureSlashRate: 0.20
    }
  }
}

// Discourage frivolous staking
const params = {
  cp: {
    stake: {
      minStakeAmount: 100,
      successBonusRate: 0.15,
      failureSlashRate: 0.40
    }
  }
}
```

---

## Surface-Specific Presets

### Home Mix (Balanced)
```typescript
const HOME_MIX_PARAMS = {
  weights: { prs: 0.55, cvs: 0.25, dns: 0.20 },
  explorationBudget: 0.15,
  diversityCapN: 20,
  diversityCapK: 5,
  mmrLambda: 0.70
}
```

### Home Diverse (Discovery)
```typescript
const HOME_DIVERSE_PARAMS = {
  weights: { prs: 0.20, cvs: 0.30, dns: 0.50 },
  explorationBudget: 0.30,
  diversityCapN: 15,
  diversityCapK: 3,
  mmrLambda: 0.60
}
```

### Following (Familiar)
```typescript
const FOLLOWING_PARAMS = {
  weights: { prs: 0.70, cvs: 0.20, dns: 0.10 },
  explorationBudget: 0.05,
  diversityCapN: 25,
  diversityCapK: 8,
  mmrLambda: 0.80
}
```

### Scenes (Cluster-focused)
```typescript
const SCENES_PARAMS = {
  weights: { prs: 0.40, cvs: 0.40, dns: 0.20 },
  explorationBudget: 0.10,
  diversityCapN: 20,
  diversityCapK: 10, // More lenient within cluster
  mmrLambda: 0.75
}
```

---

## Tuning Workflow

### 1. Start with Defaults

```typescript
import { DEFAULT_PARAMS } from '@bunkarium/algorithm'

const params = { ...DEFAULT_PARAMS }
```

### 2. Identify Goal

What are you optimizing for?
- **Engagement**: Higher CVS weight, lower diversity
- **Discovery**: Higher DNS weight, higher exploration
- **Quality**: Higher CVS component for context/bridge
- **Virality**: Higher like component, lower diversity
- **Balance**: Default params

### 3. Make Incremental Changes

Change one parameter at a time by small amounts:

```typescript
// Baseline
const baseline = { weights: { prs: 0.55, cvs: 0.25, dns: 0.20 } }

// Test: Slightly more diversity
const test1 = { weights: { prs: 0.50, cvs: 0.25, dns: 0.25 } }

// Test: Significantly more diversity
const test2 = { weights: { prs: 0.40, cvs: 0.30, dns: 0.30 } }
```

### 4. Measure Impact

Use offline evaluation:

```typescript
import { evaluateOffline } from '@bunkarium/algorithm'

const baselineMetrics = evaluateOffline(exposures_baseline, popularity, totalClusters)
const test1Metrics = evaluateOffline(exposures_test1, popularity, totalClusters)

console.log('Gini improvement:',
  (test1Metrics.giniCoefficient - baselineMetrics.giniCoefficient) / baselineMetrics.giniCoefficient
)
console.log('Coverage improvement:',
  test1Metrics.clusterCoverage - baselineMetrics.clusterCoverage
)
```

### 5. A/B Test

Run live experiment:

```typescript
function getParamsForUser(userId: string) {
  const variant = hashUserId(userId) % 2

  return variant === 0
    ? BASELINE_PARAMS
    : TEST_PARAMS
}
```

Analyze results:

```typescript
const { control, treatment, improvement } = compareABTest(
  controlExposures,
  treatmentExposures,
  popularity,
  totalClusters
)

console.log('Gini improvement:', improvement.giniCoefficient)
console.log('Coverage improvement:', improvement.clusterCoverage)
```

### 6. Iterate

Based on results, refine parameters and repeat.

---

## Common Scenarios

### "Feed is too repetitive"

**Problem**: Same clusters/items keep appearing

**Solutions**:
1. Increase diversity weight:
   ```typescript
   weights: { prs: 0.45, cvs: 0.25, dns: 0.30 }
   ```

2. Stricter cluster caps:
   ```typescript
   diversityCapK: 3 // Down from 5
   ```

3. More exploration:
   ```typescript
   explorationBudget: 0.20 // Up from 0.15
   ```

4. Higher cluster novelty penalty:
   ```typescript
   clusterNoveltyFactor: 0.10 // Up from 0.06
   ```

### "Feed is too random"

**Problem**: Irrelevant items, no coherence

**Solutions**:
1. Increase personal relevance:
   ```typescript
   weights: { prs: 0.65, cvs: 0.25, dns: 0.10 }
   ```

2. Reduce exploration:
   ```typescript
   explorationBudget: 0.08 // Down from 0.15
   ```

3. More lenient cluster caps:
   ```typescript
   diversityCapK: 7 // Up from 5
   ```

4. Higher MMR lambda (favor relevance):
   ```typescript
   mmrLambda: 0.80 // Up from 0.70
   ```

### "Not enough new content"

**Problem**: Stale, old items dominate

**Solutions**:
1. Increase time novelty weight:
   ```typescript
   dnsTimeNoveltyWeight: 0.6 // Up from 0.4
   dnsClusterNoveltyWeight: 0.4
   ```

2. Shorter time half-life:
   ```typescript
   timeHalfLifeHours: 48 // Down from 72
   ```

3. Lower support density prior:
   ```typescript
   publicMetrics: {
     priorViews: 5, // Down from 10
     priorLikes: 0
   }
   ```

### "Low-quality content ranks high"

**Problem**: Spam, clickbait, low-effort posts succeed

**Solutions**:
1. Increase cultural value weight:
   ```typescript
   weights: { prs: 0.45, cvs: 0.40, dns: 0.15 }
   ```

2. Emphasize context/bridge signals:
   ```typescript
   cvsComponentWeights: {
     like: 0.30,
     context: 0.35, // Up from 0.25
     collection: 0.20,
     bridge: 0.10,
     sustain: 0.05
   }
   ```

3. Stricter like decay:
   ```typescript
   likeDecayAlpha: 0.10 // Up from 0.05
   ```

4. Higher spam penalty:
   ```typescript
   // In quality flags
   spamSuspect: true → penalty = 0.3 (down from 0.5)
   ```

---

## Further Reading

- [Architecture](./ARCHITECTURE.md) - System design
- [Formulas](./FORMULAS.md) - Mathematical details
- [Usage Guide](./USAGE.md) - Code examples
- [Main Spec](../../../docs/SPECS/algorithm.md) - Full specification
