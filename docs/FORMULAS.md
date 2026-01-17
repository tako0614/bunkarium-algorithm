# Mathematical Formulas

## Like Decay

### Basic Weight Formula

The like weight decreases as a user likes more items within a time window:

```
w(u) = 1 / (1 + α × (n - 1))
```

Where:
- `w(u)`: Weight for user u's like (0.0 to 1.0)
- `α`: Decay coefficient (default: 0.05)
- `n`: Number of likes in window (likeWindowCount)

**Examples**:
- 1st like: `w = 1 / (1 + 0.05 × 0) = 1.0`
- 10th like: `w = 1 / (1 + 0.05 × 9) = 0.689`
- 20th like: `w = 1 / (1 + 0.05 × 19) = 0.513`
- 100th like: `w = 1 / (1 + 0.05 × 99) = 0.168`

### Rapid Penalty

If user exceeds threshold within 30 seconds, apply penalty:

```
w_final = w_base × penaltyMultiplier    (if rapid)
        = w_base                         (otherwise)
```

Where:
- `rapidThreshold`: Default 50 likes in 30s
- `penaltyMultiplier`: Default 0.1 (90% reduction)

**Purpose**: Prevent spam/bot behavior while keeping likes pressable.

### Predicting Next Like Weight

Given current state, predict next like's weight:

```
w_next = 1 / (1 + α × n)
```

Used for UI hints (e.g., "Your next like will have 68% support power").

---

## Curator Reputation (CR)

### CR Multiplier

Maps CR score (0.1-10.0) to like weight multiplier (0.5-2.0):

```
x = log₁₀(CR_clamped / CR_min) / log₁₀(CR_max / CR_min)

CR_m = 0.5 + 1.5 × x_clamped
```

Where:
- `CR_clamped`: CR value clamped to [CR_min, CR_max]
- `CR_min`: 0.1 (default)
- `CR_max`: 10.0 (default)
- `x_clamped`: Clamped to [0, 1]

**Examples**:
- CR = 0.1: `x = 0.0` → `CRm = 0.5`
- CR = 1.0: `x = 0.5` → `CRm = 1.25`
- CR = 10.0: `x = 1.0` → `CRm = 2.0`

**Logarithmic scaling** ensures:
- Low CR (0.1-1.0): Multiplier 0.5-1.25 (penalty zone)
- Medium CR (1.0-3.0): Multiplier 1.25-1.6 (normal zone)
- High CR (3.0-10.0): Multiplier 1.6-2.0 (bonus zone)

### CR Update Formula

After curation event:

```
Δ = event_weight × outcome_score

CR_new = CR_old + learning_rate × Δ
```

Then apply time decay:

```
decay_factor = 0.5^(days_since_last / halfLifeDays)

CR_decayed = CR_base + (CR_current - CR_base) × decay_factor
```

Where:
- `CR_base`: 1.0 (neutral point)
- `halfLifeDays`: 90 days (default)
- Decay pulls CR toward 1.0 over time

**Event weights** (default):
- Note adopted: +0.15
- Bridge success: +0.25
- Stake success: +0.20
- Stake failure: -0.15
- Spam flag: -0.30

---

## Culture Points (CP)

### Diminishing Multiplier

CP issuance diminishes with frequent events:

```
multiplier = 1 / (1 + rate × count)
```

But never below `minMultiplier`:

```
m_final = max(minMultiplier, multiplier)
```

Where:
- `rate`: 0.1 (default)
- `minMultiplier`: 0.2 (default, 20% floor)

**Example** (noteAdopted events in 24h):
- 1st: `m = 1.0` → `CP = 10`
- 5th: `m = 0.71` → `CP = 7.1`
- 10th: `m = 0.5` → `CP = 5.0`
- 50th: `m = 0.2` (floor) → `CP = 2.0`

### CR Multiplier for CP

High CR earns bonus CP:

```
CP_multiplier = min(1.1, 1.0 + 0.1 × (CR - 1.0))
```

