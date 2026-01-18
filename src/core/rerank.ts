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
import { cosineSimilarity, dppSampleGreedy, type DiversityItem } from './diversity'
import { DIVERSITY_DEFAULTS, SCORING_DEFAULTS, HASH_CONSTANTS } from './defaults'
import { round9 } from './utils'

// ============================================================
// 数値精度とハッシュユーティリティ
// ============================================================

/**
 * xorshift64 PRNG（algorithm.md仕様: 決定性乱数生成）
 */
class Xorshift64 {
  private state: bigint

  constructor(seed: bigint) {
    this.state = seed === 0n ? 1n : seed
  }

  next(): number {
    // Guard: ensure state is never 0 (would produce all zeros)
    let x = this.state || 1n
    x ^= x << 13n
    x ^= x >> 7n
    x ^= x << 17n
    this.state = x & 0xffffffffffffffffn
    // Guard: ensure state doesn't become 0 after operations
    if (this.state === 0n) this.state = 1n
    // Use 2^32 for proper [0, 1) range
    const result = Number(this.state & 0xffffffffn) / HASH_CONSTANTS.prngDivisor
    return Math.max(0, Math.min(1, result))
  }
}

/**
 * 文字列をシードに変換（FNV-1a ハッシュ）
 */
function hashToSeed(input: string): bigint {
  let hash: bigint = HASH_CONSTANTS.fnv1aOffsetBasis
  for (let i = 0; i < input.length; i++) {
    hash ^= BigInt(input.charCodeAt(i))
    hash = (hash * HASH_CONSTANTS.fnv1aPrime) & HASH_CONSTANTS.fnv1aBitMask
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
  const deltaMax = DIVERSITY_DEFAULTS.sliderDeltaMax
  const delta = (2 * t - 1) * deltaMax

  let wPrs = baseWeights.prs - delta
  let wDns = baseWeights.dns + DIVERSITY_DEFAULTS.sliderDNSWeightRatio * delta
  let wCvs = baseWeights.cvs + DIVERSITY_DEFAULTS.sliderCVSWeightRatio * delta

  // iterative clamp-renormalize (max iterations from config)
  const minW = DIVERSITY_DEFAULTS.sliderMinWeight
  const maxW = DIVERSITY_DEFAULTS.sliderMaxWeight
  for (let iter = 0; iter < DIVERSITY_DEFAULTS.sliderMaxIterations; iter++) {
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

  // effective diversity cap K (using configurable multipliers)
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const effectiveKMultiplier = lerp(
    DIVERSITY_DEFAULTS.sliderEffectiveKMaxMultiplier,
    DIVERSITY_DEFAULTS.sliderEffectiveKMinMultiplier,
    t
  )
  const effectiveK = Math.max(1, Math.min(baseK + 3, Math.round(baseK * effectiveKMultiplier)))

  // effective exploration budget (using configurable multipliers)
  const explorationMultiplier = lerp(
    DIVERSITY_DEFAULTS.sliderExplorationMinMultiplier,
    DIVERSITY_DEFAULTS.sliderExplorationMaxMultiplier,
    t
  )
  const effectiveExplorationBudget = Math.max(
    DIVERSITY_DEFAULTS.explorationBudgetMin,
    Math.min(DIVERSITY_DEFAULTS.explorationBudgetMax, baseExploration * explorationMultiplier)
  )

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
 * MMR類似度キャッシュ（パフォーマンス最適化）
 * キー: "itemKeyA|itemKeyB" (alphabetical order)
 */
class SimilarityCache {
  private cache: Map<string, number> = new Map()

  private makeKey(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`
  }

  get(candA: Candidate, candB: Candidate): number | undefined {
    const key = this.makeKey(candA.itemKey, candB.itemKey)
    return this.cache.get(key)
  }

  set(candA: Candidate, candB: Candidate, similarity: number): void {
    const key = this.makeKey(candA.itemKey, candB.itemKey)
    this.cache.set(key, similarity)
  }

  computeIfAbsent(candA: Candidate, candB: Candidate, compute: () => number): number {
    const key = this.makeKey(candA.itemKey, candB.itemKey)
    const cached = this.cache.get(key)
    if (cached !== undefined) return cached
    const value = compute()
    this.cache.set(key, value)
    return value
  }
}

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
 * 選択済みアイテムとの最大類似度を計算（キャッシュ付き）
 */
function maxSimilarityWithSelected(
  candidate: Candidate,
  selected: Candidate[],
  cache?: SimilarityCache
): number {
  if (selected.length === 0) return 0
  let maxSim = 0
  for (const item of selected) {
    const sim = cache
      ? cache.computeIfAbsent(candidate, item, () => calculateMMRSimilarity(candidate, item))
      : calculateMMRSimilarity(candidate, item)
    maxSim = Math.max(maxSim, sim)
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
  /** Reranking strategy: MMR (default) or DPP */
  rerankStrategy?: 'MMR' | 'DPP'
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
    newClusterExposureMax,
    rerankStrategy = 'MMR'
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

  // DPP strategy
  if (rerankStrategy === 'DPP' && N <= 100) {
    return diversityRerankDPP(scoredCandidates, options, effectiveWeights)
  }

  // Create similarity cache for performance
  const similarityCache = new SimilarityCache()

  const result: Array<ScoredCandidate & { reasonCodes: ReasonCode[] }> = []
  // Optimization: Use Set for O(1) removal tracking instead of O(n) splice()
  // This reduces overall complexity from O(n²) to O(n)
  const removedKeys = new Set<string>()
  let remainingCount = scoredCandidates.length
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

  // 探索スコア関数: explorationDNSWeight * DNS + explorationFinalScoreWeight * finalScore
  const exploreScore = (c: ScoredCandidate) =>
    SCORING_DEFAULTS.explorationDNSWeight * c.score.breakdown.dns +
    SCORING_DEFAULTS.explorationFinalScoreWeight * c.score.finalScore

  // 探索候補プール（NEW_IN_CLUSTER eligible）- キャッシュして再利用
  // Pre-compute exploration-eligible candidates (filter is O(n) but only done once)
  const explorationEligible = scoredCandidates.filter(c =>
    (recentClusterExposures[c.clusterId] ?? 0) <= newClusterExposureMax
  )
  // Helper to get non-removed exploration candidates
  const getExplorationPool = () => explorationEligible.filter(c => !removedKeys.has(c.itemKey))

  // メインループ
  while (result.length < N && remainingCount > 0) {
    const currentPosition = result.length

    // 探索枠チェック
    if (explorationPositionSet.has(currentPosition)) {
      let explorationPool = getExplorationPool()
      if (explorationPool.length === 0) {
        // フォールバック: all non-removed candidates
        explorationPool = scoredCandidates.filter(c => !removedKeys.has(c.itemKey))
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
        // O(1) removal via Set instead of O(n) findIndex + splice
        removedKeys.add(bestExploreCandidate.itemKey)
        remainingCount--
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
      // 探索枠を埋められなかった場合は通常選択にフォールバック
    }

    // MMR選択（position 0 は最高スコア候補、それ以外はMMRスコア）
    let selectedCandidate: ScoredCandidate | null = null

    if (currentPosition === 0) {
      // 最初の候補は最高finalScoreを選択（cluster cap適用）
      for (const candidate of scoredCandidates) {
        if (removedKeys.has(candidate.itemKey)) continue
        const currentCount = clusterCounts[candidate.clusterId] || 0
        if (currentCount >= effectiveK) {
          capAppliedCount++
          continue
        }
        selectedCandidate = candidate
        break
      }
    } else {
      // MMR: baseScore - lambda * maxSim (with cache)
      let bestMMRScore = -Infinity

      for (const candidate of scoredCandidates) {
        if (removedKeys.has(candidate.itemKey)) continue
        const currentCount = clusterCounts[candidate.clusterId] || 0
        if (currentCount >= effectiveK) {
          capAppliedCount++
          continue
        }

        const maxSim = maxSimilarityWithSelected(candidate, result, similarityCache)
        const mmrScore = candidate.score.finalScore - mmrSimilarityPenalty * maxSim

        if (mmrScore > bestMMRScore) {
          bestMMRScore = mmrScore
          selectedCandidate = candidate
        }
      }
    }

    if (!selectedCandidate) {
      // cluster cap で全候補がブロックされた場合、capを無視して選択
      let bestFallbackScore = -Infinity
      for (const candidate of scoredCandidates) {
        if (removedKeys.has(candidate.itemKey)) continue
        const maxSim = maxSimilarityWithSelected(candidate, result, similarityCache)
        const mmrScore = candidate.score.finalScore - mmrSimilarityPenalty * maxSim

        if (mmrScore > bestFallbackScore) {
          bestFallbackScore = mmrScore
          selectedCandidate = candidate
        }
      }
    }

    // Guard: ensure we have a valid candidate before proceeding
    if (!selectedCandidate) {
      break
    }

    // O(1) removal via Set instead of O(n) splice
    removedKeys.add(selectedCandidate.itemKey)
    remainingCount--
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

/**
 * DPP-based diversity reranking（algorithm.md仕様: DPP戦略）
 *
 * DPP (Determinantal Point Process) を使用した多様性リランキング。
 * 小規模な候補セット（N <= 100）に適している。
 */
function diversityRerankDPP(
  scoredCandidates: ScoredCandidate[],
  options: RerankOptions,
  effectiveWeights: ScoreWeights
): RerankResult {
  const {
    diversityCapN,
    effectiveK,
    effectiveExplorationBudget,
    recentClusterExposures,
    explainThresholds
  } = options

  const N = Math.min(diversityCapN, scoredCandidates.length)

  // DiversityItem形式に変換
  const diversityItems: DiversityItem[] = scoredCandidates.slice(0, Math.min(100, scoredCandidates.length)).map(c => ({
    itemKey: c.itemKey,
    score: c.score.finalScore,
    clusterId: c.clusterId,
    embedding: c.features.embedding
  }))

  // DPPサンプリング実行
  const { selected } = dppSampleGreedy(diversityItems, N)
  const selectedIds = new Set(selected.map(item => item.itemKey))

  // 選択された候補を順序付けて返す
  const result: Array<ScoredCandidate & { reasonCodes: ReasonCode[] }> = []
  const clusterCounts: Record<string, number> = {}
  let capAppliedCount = 0

  for (const item of selected) {
    const candidate = scoredCandidates.find(c => c.itemKey === item.itemKey)
    if (!candidate) continue

    // cluster cap チェック
    const currentCount = clusterCounts[candidate.clusterId] || 0
    if (currentCount >= effectiveK) {
      capAppliedCount++
      // DPPでは選択済みなので追加するが、capを記録
    }

    const reasonCodes = determineReasonCodes(
      candidate,
      recentClusterExposures,
      explainThresholds
    )

    result.push({
      ...candidate,
      reasonCodes
    })
    clusterCounts[candidate.clusterId] = currentCount + 1
  }

  return {
    reranked: result,
    report: {
      usedStrategy: 'DPP',
      capAppliedCount,
      explorationSlotsRequested: 0,
      explorationSlotsFilled: 0,
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
 * Shared ranking result (used by both rank and rankSync)
 */
interface RankingResult {
  ranked: RankedItem[]
  report: ConstraintsReport
  effectiveParams: AlgorithmParams
  fullParams: AlgorithmParams
}

/**
 * Prepare and execute ranking pipeline (shared logic for rank/rankSync)
 */
function prepareAndRank(request: RankRequest): RankingResult {
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
      newClusterExposureMax: explainThresholds.newClusterExposureMax,
      rerankStrategy: fullParams.rerankStrategy
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

  // 有効パラメータ（paramSetId計算用）
  const effectiveParams: AlgorithmParams = {
    ...fullParams,
    weights: effectiveWeights,
    diversityCapK: effectiveK,
    explorationBudget: effectiveExplorationBudget
  }

  return { ranked, report, effectiveParams, fullParams }
}

/**
 * Compute sync paramSetId using simple DJB2 hash
 */
function computeParamSetIdSync(params: AlgorithmParams): string {
  const canonical = JSON.stringify(params, Object.keys(params).sort())
  let hash = 0
  for (let i = 0; i < canonical.length; i++) {
    hash = ((hash << 5) - hash) + canonical.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(16, '0')
}

/**
 * Full ranking pipeline（algorithm.md仕様）
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
 * 同期版 rank（テスト用、paramSetIdは簡易ハッシュ）
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
