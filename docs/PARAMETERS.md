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
| `weights.prs` | 0.70 | 0.0-1.0 | Personal relevance |
| `weights.cvs` | 0.30 | 0.0-1.0 | Cultural value |
| **CVS Components** |
| `cvsComponentWeights.like` | 0.40 | 0.0-1.0 | Like signal |
| `cvsComponentWeights.context` | 0.25 | 0.0-1.0 | Context signal |
| `cvsComponentWeights.collection` | 0.20 | 0.0-1.0 | Collection signal |
| `cvsComponentWeights.bridge` | 0.10 | 0.0-1.0 | Bridge signal |
| `cvsComponentWeights.sustain` | 0.05 | 0.0-1.0 | Sustain signal |
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
| `diminishing.rate` | 0.05 | 0.05-0.30 | Issuance decay |
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

### PRS / CVS Balance

**Default**: `{ prs: 0.70, cvs: 0.30 }`

**Must sum to 1.0**.

#### Use Cases

**1. Following-heavy feed**:
```typescript
const params = {
  weights: { prs: 0.80, cvs: 0.20 }
}
```

**2. Quality-first feed**:
```typescript
const params = {
  weights: { prs: 0.50, cvs: 0.50 }
}
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

**Default**: `0.05`

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
  weights: { prs: 0.70, cvs: 0.30 }
}
```

### Following (Familiar)
```typescript
const FOLLOWING_PARAMS = {
  weights: { prs: 0.80, cvs: 0.20 }
}
```

### Scenes (Cluster-focused)
```typescript
const SCENES_PARAMS = {
  weights: { prs: 0.50, cvs: 0.50 }
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
- **Engagement**: Higher PRS weight
- **Quality**: Higher CVS weight, context/bridge signals
- **Virality**: Higher like component in CVS
- **Balance**: Default params

### 3. Make Incremental Changes

Change one parameter at a time by small amounts:

```typescript
// Baseline
const baseline = { weights: { prs: 0.70, cvs: 0.30 } }

// Test: More cultural value
const test1 = { weights: { prs: 0.60, cvs: 0.40 } }

// Test: Quality-first
const test2 = { weights: { prs: 0.50, cvs: 0.50 } }
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

### "Low-quality content ranks high"

**Problem**: Spam, clickbait, low-effort posts succeed

**Solutions**:
1. Increase cultural value weight:
   ```typescript
   weights: { prs: 0.50, cvs: 0.50 }
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

### "Not enough new content"

**Problem**: Stale, old items dominate

**Solutions**:
1. Lower support density prior:
   ```typescript
   publicMetrics: {
     priorViews: 5, // Down from 10
     priorLikes: 0
   }
   ```

2. Use feed configuration to prioritize recent posts:
   ```typescript
   // In feed-service.ts
   clusterWindowDays: 2, // Down from 3
   followingWindowDays: 5, // Down from 7
   ```

---

## Further Reading

- [Architecture](./ARCHITECTURE.md) - System design
- [Formulas](./FORMULAS.md) - Mathematical details
- [Usage Guide](./USAGE.md) - Code examples
- [Main Spec](../../../docs/SPECS/algorithm.md) - Full specification
