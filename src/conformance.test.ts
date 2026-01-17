/**
 * Conformance Test Suite for Algorithm Contract v1.0
 *
 * These tests verify that the implementation conforms to the specification
 * by testing against golden test vectors in fixtures/contract-v1.0/
 *
 * According to section 18 of docs/SPECS/algorithm.md:
 * - Parse input RankRequest
 * - Call rank(request)
 * - Compare ranked[].itemKey order exactly
 * - Compare ranked[].finalScore within 1e-9 tolerance
 * - Compare paramSetId exactly
 */

import { describe, test, expect } from 'bun:test'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { rank } from './core/rerank'
import type { RankRequest, RankResponse, ReasonCode } from './types'
import crypto from 'crypto'

// Test vector format from spec
interface TestVector {
  testId: string
  description: string
  input: {
    request: RankRequest
  }
  expected: {
    ranked: Array<{
      itemKey: string
      finalScore: number
      reasonCodes: string[]
    }>
    paramSetId: string
    constraintsReport: {
      usedStrategy: 'MMR' | 'DPP' | 'NONE'
      capAppliedCount: number
      explorationSlotsFilled: number
      effectiveWeights?: {
        prs: number
        cvs: number
        dns: number
      }
    }
  }
  metadata?: Record<string, unknown>
}

/**
 * Load all test vectors from fixtures directory
 */
function loadTestVectors(): TestVector[] {
  const fixturesDir = join(__dirname, '../fixtures/contract-v1.0')
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json'))

  return files.map((file) => {
    const content = readFileSync(join(fixturesDir, file), 'utf-8')
    return JSON.parse(content) as TestVector
  })
}

/**
 * Calculate paramSetId from effective parameters
 * This should match the implementation's parameter hashing logic
 */
function calculateExpectedParamSetId(request: RankRequest): string {
  // Merge default params with request params to get effective params
  // Then hash them to create paramSetId
  // This is a placeholder - actual implementation should match the rank() function
  const effectiveParams = { ...request.params }
  const paramStr = JSON.stringify(effectiveParams, Object.keys(effectiveParams).sort())
  return crypto.createHash('sha256').update(paramStr).digest('hex')
}

