import type {
  Candidate,
  RankedItem,
  AlgorithmParams,
  ConstraintsReport,
  ReasonCode,
  RankRequest,
  RankResponse
} from '../types'
import { DEFAULT_PARAMS, DEFAULT_SURFACE_POLICIES } from '../types'
import { ALGORITHM_ID, ALGORITHM_VERSION, CONTRACT_VERSION } from '../constants'
import { calculateScore, SimpleScoreWeights, DEFAULT_SIMPLE_WEIGHTS } from './scoring'
import { determineReasonCodes } from './explain'
import { round9 } from './utils'

/**
 * Community-First Ranking Algorithm
 *
 * シンプルな設計思想:
 * 1. 候補をスコア順にソート（PRS × CVS）
 * 2. 多様性処理なし（多様性は結果であってアルゴリズムには含まない）
 * 3. 発言力はクラスタ内ゼロサム（別モジュールで処理）
 *
 * 削除したもの:
 * - DNS（多様性スコア）
 * - MMR（類似度ペナルティ）
 * - DPP（行列式点過程）
 * - 探索枠（exploration slots）
 * - クラスタキャップ（diversityCapK）
 */

// ============================================================
// 数値精度とハッシュユーティリティ
// ============================================================

/**
 * paramSetId計算（effective paramsのsha256）
 */
async function computeParamSetId(params: AlgorithmParams): Promise<string> {
  const canonical = JSON.stringify(params, Object.keys(params).sort())

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder()
    const data = encoder.encode(canonical)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }

  // フォールバック: 簡易ハッシュ
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    const chr = canonical.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(16, '0')
}

function computeParamSetIdSync(params: AlgorithmParams): string {
  const canonical = JSON.stringify(params, Object.keys(params).sort())
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash) + canonical.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(16, '0')
}

// ============================================================
// スコア付き候補
// ============================================================

type ScoredCandidate = Candidate & {
  score: ReturnType<typeof calculateScore>
}

// ============================================================
// Primary Ranking (シンプルなスコア順ソート)
// ============================================================

/**
 * Primary ranking: スコア計算とソート
 *
 * シンプルな処理:
 * 1. hardBlockを除外
 * 2. 各候補のスコアを計算（PRS + CVS）
 * 3. スコア順にソート
 */
export function primaryRank(
  candidates: Candidate[],
  weights: SimpleScoreWeights = DEFAULT_SIMPLE_WEIGHTS
): ScoredCandidate[] {
  // hardBlock を除外
  const filteredCandidates = candidates.filter(
    candidate => !candidate.qualityFlags.hardBlock
  )

  // スコア計算
  const scored = filteredCandidates.map(candidate => ({
    ...candidate,
    score: calculateScore(candidate, weights)
  }))

  // 決定性ソート
  // 1) finalScore desc, 2) createdAt desc, 3) itemKey asc
  scored.sort((a, b) => {
    const scoreDelta = b.score.finalScore - a.score.finalScore
    if (scoreDelta !== 0) return scoreDelta

    const createdDelta = b.createdAt - a.createdAt
    if (createdDelta !== 0) return createdDelta

    return a.itemKey.localeCompare(b.itemKey)
  })

  return scored
}

// ============================================================
// Simple Rerank (多様性処理なし)
// ============================================================

interface SimpleRerankOptions {
  limit: number
  explainThresholds: AlgorithmParams['explainThresholds']
}

interface SimpleRerankResult {
  reranked: Array<ScoredCandidate & { reasonCodes: ReasonCode[] }>
  report: ConstraintsReport
}

/**
 * Simple rerank: N件を切り出してreason codesを付与
 *
 * 多様性処理なし:
 * - MMRなし
 * - DPPなし
 * - 探索枠なし
 * - クラスタキャップなし
 *
 * 単純にスコア順でN件を返す
 */
export function simpleRerank(
  scoredCandidates: ScoredCandidate[],
  options: SimpleRerankOptions,
  effectiveWeights: SimpleScoreWeights
): SimpleRerankResult {
  const { limit, explainThresholds } = options
  const N = Math.min(limit, scoredCandidates.length)

  if (N === 0) {
    return {
      reranked: [],
      report: {
        usedStrategy: 'COMMUNITY',
        capAppliedCount: 0,
        explorationSlotsRequested: 0,
        explorationSlotsFilled: 0,
        effectiveDiversityCapK: 0,
        effectiveExplorationBudget: 0,
        effectiveWeights: { ...effectiveWeights, dns: 0 }
      }
    }
  }

  // 単純にN件を切り出し、reason codesを付与
  const result = scoredCandidates.slice(0, N).map(candidate => ({
    ...candidate,
    reasonCodes: determineReasonCodes(candidate, {}, explainThresholds)
  }))

  return {
    reranked: result,
    report: {
      usedStrategy: 'COMMUNITY',
      capAppliedCount: 0,
      explorationSlotsRequested: 0,
      explorationSlotsFilled: 0,
      effectiveDiversityCapK: 0,
      effectiveExplorationBudget: 0,
      effectiveWeights: { ...effectiveWeights, dns: 0 }
    }
  }
}

