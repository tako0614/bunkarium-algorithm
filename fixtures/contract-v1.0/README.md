# Algorithm Contract v1.0 - Conformance Test Vectors

This directory contains golden test fixtures for verifying conformance to the Bunkarium Algorithm Specification (Contract v1.0).

## Purpose

These test vectors ensure that:
1. Third-party implementations can verify conformance to the specification
2. Changes to the algorithm implementation don't break the contract
3. The algorithm behaves deterministically and reproducibly

## Test Vector Format

Each JSON file contains:

```json
{
  "testId": "string",
  "description": "string",
  "input": {
    "request": {
      // RankRequest object
    }
  },
  "expected": {
    "ranked": [
      {
        "itemKey": "string",
        "finalScore": 0.123456789,  // rounded to 9 decimals
        "reasonCodes": ["REASON_CODE"]
      }
    ],
    "paramSetId": "sha256-hex-string",
    "constraintsReport": {
      "usedStrategy": "MMR" | "DPP" | "NONE",
      "capAppliedCount": 0,
      "explorationSlotsFilled": 0
    }
  }
}
```

## Minimum Test Vectors (as per specification)

### 01-basic-ranking.json
- **Purpose**: Basic ranking with 5 candidates, no exploration
- **Verifies**: Order and scores are correct
- **Key aspects**: Basic PRS/CVS/DNS mixing, no diversity constraints

### 02-cluster-cap.json
- **Purpose**: 10 candidates in 2 clusters with K=3 cap
- **Verifies**: Cluster cap enforcement
- **Key aspects**: MMR reranking, diversity constraints applied

### 03-exploration-slots.json
- **Purpose**: Deterministic exploration slot positions
- **Verifies**: Exploration slots use deterministic seed
- **Key aspects**: NEW_IN_CLUSTER detection, exploration scoring

### 04-diversity-slider-min.json
- **Purpose**: diversitySlider=0 (prefer personal relevance)
- **Verifies**: Weight adjustment toward PRS
- **Key aspects**: Effective weights should favor PRS

### 05-diversity-slider-max.json
- **Purpose**: diversitySlider=1 (prefer diversity)
- **Verifies**: Weight adjustment toward DNS/CVS
- **Key aspects**: Effective weights should favor DNS and CVS

### 06-rapid-penalty.json
- **Purpose**: Rapid penalty application
- **Verifies**: recentLikeCount30s >= 50 triggers penalty
- **Key aspects**: Like weight calculation with rapid penalty

## Conformance Requirements

As per section 18 of docs/SPECS/algorithm.md, conformant implementations MUST:

1. Parse input `RankRequest`
2. Call `rank(request)`
3. Compare `ranked[].itemKey` order **exactly**
4. Compare `ranked[].finalScore` within **1e-9 tolerance**
5. Compare `paramSetId` **exactly**

## Running Tests

```bash
# Run conformance tests
bun test conformance.test.ts

# Regenerate test vectors (if algorithm implementation changes)
bun run scripts/generate-test-vectors.ts
```

## Regenerating Test Vectors

If the algorithm implementation changes in a way that's intentional and correct, you can regenerate the expected values:

```bash
cd packages/algorithm
bun run scripts/generate-test-vectors.ts
```

This will:
1. Load each test vector input
2. Run the actual algorithm implementation
3. Update the expected outputs with the actual results
4. Preserve paramSetId hashes for verification

## Adding New Test Vectors

To add a new test vector:

1. Create a new JSON file in this directory (e.g., `07-new-test.json`)
2. Define the `input.request` with test data
3. Set `expected` values to placeholder values
4. Run `bun run scripts/generate-test-vectors.ts` to generate expected values
5. Verify the results make sense
6. Commit the new test vector

## Contract Version

These test vectors are for **Contract v1.0** of the Bunkarium algorithm specification.

If the contract version changes (breaking changes), create a new directory: `fixtures/contract-v2.0/`
