/**
 * Generate Test Vectors
 *
 * This script runs the actual algorithm implementation against test inputs
 * and generates the expected outputs for conformance test vectors.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { rank } from '../src/core/rerank'
import type { RankRequest, RankResponse } from '../src/types'

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

async function generateTestVector(inputFile: string): Promise<void> {
  const fixturesDir = join(__dirname, '../fixtures/contract-v1.0')
  const filepath = join(fixturesDir, inputFile)

  console.log(`Processing ${inputFile}...`)

  const content = readFileSync(filepath, 'utf-8')
  const vector: TestVector = JSON.parse(content)

  // Run the algorithm
  const response: RankResponse = await rank(vector.input.request)

  // Update expected values with actual results
  vector.expected.ranked = response.ranked.map((item) => ({
    itemKey: item.itemKey,
    finalScore: parseFloat(item.finalScore.toFixed(9)), // Round to 9 decimals
    reasonCodes: item.reasonCodes
  }))

  vector.expected.paramSetId = response.paramSetId

  vector.expected.constraintsReport = {
    usedStrategy: response.constraintsReport.usedStrategy,
    capAppliedCount: response.constraintsReport.capAppliedCount,
    explorationSlotsFilled: response.constraintsReport.explorationSlotsFilled
  }

  // Add effective weights if they exist
  if (response.constraintsReport.effectiveWeights) {
    vector.expected.constraintsReport.effectiveWeights = {
      prs: parseFloat(response.constraintsReport.effectiveWeights.prs.toFixed(2)),
      cvs: parseFloat(response.constraintsReport.effectiveWeights.cvs.toFixed(2)),
      dns: parseFloat(response.constraintsReport.effectiveWeights.dns.toFixed(2))
    }
  }

  // Write updated vector back to file
  writeFileSync(filepath, JSON.stringify(vector, null, 2) + '\n', 'utf-8')

  console.log(`✓ Updated ${inputFile}`)
  console.log(`  - Ranked ${response.ranked.length} items`)
  console.log(`  - Strategy: ${response.constraintsReport.usedStrategy}`)
  console.log(`  - Cap applied: ${response.constraintsReport.capAppliedCount} times`)
  console.log(`  - Exploration slots filled: ${response.constraintsReport.explorationSlotsFilled}`)
  console.log()
}

async function main() {
  const fixturesDir = join(__dirname, '../fixtures/contract-v1.0')
  const files = readdirSync(fixturesDir).filter((f) => f.endsWith('.json')).sort()

  console.log('Generating test vectors...\n')

  for (const file of files) {
    await generateTestVector(file)
  }

  console.log('✓ All test vectors generated successfully!')
}

main().catch((err) => {
  console.error('Error generating test vectors:', err)
  process.exit(1)
})
