import type {
  Candidate,
  RankedItem,
  AlgorithmParams,
  ConstraintsReport,
  ReasonCode,
  RankRequest,
  RankResponse,
  ScoreWeights
} from '../types'
import { DEFAULT_PARAMS, DEFAULT_SURFACE_POLICIES } from '../types'
import { ALGORITHM_ID, ALGORITHM_VERSION, CONTRACT_VERSION } from '../constants'
import { calculateMixedScore } from './scoring'
import { determineReasonCodes } from './explain'
import { cosineSimilarity } from './diversity'

// ============================================================
// 数値精度とハッシュユーティリティ
// ============================================================

/**
 * finalScoreを9桁精度に丸める（algorithm.md仕様）
 */
function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

/**
 * xorshift64 PRNG（algorithm.md仕様: 決定性乱数生成）
 */
class Xorshift64 {
  private state: bigint

  constructor(seed: bigint) {
    this.state = seed === 0n ? 1n : seed
  }

  next(): number {
    let x = this.state
    x ^= x << 13n
    x ^= x >> 7n
    x ^= x << 17n
    this.state = x & 0xffffffffffffffffn
    return Number(this.state & 0xffffffffn) / 0xffffffff
  }
}

/**
 * 文字列をシードに変換（FNV-1a ハッシュ）
 */
function hashToSeed(input: string): bigint {
  let hash = 14695981039346656037n
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * 1099511628211n) & 0xffffffffffffffffn
  }
  return hash
}

/**
 * 決定性乱数インデックス生成（algorithm.md仕様: uniqueRandomIndices）
 */
function uniqueRandomIndices(rng: Xorshift64, count: number, min: number, max: number): number[] {
  const range = max - min + 1
  if (count >= range) {
    return Array.from({ length: range }, (_, i) => min + i)
  }

  const selected = new Set<number>()
  while (selected.size < count) {
    const idx = min + Math.floor(rng.next() * range)
    selected.add(idx)
  }

  return Array.from(selected).sort((a, b) => a - b)
}

/**
 * paramSetId計算（algorithm.md仕様: effective paramsのsha256）
 * ブラウザ/Node互換のためシンプルなハッシュを使用
 */
