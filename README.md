# @bunkarium/algorithm

Pure TypeScript recommendation algorithms focused on **cultural diversity**.

**Stateless**, **DB-agnostic**, and designed as **composable functions** with a strict, versioned contract.  
Built for applications that want transparent, auditable, diversity-aware ranking without turning “likes” into a hard limit.

- **ALGORITHM_ID**: `bunkarium-culture-rank`  
- **ALGORITHM_VERSION**: `1.0.0`  
- **CONTRACT_VERSION**: `1.0`

---

## Why

Most social feeds optimize for raw totals (views/likes/follows), which tends to concentrate attention and homogenize culture.  
Bunkarium’s approach is different:

- Users can always react (likes are **always pressable**).
- Reaction impact diminishes with volume (**diminishing weight**, not “blocked likes”).
- Public-facing metrics emphasize **ratios/density/distribution**, not raw totals.
- Ranking is **multi-objective** (personal relevance + cultural value + diversity/novelty).
- The final list is **diversity-aware reranked** (caps + MMR, optional DPP).
- Every exposure can carry **explainable reason codes** (“Why this?”).

---

## Features (Contract v1.0)

### Core ranking
- Like decay (always pressable, diminishing weight)
- Public metrics based on **density / rate / breadth / persistence**
- Multi-objective scoring (**PRS / CVS / DNS**)
- Diversity-aware reranking (**cluster caps + MMR**, optional DPP)
- Deterministic results (same input → same output)
- Explainable exposure reason codes

### Culture primitives
- Curator Reputation (**CR**) utilities (outcome-oriented, not follower count)
- Culture Points (**CP**) issuance utilities (non-transferable, farming-resistant)
- Cultural View Value (**CVV**) weighting utilities (value of attention, separate axis)

### Evaluation (offline)
- Concentration metrics (Gini, long-tail share)
- Cluster coverage & novelty metrics
- Replay-style evaluation helpers (dataset snapshot in → report out)

> This package does **not** do fraud detection, moderation decisions, or model training.
> Those remain application responsibilities by design.

---

## Install

### Bun
```bash
bun add @bunkarium/algorithm
