import type {
  Candidate,
  RankedItem,
  AlgorithmParams,
  ConstraintsReport,
  ReasonCode,
  RankRequest,
  RankResponse
} from '../types'
import { DEFAULT_PARAMS } from '../types'
import { ALGORITHM_ID, ALGORITHM_VERSION } from '../constants'
import { calculateMixedScore } from './scoring'
import { determineReasonCodes } from './explain'
import { DIVERSITY_DEFAULTS } from './defaults'
import { cosineSimilarity } from './diversity'

interface RerankOptions {
  /** Window size for rerank. */
  diversityCapN: number
  /** Max items per cluster. */
  diversityCapK: number
  /** Exploration budget (0.0-1.0). */
  explorationBudget: number
}

const DEFAULT_RERANK_OPTIONS: RerankOptions = {
  diversityCapN: DIVERSITY_DEFAULTS.diversityCapN,
  diversityCapK: DIVERSITY_DEFAULTS.diversityCapK,
  explorationBudget: DIVERSITY_DEFAULTS.explorationBudget
}

const SIMILARITY_PENALTY_WEIGHT = 0.3

function calculateSimilarityPenalty(candidate: Candidate, selectedItems: Candidate[]): number {
  if (!candidate.features.embedding || selectedItems.length === 0) return 0

  let maxSimilarity = 0
  for (const item of selectedItems) {
    if (!item.features.embedding) continue
    const sim = cosineSimilarity(candidate.features.embedding, item.features.embedding)
    maxSimilarity = Math.max(maxSimilarity, sim)
  }

  return maxSimilarity * SIMILARITY_PENALTY_WEIGHT
}

function applySimilarityPenalty(
  candidate: Candidate & { score: ReturnType<typeof calculateMixedScore> },
  selectedItems: Candidate[]
): { adjustedScore: number; adjustedBreakdown: typeof candidate.score.breakdown } {
  if (selectedItems.length === 0) {
    return {
      adjustedScore: candidate.score.finalScore,
      adjustedBreakdown: candidate.score.breakdown
    }
  }

  const similarityPenalty = calculateSimilarityPenalty(candidate, selectedItems)
  if (similarityPenalty <= 0) {
    return {
      adjustedScore: candidate.score.finalScore,
      adjustedBreakdown: candidate.score.breakdown
    }
  }

  return {
    adjustedScore: candidate.score.finalScore - similarityPenalty,
    adjustedBreakdown: {
      ...candidate.score.breakdown,
      penalty: candidate.score.breakdown.penalty + similarityPenalty
    }
  }
}

/**
 * Primary ranking pass.
 */
export function primaryRank(
  candidates: Candidate[],
  recentClusterExposures: Record<string, number>,
  nowTs: number,
  weights: { prs: number; cvs: number; dns: number }
): Array<Candidate & { score: ReturnType<typeof calculateMixedScore> }> {
  const scored = candidates.map(candidate => ({
    ...candidate,
    score: calculateMixedScore(
      candidate,
      recentClusterExposures,
      nowTs,
      weights
    )
  }))

  scored.sort((a, b) => {
    const scoreDelta = b.score.finalScore - a.score.finalScore
    if (scoreDelta !== 0) return scoreDelta

    const createdDelta = b.createdAt - a.createdAt
    if (createdDelta !== 0) return createdDelta

    return a.itemKey.localeCompare(b.itemKey)
  })

  return scored
}

/**
 * Diversity-aware rerank.
 */