async function computeParamSetId(params: AlgorithmParams): Promise<string> {
  const canonical = JSON.stringify(params, Object.keys(params).sort())

  // Web Crypto API を使用（Workers/Browser対応）
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

// ============================================================
// Diversity Slider 重み調整（algorithm.md仕様）
// ============================================================

interface AdjustedWeights {
  weights: ScoreWeights
  effectiveK: number
  effectiveExplorationBudget: number
}

/**
 * diversity slider による重み調整（algorithm.md仕様）
 *
 * t = clamp(0,1, diversitySlider)
 * deltaMax = 0.10
 * delta = (2*t - 1) * deltaMax
 *
 * w_prs' = w_prs - delta
 * w_dns' = w_dns + 0.7 * delta
 * w_cvs' = w_cvs + 0.3 * delta
 *
 * iterative clamp-renormalize (max 3 iterations)
 */
function adjustWeightsForDiversitySlider(
  baseWeights: ScoreWeights,
  diversitySlider: number,
  baseK: number,
  baseExploration: number
): AdjustedWeights {
  const t = Math.max(0, Math.min(1, diversitySlider))
  const deltaMax = 0.10
  const delta = (2 * t - 1) * deltaMax

  let wPrs = baseWeights.prs - delta
  let wDns = baseWeights.dns + 0.7 * delta
  let wCvs = baseWeights.cvs + 0.3 * delta

  // iterative clamp-renormalize (max 3 iterations)
  const minW = 0.05
  const maxW = 0.90
  for (let iter = 0; iter < 3; iter++) {
    wPrs = Math.max(minW, Math.min(maxW, wPrs))
    wCvs = Math.max(minW, Math.min(maxW, wCvs))
    wDns = Math.max(minW, Math.min(maxW, wDns))

    const sum = wPrs + wCvs + wDns
    if (sum === 0) {
      wPrs = wCvs = wDns = 1 / 3
      break
    }
    wPrs /= sum
    wCvs /= sum
    wDns /= sum
  }

  // effective diversity cap K
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const effectiveK = Math.max(1, Math.min(baseK + 3, Math.round(baseK * lerp(1.2, 0.6, t))))

  // effective exploration budget
  const effectiveExplorationBudget = Math.max(0.05, Math.min(0.30, baseExploration * lerp(0.7, 1.3, t)))

  return {
    weights: { prs: round9(wPrs), cvs: round9(wCvs), dns: round9(wDns) },
    effectiveK,
    effectiveExplorationBudget
  }
}

// ============================================================
// MMR Similarity（algorithm.md仕様）
// ============================================================

/**
 * MMR類似度計算（algorithm.md仕様）
 * cosineを[0,1]にマッピング: sim = clamp(0, 1, (rawCosine + 1) / 2)
 */
function calculateMMRSimilarity(candA: Candidate, candB: Candidate): number {
  if (candA.features.embedding && candB.features.embedding) {
    const rawCosine = cosineSimilarity(candA.features.embedding, candB.features.embedding)
    return Math.max(0, Math.min(1, (rawCosine + 1) / 2))
  }
  // フォールバック: 同一クラスタなら1、異なれば0
  return candA.clusterId === candB.clusterId ? 1 : 0
}

/**
 * 選択済みアイテムとの最大類似度を計算
 */
function maxSimilarityWithSelected(candidate: Candidate, selected: Candidate[]): number {
  if (selected.length === 0) return 0
  let maxSim = 0
  for (const item of selected) {
    maxSim = Math.max(maxSim, calculateMMRSimilarity(candidate, item))
  }
  return maxSim
}

// ============================================================
// Primary Ranking
// ============================================================

type ScoredCandidate = Candidate & {
  score: ReturnType<typeof calculateMixedScore>
}

/**
 * Primary ranking pass
 */
export function primaryRank(
  candidates: Candidate[],
  recentClusterExposures: Record<string, number>,
  nowTs: number,
  weights: ScoreWeights,
  clusterNoveltyFactor?: number,
  timeHalfLifeHours?: number
): ScoredCandidate[] {
  // hardBlock を除外
  const filteredCandidates = candidates.filter(
    candidate => !candidate.qualityFlags.hardBlock
  )

  const scored = filteredCandidates.map(candidate => ({
    ...candidate,
    score: calculateMixedScore(
      candidate,
      recentClusterExposures,
      nowTs,
      weights,
      clusterNoveltyFactor,
      timeHalfLifeHours
    )
  }))

  // 決定性ソート（algorithm.md仕様）
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
// Diversity-aware Reranking（algorithm.md仕様）
// ============================================================

interface RerankOptions {
  diversityCapN: number
  effectiveK: number
  effectiveExplorationBudget: number
  mmrSimilarityPenalty: number
  requestSeed: string
  recentClusterExposures: Record<string, number>
  explainThresholds: AlgorithmParams['explainThresholds']
  newClusterExposureMax: number
}

interface RerankResult {
  reranked: Array<ScoredCandidate & { reasonCodes: ReasonCode[] }>
  report: ConstraintsReport
  effectiveWeights: ScoreWeights
}

/**
 * Diversity-aware rerank（algorithm.md仕様）
 * - cluster cap (K_effective)
 * - exploration slots with deterministic positions
 * - MMR with similarity in [0,1]
 */
export function diversityRerank(
  scoredCandidates: ScoredCandidate[],
  options: RerankOptions,
  effectiveWeights: ScoreWeights
): RerankResult {
  const {
    diversityCapN,
    effectiveK,
    effectiveExplorationBudget,
    mmrSimilarityPenalty,
    requestSeed,
    recentClusterExposures,
    explainThresholds,
    newClusterExposureMax
  } = options

  const N = Math.min(diversityCapN, scoredCandidates.length)
  if (N === 0) {
    return {
      reranked: [],
      report: {
        usedStrategy: 'NONE',
        capAppliedCount: 0,
        explorationSlotsRequested: 0,
        explorationSlotsFilled: 0,
        effectiveDiversityCapK: effectiveK,
        effectiveExplorationBudget,
        effectiveWeights
      },
      effectiveWeights
    }
  }

  const result: Array<ScoredCandidate & { reasonCodes: ReasonCode[] }> = []
  const remaining = [...scoredCandidates]
  const clusterCounts: Record<string, number> = {}

  let capAppliedCount = 0

  // Exploration slots 計算（algorithm.md仕様）
  const explorationSlotsRequested = Math.floor(N * effectiveExplorationBudget)
  let explorationSlotsFilled = 0

  // 探索枠の位置を決定（position 0は予約、1..N-1から選択）
  const rng = new Xorshift64(hashToSeed(`${requestSeed}exploration`))
  const explorationPositions = explorationSlotsRequested > 0 && N > 1
    ? uniqueRandomIndices(rng, explorationSlotsRequested, 1, N - 1)
    : []
  const explorationPositionSet = new Set(explorationPositions)

  // 探索候補プール（NEW_IN_CLUSTER eligible）
  const getExplorationPool = () => remaining.filter(c =>
    (recentClusterExposures[c.clusterId] ?? 0) <= newClusterExposureMax
  )

  // 探索スコア関数: 0.7 * DNS + 0.3 * finalScore
  const exploreScore = (c: ScoredCandidate) =>
    0.7 * c.score.breakdown.dns + 0.3 * c.score.finalScore

  // メインループ
  while (result.length < N && remaining.length > 0) {
    const currentPosition = result.length

    // 探索枠チェック
    if (explorationPositionSet.has(currentPosition)) {
      let explorationPool = getExplorationPool()
      if (explorationPool.length === 0) {
        explorationPool = [...remaining] // フォールバック
      }

      // cluster cap を考慮して最高exploreScoreの候補を選択
      let bestExploreCandidate: ScoredCandidate | null = null
      let bestExploreScore = -Infinity

      for (const candidate of explorationPool) {
        const currentCount = clusterCounts[candidate.clusterId] || 0
        if (currentCount >= effectiveK) continue

        const score = exploreScore(candidate)
        if (score > bestExploreScore) {
          bestExploreScore = score
          bestExploreCandidate = candidate
        }
      }

      if (bestExploreCandidate) {
        const idx = remaining.findIndex(c => c.itemKey === bestExploreCandidate!.itemKey)
        if (idx !== -1) {
          remaining.splice(idx, 1)
          const reasonCodes = determineReasonCodes(
            bestExploreCandidate,
            recentClusterExposures,
            explainThresholds
          )
          reasonCodes.push('EXPLORATION', 'DIVERSITY_SLOT')

          result.push({
            ...bestExploreCandidate,
            reasonCodes: [...new Set(reasonCodes)] as ReasonCode[]
          })
          clusterCounts[bestExploreCandidate.clusterId] = (clusterCounts[bestExploreCandidate.clusterId] || 0) + 1
          explorationSlotsFilled++
          continue
        }
      }
      // 探索枠を埋められなかった場合は通常選択にフォールバック
    }

    // MMR選択（position 0 は最高スコア候補、それ以外はMMRスコア）
    let selectedCandidate: ScoredCandidate | null = null
    let selectedIdx = -1

    if (currentPosition === 0) {
      // 最初の候補は最高finalScoreを選択（cluster cap適用）
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]
        const currentCount = clusterCounts[candidate.clusterId] || 0
        if (currentCount >= effectiveK) {
          capAppliedCount++
          continue
        }
        selectedCandidate = candidate
        selectedIdx = i
        break
      }
    } else {
      // MMR: baseScore - lambda * maxSim
      let bestMMRScore = -Infinity

      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]
        const currentCount = clusterCounts[candidate.clusterId] || 0
        if (currentCount >= effectiveK) {
          capAppliedCount++
          continue
        }

        const maxSim = maxSimilarityWithSelected(candidate, result)
        const mmrScore = candidate.score.finalScore - mmrSimilarityPenalty * maxSim

        if (mmrScore > bestMMRScore) {
          bestMMRScore = mmrScore
          selectedCandidate = candidate
          selectedIdx = i
        }
      }
    }

    if (!selectedCandidate || selectedIdx === -1) {
      // cluster cap で全候補がブロックされた場合、capを無視して選択
      for (let i = 0; i < remaining.length; i++) {
        const candidate = remaining[i]
        const maxSim = maxSimilarityWithSelected(candidate, result)
        const mmrScore = candidate.score.finalScore - mmrSimilarityPenalty * maxSim

        if (!selectedCandidate || mmrScore > (selectedCandidate.score.finalScore - mmrSimilarityPenalty * maxSimilarityWithSelected(selectedCandidate, result))) {
          selectedCandidate = candidate
          selectedIdx = i
        }
      }
    }

    if (!selectedCandidate || selectedIdx === -1) {
      break
    }

    remaining.splice(selectedIdx, 1)
    const reasonCodes = determineReasonCodes(
      selectedCandidate,
      recentClusterExposures,
      explainThresholds
    )

    result.push({
      ...selectedCandidate,
      reasonCodes
    })
    clusterCounts[selectedCandidate.clusterId] = (clusterCounts[selectedCandidate.clusterId] || 0) + 1
  }

  return {
    reranked: result,
    report: {
      usedStrategy: 'MMR',
      capAppliedCount,
      explorationSlotsRequested,
      explorationSlotsFilled,
      effectiveDiversityCapK: effectiveK,
      effectiveExplorationBudget,
      effectiveWeights
    },
    effectiveWeights
  }
}