Capped at 1.1 (10% bonus max).

### Final CP Issuance

```
CP = base_amount × diminishing_multiplier × CR_multiplier
```

**Example**:
- Base: 10 CP
- Diminishing (5th event): 0.71
- CR (2.0): 1.1
- Final: `10 × 0.71 × 1.1 = 7.81 CP`

### Stake Evaluation

Stake succeeds if `totalScore > threshold` (default: 0.5):

```
supportDensityScore = Δ_supportDensity
breadthScore = Δ_breadth / 5
contextScore = Δ_contextCount / 10
crossClusterScore = crossClusterReactions / 10

totalScore = 0.4 × supportDensityScore
           + 0.3 × breadthScore
           + 0.2 × contextScore
           + 0.1 × crossClusterScore
```

**Rewards**:
- Success: Unlock stake + bonus (20% of stake default)
- Failure: Slash (30% of stake default)

---

## Cultural View Value (CVV)

### View Weight

Combines CR and CP earned (90d):

```
CR_m = getCRMultiplier(CR)

CP_m = min(1.2, max(0.8, 0.8 + 0.2 × log₁₀(1 + CP_90d / 50)))

view_weight = CR_m × CP_m
```

Clamped to [0.2, 2.0].

**Examples**:
- CR=1.0, CP=0: `w = 1.25 × 0.8 = 1.0`
- CR=2.0, CP=100: `w = 1.5 × 1.02 = 1.53`
- CR=5.0, CP=500: `w = 1.87 × 1.2 = 2.0` (capped)

**Purpose**: Engaged curators' views count more toward visibility.

---

## Public Metrics

### Support Density

Ratio of weighted likes to qualified views, with Bayesian smoothing:

```
support_density = (weightedLikeSum + priorLikes)
                / (qualifiedUniqueViewers + priorViews)
```

Default priors: `priorLikes = 1`, `priorViews = 10`

Can be raised to power `β` for sensitivity adjustment:

```
support_density_adj = support_density^β
```

Default `β = 1.0` (no adjustment).

### Support Rate

Raw conversion rate (unique likers / unique viewers):

```
support_rate = (uniqueLikers + priorUniqueLikers)
             / (qualifiedUniqueViewers + priorViews)
```

Default: `priorUniqueLikers = 1`

### Weighted Support Index

Ratio without upper clamp (can exceed 1.0):

```
WSI = (weightedLikeSum + priorLikes)
    / (qualifiedUniqueViewers + priorViews)
```

### Weighted Support Rate (Clamped)

Same as WSI but clamped to [0, 1]:

```
WSR_clamped = min(1.0, WSI)
```

### Breadth (Effective Cluster Count)

Uses inverse Simpson index:

```
breadth = (Σ w_c)² / Σ(w_c²)
```

Where `w_c` is the weighted like sum from cluster c.

**Interpretation**:
- Breadth ≈ 1: All support from one cluster
- Breadth ≈ 5: Support evenly spread across ~5 clusters
- Breadth > 10: Broad cross-cluster appeal

### Persistence (Days)

Estimate how long reactions continue:

```
persistence = daysSinceFirst × recentRate
```

With time decay adjustment:

```
decay_factor = 0.5^(daysSinceFirst / halfLifeDays)

persistence_adj = persistence × decay_factor
```

Default `halfLifeDays = 14`.

**Persistence levels**:
- Low: < 1 day
- Medium: 1-7 days
- High: > 7 days

### Top Cluster Share

What fraction of support comes from the largest cluster:

```
top_cluster_share = max(w_c) / Σ w_c
```

**Interpretation**:
- 1.0: All from one cluster (narrow)
- 0.5: Top cluster is 50% (moderate)
- 0.2: Well distributed (broad)

---

## Scoring: PRS / CVS / DNS

### Personal Relevance Score (PRS)

```
PRS = {
  1.0   if prsSource = 'saved'
  0.8   if prsSource = 'liked'
  0.6   if prsSource = 'following'
  0.0   otherwise (unknown)
}
```

