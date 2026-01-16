import type {
  Candidate,
  RankedItem,
  AlgorithmParams,
  ConstraintsReport,
  ReasonCode
} from '../types'
import { DEFAULT_PARAMS } from '../types'
import { calculateMixedScore, calculatePenalty } from './scoring'
import { determineReasonCodes } from './explain'
import { DIVERSITY_DEFAULTS } from './defaults'

/**
 * 多様性制約付き再ランキング
 *
 * - 一次ランキングをそのまま表示しない（必ず再ランキング）
 * - 直近N件に対し、同一クラスタの露出上限K
 * - 探索枠（Exploration Budget）を必ず混ぜる
 */

interface RerankOptions {
  /** 直近N件 */
  diversityCapN: number
  /** 同一クラスタ上限K */
  diversityCapK: number
  /** 探索枠（0.0〜1.0） */
  explorationBudget: number
}

const DEFAULT_RERANK_OPTIONS: RerankOptions = {
  diversityCapN: DIVERSITY_DEFAULTS.diversityCapN,
  diversityCapK: DIVERSITY_DEFAULTS.diversityCapK,
  explorationBudget: DIVERSITY_DEFAULTS.explorationBudget
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

  const penaltyWithExisting = calculatePenalty(candidate, selectedItems)
  const basePenalty = candidate.score.breakdown.penalty
  const similarityPenalty = Math.max(0, penaltyWithExisting - basePenalty)

  if (similarityPenalty === 0) {
    return {
      adjustedScore: candidate.score.finalScore,
      adjustedBreakdown: candidate.score.breakdown
    }
  }

  return {
    adjustedScore: candidate.score.finalScore - similarityPenalty,
    adjustedBreakdown: {
      ...candidate.score.breakdown,
      penalty: basePenalty + similarityPenalty
    }
  }
}

/**
 * 一次ランキングを実行
 *
 * @param candidates - 候補一覧
 * @param recentClusterExposures - 直近クラスタ露出
 * @param nowTs - 現在時刻
 * @param weights - スコア重み
 * @returns スコア付き候補（降順ソート済み）
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
      [], // 一次ランキングでは既存アイテムなし
      nowTs,
      weights
    )
  }))

  // 降順ソート
  scored.sort((a, b) => b.score.finalScore - a.score.finalScore)

  return scored
}

/**
 * 多様性制約付き再ランキング
 *
 * @param scoredCandidates - スコア付き候補（一次ランキング済み）
 * @param recentClusterExposures - 直近クラスタ露出
 * @param options - 再ランキングオプション
 * @returns 再ランキング結果と制約レポート
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

  // 探索枠の数を計算
  const explorationSlotCount = Math.max(
    0,
    Math.min(diversityCapN, Math.floor(diversityCapN * explorationBudget))
  )
  const explorationInterval = explorationSlotCount > 0
    ? Math.max(1, Math.floor(diversityCapN / (explorationSlotCount + 1)))
    : 0

  // 探索候補を抽出（露出が少ないクラスタから）
  const explorationCandidates = remaining
    .filter(c => (clusterCounts[c.clusterId] || 0) === 0)
    .slice(0, explorationSlotCount)

  while (result.length < diversityCapN && remaining.length > 0) {
    // 探索枠を強制挿入（一定間隔で）
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

    // 通常の選択
    let selectedIdx = -1
    let bestScore = -Infinity
    let bestBreakdown: ReturnType<typeof calculateMixedScore>['breakdown'] | null = null

    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i]
      const currentClusterCount = clusterCounts[candidate.clusterId] || 0

      // クラスタ上限チェック
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
      // 全候補がクラスタ上限に達した場合、最高スコアを選択
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

    // 理由コード決定
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
 * 完全なランキングパイプライン
 *
 * @param candidates - 候補一覧
 * @param recentClusterExposures - 直近クラスタ露出
 * @param nowTs - 現在時刻
 * @param params - アルゴリズムパラメータ
 * @returns ランキング結果
 */
export function rank(
  candidates: Candidate[],
  recentClusterExposures: Record<string, number>,
  nowTs: number,
  params: Partial<AlgorithmParams> = {}
): { ranked: RankedItem[]; constraintsReport: ConstraintsReport } {
  const fullParams = {
    diversityCapN: params.diversityCapN ?? DEFAULT_PARAMS.diversityCapN,
    diversityCapK: params.diversityCapK ?? DEFAULT_PARAMS.diversityCapK,
    explorationBudget: params.explorationBudget ?? DEFAULT_PARAMS.explorationBudget,
    weights: params.weights ?? DEFAULT_PARAMS.weights
  }

  // 1. 一次ランキング
  const primaryRanked = primaryRank(
    candidates,
    recentClusterExposures,
    nowTs,
    fullParams.weights
  )

  // 2. 多様性制約付き再ランキング
  const { reranked, report } = diversityRerank(
    primaryRanked,
    recentClusterExposures,
    {
      diversityCapN: fullParams.diversityCapN,
      diversityCapK: fullParams.diversityCapK,
      explorationBudget: fullParams.explorationBudget
    }
  )

  // 3. 出力形式に変換
  const ranked: RankedItem[] = reranked.map(item => ({
    itemKey: item.itemKey,
    finalScore: item.score.finalScore,
    reasonCodes: item.reasonCodes,
    scoreBreakdown: item.score.breakdown
  }))

  return {
    ranked,
    constraintsReport: report
  }
}