// ============================================================
// 後方互換性のためのエイリアス
// ============================================================

/**
 * @deprecated Use simpleRerank instead
 */
export function diversityRerank(
  scoredCandidates: ScoredCandidate[],
  options: any,
  effectiveWeights: any
): SimpleRerankResult {
  return simpleRerank(
    scoredCandidates,
    {
      limit: options.diversityCapN || 20,
      explainThresholds: options.explainThresholds || DEFAULT_PARAMS.explainThresholds
    },
    {
      prs: effectiveWeights.prs || DEFAULT_SIMPLE_WEIGHTS.prs,
      cvs: effectiveWeights.cvs || DEFAULT_SIMPLE_WEIGHTS.cvs
    }
  )
}

// ============================================================
// Full Ranking Pipeline
// ============================================================

interface RankingResult {
  ranked: RankedItem[]
  report: ConstraintsReport
  effectiveParams: AlgorithmParams
  fullParams: AlgorithmParams
}

/**
 * Prepare and execute ranking pipeline
 */
function prepareAndRank(request: RankRequest): RankingResult {
  const params = request.params ?? {}

  // パラメータマージ
  const publicMetrics = {
    ...DEFAULT_PARAMS.publicMetrics,
    ...(params.publicMetrics ?? {})
  }
  const surfacePolicies = {
    ...DEFAULT_SURFACE_POLICIES,
    ...(params.surfacePolicies ?? {})
  }
  const explainThresholds = {
    ...DEFAULT_PARAMS.explainThresholds,
    ...(params.explainThresholds ?? {})
  }

  const fullParams: AlgorithmParams = {
    ...DEFAULT_PARAMS,
    ...params,
    publicMetrics,
    surfacePolicies,
    explainThresholds
  }

  // シンプルな重み（PRS + CVS のみ）
  const effectiveWeights: SimpleScoreWeights = {
    prs: params.weights?.prs ?? DEFAULT_SIMPLE_WEIGHTS.prs,
    cvs: params.weights?.cvs ?? DEFAULT_SIMPLE_WEIGHTS.cvs
  }

  // surface policy によるフィルタリング
  const surfacePolicy = {
    ...DEFAULT_SURFACE_POLICIES[request.context.surface],
    ...(fullParams.surfacePolicies?.[request.context.surface] ?? {})
  }
  const filteredCandidates = surfacePolicy.requireModerated
    ? request.candidates.filter(candidate => candidate.qualityFlags.moderated)
    : request.candidates

  // Primary ranking (スコア計算とソート)
  const primaryRanked = primaryRank(filteredCandidates, effectiveWeights)

  // Simple rerank (N件切り出し、多様性処理なし)
  const limit = Math.min(fullParams.diversityCapN || 20, primaryRanked.length)
  const { reranked, report } = simpleRerank(
    primaryRanked,
    { limit, explainThresholds },
    effectiveWeights
  )

  // RankedItem に変換
  const ranked: RankedItem[] = reranked.map(item => ({
    itemKey: item.itemKey,
    type: item.type,
    clusterId: item.clusterId,
    finalScore: item.score.finalScore,
    reasonCodes: item.reasonCodes,
    scoreBreakdown: item.score.breakdown
  }))

  // 有効パラメータ
  const effectiveParams: AlgorithmParams = {
    ...fullParams,
    weights: { ...effectiveWeights, dns: 0 }
  }

  return { ranked, report, effectiveParams, fullParams }
}

/**
 * Full ranking pipeline (async)
 */
export async function rank(request: RankRequest): Promise<RankResponse> {
  const { ranked, report, effectiveParams, fullParams } = prepareAndRank(request)
  const paramSetId = await computeParamSetId(effectiveParams)

  return {
    requestId: request.requestId,
    algorithmId: ALGORITHM_ID,
    algorithmVersion: ALGORITHM_VERSION,
    contractVersion: CONTRACT_VERSION,
    paramSetId,
    variantId: fullParams.variantId,
    ranked,
    constraintsReport: report
  }
}

/**
 * Full ranking pipeline (sync)
 */
export function rankSync(request: RankRequest): RankResponse {
  const { ranked, report, effectiveParams, fullParams } = prepareAndRank(request)
  const paramSetId = computeParamSetIdSync(effectiveParams)

  return {
    requestId: request.requestId,
    algorithmId: ALGORITHM_ID,
    algorithmVersion: ALGORITHM_VERSION,
    contractVersion: CONTRACT_VERSION,
    paramSetId,
    variantId: fullParams.variantId,
    ranked,
    constraintsReport: report
  }
}