// ============================================================
// Full Ranking Pipeline
// ============================================================

/**
 * Full ranking pipeline（algorithm.md仕様）
 */
export async function rank(request: RankRequest): Promise<RankResponse> {
  const params = request.params ?? {}

  // パラメータマージ
  const baseWeights = {
    ...DEFAULT_PARAMS.weights,
    ...(params.weights ?? {})
  }
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
    weights: baseWeights,
    publicMetrics,
    surfacePolicies,
    explainThresholds
  }

  // diversity slider による重み調整
  const { weights: effectiveWeights, effectiveK, effectiveExplorationBudget } =
    adjustWeightsForDiversitySlider(
      baseWeights,
      request.userState.diversitySlider,
      fullParams.diversityCapK,
      fullParams.explorationBudget
    )

  // surface policy によるフィルタリング
  const surfacePolicy = {
    ...DEFAULT_SURFACE_POLICIES[request.context.surface],
    ...(fullParams.surfacePolicies?.[request.context.surface] ?? {})
  }
  const filteredCandidates = surfacePolicy.requireModerated
    ? request.candidates.filter(candidate => candidate.qualityFlags.moderated)
    : request.candidates

  // Primary ranking
  const primaryRanked = primaryRank(
    filteredCandidates,
    request.userState.recentClusterExposures,
    request.context.nowTs,
    effectiveWeights,
    fullParams.clusterNoveltyFactor,
    fullParams.timeHalfLifeHours
  )

  // Diversity-aware rerank
  const diversityCapN = Math.min(fullParams.diversityCapN, primaryRanked.length)
  const { reranked, report } = diversityRerank(
    primaryRanked,
    {
      diversityCapN,
      effectiveK,
      effectiveExplorationBudget,
      mmrSimilarityPenalty: fullParams.mmrSimilarityPenalty,
      requestSeed: request.requestSeed ?? request.requestId,
      recentClusterExposures: request.userState.recentClusterExposures,
      explainThresholds,
      newClusterExposureMax: explainThresholds.newClusterExposureMax
    },
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

  // paramSetId 計算
  const effectiveParams: AlgorithmParams = {
    ...fullParams,
    weights: effectiveWeights,
    diversityCapK: effectiveK,
    explorationBudget: effectiveExplorationBudget
  }
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
 * 同期版 rank（テスト用、paramSetIdは簡易ハッシュ）
 */
export function rankSync(request: RankRequest): RankResponse {
  const params = request.params ?? {}

  const baseWeights = {
    ...DEFAULT_PARAMS.weights,
    ...(params.weights ?? {})
  }
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
    weights: baseWeights,
    publicMetrics,
    surfacePolicies,
    explainThresholds
  }

  const { weights: effectiveWeights, effectiveK, effectiveExplorationBudget } =
    adjustWeightsForDiversitySlider(
      baseWeights,
      request.userState.diversitySlider,
      fullParams.diversityCapK,
      fullParams.explorationBudget
    )

  const surfacePolicy = {
    ...DEFAULT_SURFACE_POLICIES[request.context.surface],
    ...(fullParams.surfacePolicies?.[request.context.surface] ?? {})
  }
  const filteredCandidates = surfacePolicy.requireModerated
    ? request.candidates.filter(candidate => candidate.qualityFlags.moderated)
    : request.candidates

  const primaryRanked = primaryRank(
    filteredCandidates,
    request.userState.recentClusterExposures,
    request.context.nowTs,
    effectiveWeights,
    fullParams.clusterNoveltyFactor,
    fullParams.timeHalfLifeHours
  )

  const diversityCapN = Math.min(fullParams.diversityCapN, primaryRanked.length)
  const { reranked, report } = diversityRerank(
    primaryRanked,
    {
      diversityCapN,
      effectiveK,
      effectiveExplorationBudget,
      mmrSimilarityPenalty: fullParams.mmrSimilarityPenalty,
      requestSeed: request.requestSeed ?? request.requestId,
      recentClusterExposures: request.userState.recentClusterExposures,
      explainThresholds,
      newClusterExposureMax: explainThresholds.newClusterExposureMax
    },
    effectiveWeights
  )

  const ranked: RankedItem[] = reranked.map(item => ({
    itemKey: item.itemKey,
    type: item.type,
    clusterId: item.clusterId,
    finalScore: item.score.finalScore,
    reasonCodes: item.reasonCodes,
    scoreBreakdown: item.score.breakdown
  }))

  // 同期版は簡易ハッシュ
  const effectiveParams: AlgorithmParams = {
    ...fullParams,
    weights: effectiveWeights,
    diversityCapK: effectiveK,
    explorationBudget: effectiveExplorationBudget
  }
  const canonical = JSON.stringify(effectiveParams, Object.keys(effectiveParams).sort())
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash) + canonical.charCodeAt(i)
    hash |= 0
  }
  const paramSetId = Math.abs(hash).toString(16).padStart(16, '0')

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