describe('Algorithm Conformance Tests (Contract v1.0)', () => {
  const testVectors = loadTestVectors()

  test('should load test vectors', () => {
    expect(testVectors.length).toBeGreaterThanOrEqual(6)
  })

  for (const vector of testVectors) {
    describe(`Test: ${vector.testId}`, () => {
      test(vector.description, async () => {
        // Call the rank function with the test input
        const response: RankResponse = await rank(vector.input.request)

        // 1. Verify itemKey order exactly
        const actualKeys = response.ranked.map((item) => item.itemKey)
        const expectedKeys = vector.expected.ranked.map((item) => item.itemKey)

        expect(actualKeys).toEqual(expectedKeys)

        // 2. Verify finalScore within tolerance (1e-9)
        const tolerance = 1e-9
        for (let i = 0; i < vector.expected.ranked.length; i++) {
          const expected = vector.expected.ranked[i]
          const actual = response.ranked.find((r) => r.itemKey === expected.itemKey)

          expect(actual).toBeDefined()
          if (actual) {
            const scoreDiff = Math.abs(actual.finalScore - expected.finalScore)
            expect(scoreDiff).toBeLessThanOrEqual(tolerance)
          }
        }

        // 3. Verify paramSetId (if not "TBD" in test vector)
        if (vector.expected.paramSetId !== 'TBD') {
          expect(response.paramSetId).toBe(vector.expected.paramSetId)
        }

        // 4. Verify constraints report
        expect(response.constraintsReport.usedStrategy).toBe(
          vector.expected.constraintsReport.usedStrategy
        )
        expect(response.constraintsReport.capAppliedCount).toBe(
          vector.expected.constraintsReport.capAppliedCount
        )
        expect(response.constraintsReport.explorationSlotsFilled).toBe(
          vector.expected.constraintsReport.explorationSlotsFilled
        )

        // 5. Verify effective weights if specified
        if (vector.expected.constraintsReport.effectiveWeights) {
          const ew = vector.expected.constraintsReport.effectiveWeights
          const actual = response.constraintsReport.effectiveWeights

          expect(Math.abs(actual.prs - ew.prs)).toBeLessThanOrEqual(0.01)
          expect(Math.abs(actual.cvs - ew.cvs)).toBeLessThanOrEqual(0.01)
          expect(Math.abs(actual.dns - ew.dns)).toBeLessThanOrEqual(0.01)
        }

        // 6. Verify reason codes presence (not exact match, as they may vary)
        for (let i = 0; i < vector.expected.ranked.length; i++) {
          const expected = vector.expected.ranked[i]
          const actual = response.ranked.find((r) => r.itemKey === expected.itemKey)

          if (actual && expected.reasonCodes.length > 0) {
            // At minimum, expected reason codes should be present
            for (const code of expected.reasonCodes) {
              expect(actual.reasonCodes).toContain(code as ReasonCode)
            }
          }
        }
      })
    })
  }

  describe('Determinism tests', () => {
    test('should produce identical results with same seed', async () => {
      const vector = testVectors.find((v) => v.testId === '03-exploration-slots')
      if (!vector) {
        console.warn('Skipping determinism test: 03-exploration-slots not found')
        return
      }

      const response1 = await rank(vector.input.request)
      const response2 = await rank(vector.input.request)

      // Should produce identical results
      expect(response1.ranked).toEqual(response2.ranked)
      expect(response1.paramSetId).toBe(response2.paramSetId)
    })
  })

  describe('Parameter validation', () => {
    test('should handle missing optional parameters', async () => {
      const vector = testVectors.find((v) => v.testId === '01-basic-ranking')
      if (!vector) {
        console.warn('Skipping parameter validation test: 01-basic-ranking not found')
        return
      }

      // Create a copy without some optional params
      const request = {
        ...vector.input.request,
        params: undefined
      }

      // Should not throw, should use defaults
      const response = await rank(request)
      expect(response.ranked.length).toBeGreaterThan(0)
    })
  })

  describe('Edge cases', () => {
    test('should handle empty candidates', async () => {
      const request: RankRequest = {
        contractVersion: '1.0',
        requestId: 'test-empty',
        clusterVersion: 'v1-test',
        userState: {
          userKey: 'user-test',
          likeWindowCount: 5,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates: [],
        context: {
          surface: 'home_mix',
          nowTs: Date.now()
        }
      }

      const response = await rank(request)
      expect(response.ranked).toEqual([])
    })

    test('should filter hardBlock candidates', async () => {
      const request: RankRequest = {
        contractVersion: '1.0',
        requestId: 'test-hardblock',
        clusterVersion: 'v1-test',
        userState: {
          userKey: 'user-test',
          likeWindowCount: 5,
          recentClusterExposures: {},
          diversitySlider: 0.5,
          curatorReputation: 1.0,
          cpEarned90d: 0
        },
        candidates: [
          {
            itemKey: 'item-blocked',
            type: 'work',
            clusterId: 'cluster-a',
            createdAt: Date.now(),
            qualityFlags: {
              moderated: true,
              hardBlock: true
            },
            features: {
              prs: 0.9,
              cvsComponents: {
                like: 0.8,
                context: 0.7,
                collection: 0.6,
                bridge: 0.5,
                sustain: 0.4
              }
            }
          },
          {
            itemKey: 'item-ok',
            type: 'work',
            clusterId: 'cluster-a',
            createdAt: Date.now(),
            qualityFlags: {
              moderated: true,
              hardBlock: false
            },
            features: {
              prs: 0.5,
              cvsComponents: {
                like: 0.4,
                context: 0.3,
                collection: 0.2,
                bridge: 0.1,
                sustain: 0.1
              }
            }
          }
        ],
        context: {
          surface: 'home_mix',
          nowTs: Date.now()
        }
      }

      const response = await rank(request)
      expect(response.ranked.length).toBe(1)
      expect(response.ranked[0].itemKey).toBe('item-ok')
    })
  })
})