No complex modeling; direct signal from user history.

### Cultural Value Score (CVS)

Weighted sum of 5 components:

```
CVS = w_like    × like
    + w_context × context
    + w_collection × collection
    + w_bridge × bridge
    + w_sustain × sustain
```

Default weights (from algorithm.md v1.0):
- `w_like = 0.40`
- `w_context = 0.25`
- `w_collection = 0.20`
- `w_bridge = 0.10`
- `w_sustain = 0.05`

Each component normalized to [0, 1].

**Like component**:
```
like = min(1.0, weightedLikeSum / 100)
```

**Context component**:
```
context = min(1.0, contextNoteCount / 20)
```

**Collection component**:
```
collection = min(1.0, collectionSaveCount / 50)
```

**Bridge component**:
```
bridge = min(1.0, crossClusterEngagement / 10)
```

**Sustain component**:
```
sustain = min(1.0, persistenceDays / 30)
```

### Diversity/Novelty Score (DNS)

Combines cluster novelty and time novelty:

```
DNS = w_cluster × clusterNovelty
    + w_time × timeNovelty
```

Default weights:
- `w_cluster = 0.6`
- `w_time = 0.4`

**Cluster novelty**:
```
exposureCount = recentClusterExposures[clusterId] ?? 0

clusterNovelty = exp(-k × exposureCount)
```

Where `k = 0.06` (default `clusterNoveltyFactor`).

**Examples**:
- 0 exposures: `novelty = 1.0` (fully novel)
- 5 exposures: `novelty = 0.74`
- 10 exposures: `novelty = 0.55`
- 20 exposures: `novelty = 0.30`

**Time novelty**:
```
age_hours = (nowTs - createdAt) / 3600000

timeNovelty = 0.5^(age_hours / halfLife_hours)
```

Default `halfLife_hours = 72` (3 days).

**Examples**:
- 0 hours old: `novelty = 1.0`
- 72 hours old: `novelty = 0.5`
- 144 hours old: `novelty = 0.25`

### Mixed Score

```
finalScore = w_prs × PRS
           + w_cvs × CVS
           + w_dns × DNS
```

Default weights:
- `w_prs = 0.55`
- `w_cvs = 0.25`
- `w_dns = 0.20`

Then apply penalty:

```
penalty = spamSuspect ? 0.5 : 1.0

finalScore_penalized = finalScore × penalty
```

---

## Diversity Reranking

### Cluster Caps (N-in-K Rule)

Within any sliding window of N items, at most K items from same cluster.

**Example** (N=20, K=5):
```
Position 0-19: Max 5 from cluster A
Position 1-20: Max 5 from cluster A
...
```

### Exploration Slots

Random sampling for discovery:

```
explorationCount = floor(totalCount × explorationBudget)
```

Default `explorationBudget = 0.15` (15% of feed).

Uses deterministic PRNG (Xorshift64) with `requestSeed`.

### MMR (Maximal Marginal Relevance)

Score each remaining candidate:

```
MMR(i) = λ × relevance(i) - (1 - λ) × max_j∈S similarity(i, j)
```

Where:
- `λ`: Balance parameter (default 0.7)
- `S`: Already selected items
- `relevance(i)`: Normalized finalScore
- `similarity(i, j)`: Cosine/cluster/custom similarity

**Cosine similarity** (for embeddings):
```
sim(a, b) = (a · b) / (||a|| × ||b||)
```

Mapped to [0, 1]:
```
sim_01 = (sim + 1) / 2
```

**Cluster similarity**:
```
sim(a, b) = {
  1.0   if a.clusterId === b.clusterId
  0.0   otherwise
}
```

### DPP (Determinantal Point Process)

Builds kernel matrix:

```
K[i,j] = quality(i) × quality(j) × similarity(i, j)
```

Quality typically = finalScore.

Sample k items by greedily maximizing log-determinant:

```
score(S ∪ {i}) = log det(K_S∪{i})
```

**Complexity**: O(k³) for k items.

Use for small, high-quality diverse sets.

---

## Offline Evaluation Metrics

### Gini Coefficient

Measures inequality in exposure/engagement distribution:

```
values_sorted = sort(values)
n = length(values)

cumsum = cumulative_sum(values_sorted)
total = sum(values)

Gini = 1 - (2 / n) × Σ (cumsum[i] / total)
```

**Interpretation**:
- Gini = 0: Perfect equality
- Gini = 1: Perfect inequality (all to one item)
- Gini < 0.5: Relatively equal
- Gini > 0.7: Highly concentrated

### Long Tail Metrics

**Threshold**:
```
sorted_by_popularity = sort_desc(items, by: totalExposures)
threshold_index = floor(n × percentile)
threshold = sorted[threshold_index].totalExposures
```

Default `percentile = 0.2` (top 20% = head).

**Long tail exposure rate**:
```
tail_rate = exposures_tail / exposures_total
```

**Long tail click rate**:
```
tail_ctr = clicks_tail / exposures_tail
```

### Cluster Coverage

Fraction of clusters with at least one exposure:

```
coverage = unique_clusters_exposed / total_clusters
```

### Cluster Entropy

Shannon entropy of cluster exposure distribution:

```
p_c = exposures_cluster_c / exposures_total

entropy = -Σ p_c × log₂(p_c)
```

Normalized:

```
entropy_normalized = entropy / log₂(total_clusters)
```

**Interpretation**:
- 0: All from one cluster
- 1: Perfectly uniform across clusters

### User Diversity Score

Average unique clusters per user:

```
diversity = avg_users(unique_clusters_per_user)
```

### Position Bias

Average click position (lower = more top-heavy):

```
position_bias = Σ (position × clicked) / Σ clicked
```

**Interpretation**:
- Position bias ≈ 0-2: Very top-heavy
- Position bias ≈ 5-10: Moderate distribution
- Position bias > 10: Diverse clicking

---

## Numerical Precision

### Rounding Rules

- **finalScore**: 9 decimal places
- **Public metrics**: 6 decimal places
- **Intermediate calculations**: Full precision

### Safe Division

Always add priors or check for zero:

```typescript
// Good
const ratio = (numerator + prior) / (denominator + prior)

// Bad
const ratio = numerator / denominator  // Can be NaN!
```

### Clamping

All scores clamped to valid ranges:

```typescript
const clamped = Math.max(min, Math.min(max, value))
```

### Floating Point Stability

Use `Math.fround()` for deterministic 32-bit precision when needed.

---

## Summary Table

| Metric | Range | Purpose |
|--------|-------|---------|
| Like Weight | 0.0-1.0 | Spam prevention |
| CR Score | 0.1-10.0 | Curator quality |
| CR Multiplier | 0.5-2.0 | Like amplification |
| CP Multiplier | 0.2-1.0 | Issuance scaling |
| View Weight | 0.2-2.0 | Attention value |
| Support Density | 0.0-1.0+ | Like density |
| Support Rate | 0.0-1.0 | Conversion rate |
| Breadth | 0.0-∞ | Cluster spread |
| Persistence | 0.0-∞ days | Reaction longevity |
| PRS | 0.0-1.0 | Personal relevance |
| CVS | 0.0-1.0 | Cultural value |
| DNS | 0.0-1.0 | Novelty |
| Final Score | 0.0-1.0 | Combined ranking |
| Gini | 0.0-1.0 | Inequality |
| Coverage | 0.0-1.0 | Cluster fraction |
| Entropy (norm) | 0.0-1.0 | Distribution evenness |

---

## Further Reading

- [Architecture](./ARCHITECTURE.md) - System design
- [Usage Guide](./USAGE.md) - Code examples
- [Parameters](./PARAMETERS.md) - Tuning guide
- [Main Spec](../../../docs/SPECS/algorithm.md) - Normative spec