export function diversityRerank(
  scoredCandidates: Array<Candidate & { score: ReturnType<typeof calculateMixedScore> }>,
  recentClusterExposures: Record<string, number>,
  options: RerankOptions = DEFAULT_RERANK_OPTIONS
): { reranked: Array<Candidate & { score: ReturnType<typeof calculateMixedScore>; reasonCodes: ReasonCode[] }>; report: ConstraintsReport } {
  const { diversityCapN, diversityCapK, explorationBudget } = options

  const result: Array<Candidate & { score: ReturnType<typeof calculateMixedScore>; reasonCodes: ReasonCode[] }> = []
  const remaining = [...scoredCandidates]
  const clusterCounts: Record<string, number> = { ...recentClusterExposures }

  let clusterCapsApplied = 0
  let explorationSlotsUsed = 0

  const explorationSlotCount = Math.max(
    0,
    Math.min(diversityCapN, Math.floor(diversityCapN * explorationBudget))
  )
  const explorationInterval = explorationSlotCount > 0
    ? Math.max(1, Math.floor(diversityCapN / (explorationSlotCount + 1)))
    : 0

  const explorationCandidates = remaining
    .filter(c => (clusterCounts[c.clusterId] || 0) === 0)
    .slice(0, explorationSlotCount)

  while (result.length < diversityCapN && remaining.length > 0) {
    const shouldInsertExploration =
      explorationSlotsUsed < explorationSlotCount &&
      explorationInterval > 0 &&
      result.length > 0 &&
      result.length % explorationInterval === 0

    if (shouldInsertExploration && explorationCandidates.length > explorationSlotsUsed) {
      const explorationItem = explorationCandidates[explorationSlotsUsed]
      const idx = remaining.findIndex(c => c.itemKey === explorationItem.itemKey)
      if (idx !== -1) {
        remaining.splice(idx, 1)
        const { adjustedScore, adjustedBreakdown } = applySimilarityPenalty(
          explorationItem,
          result
        )
        result.push({
          ...explorationItem,
          score: { finalScore: adjustedScore, breakdown: adjustedBreakdown },
          reasonCodes: ['EXPLORATION', 'DIVERSITY_SLOT']
        })
        clusterCounts[explorationItem.clusterId] = (clusterCounts[explorationItem.clusterId] || 0) + 1
        explorationSlotsUsed++
        continue
      }
    }

    let selectedIdx = -1
    let bestScore = -Infinity
    let bestBreakdown: ReturnType<typeof calculateMixedScore>['breakdown'] | null = null

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const currentClusterCount = clusterCounts[candidate.clusterId] || 0

      if (currentClusterCount >= diversityCapK) {
        clusterCapsApplied++
        continue
      }

      const { adjustedScore, adjustedBreakdown } = applySimilarityPenalty(candidate, result)
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore
        bestBreakdown = adjustedBreakdown
        selectedIdx = i
      }
    }

    if (selectedIdx === -1) {
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]
        const { adjustedScore, adjustedBreakdown } = applySimilarityPenalty(candidate, result)
        if (adjustedScore > bestScore) {
          bestScore = adjustedScore
          bestBreakdown = adjustedBreakdown
          selectedIdx = i
        }
      }
    }

    if (selectedIdx === -1) {
      break
    }

    const selected = remaining[selectedIdx]
    remaining.splice(selectedIdx, 1)

    const reasonCodes = determineReasonCodes(selected, clusterCounts)

    const adjustedBreakdown = bestBreakdown ?? selected.score.breakdown
    const adjustedScore = Number.isFinite(bestScore)
      ? bestScore
      : selected.score.finalScore
    result.push({
      ...selected,
      score: { finalScore: adjustedScore, breakdown: adjustedBreakdown },
      reasonCodes
    })

    clusterCounts[selected.clusterId] = (clusterCounts[selected.clusterId] || 0) + 1
  }

  return {
    reranked: result,
    report: {
      clusterCapsApplied,
      explorationSlotsUsed
    }
  }
}

/**
 * Full ranking pipeline.
 */
export function rank(request: RankRequest): RankResponse {
  const params = request.params ?? {}
  const weights = {
    ...DEFAULT_PARAMS.weights,
    ...(params.weights ?? {})
  }

  const fullParams: AlgorithmParams = {
    ...DEFAULT_PARAMS,
    ...params,
    weights
  }

  const maxCandidates = Math.max(1, fullParams.rerankMaxCandidates)
  const diversityCapN = Math.max(1, Math.min(fullParams.diversityCapN, maxCandidates))

  const primaryRanked = primaryRank(
    request.candidates,
    request.userState.recentClusterExposures,
    request.context.nowTs,
    fullParams.weights
  )

  const rerankInput = primaryRanked.slice(0, maxCandidates)
  const { reranked, report } = diversityRerank(
    rerankInput,
    request.userState.recentClusterExposures,
    {
      diversityCapN,
      diversityCapK: fullParams.diversityCapK,
      explorationBudget: fullParams.explorationBudget
    }
  )

  const ranked: RankedItem[] = reranked.map(item => ({
    itemKey: item.itemKey,
    finalScore: item.score.finalScore,
    reasonCodes: item.reasonCodes,
    scoreBreakdown: item.score.breakdown
  }))

  return {
    requestId: request.requestId,
    algorithmId: ALGORITHM_ID,
    algorithmVersion: ALGORITHM_VERSION,
    ranked,
    constraintsReport: report
  }
}
