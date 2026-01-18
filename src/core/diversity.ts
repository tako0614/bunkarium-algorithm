/**
 * 高度な多様性アルゴリズム
 *
 * - MMR (Maximal Marginal Relevance): 関連性と多様性のバランス
 * - DPP (Determinantal Point Process): 確率的な多様性サンプリング
 * - Sliding Window Diversity: スライディングウィンドウでの多様性制約
 */

import { DIVERSITY_DEFAULTS, NUMERICAL_DEFAULTS } from './defaults'
import {
  determinant as stableDeterminant,
  cosineSimilarity,
  euclideanDistance,
  euclideanToSimilarity
} from './utils'

// Re-export for backward compatibility (previously defined locally)
export { cosineSimilarity }

// ============================================
// 共通型定義
// ============================================

/** 類似度計算用のアイテム */
export interface DiversityItem {
  itemKey: string
  score: number
  embedding?: number[]
  clusterId: string
  features?: Record<string, number>
}

/** MMR設定 */
export interface MMRConfig {
  /** 関連性 vs 多様性のバランス (0.0-1.0, 高いほど関連性重視) */
  lambda: number
  /** 類似度計算方式 */
  similarityMethod: 'cosine' | 'euclidean' | 'jaccard' | 'cluster'
}

export const DEFAULT_MMR_CONFIG: MMRConfig = {
  lambda: DIVERSITY_DEFAULTS.mmrLambda,
  similarityMethod: 'cosine'
}

/** DPP設定 */
export interface DPPConfig {
  /** 品質の重み */
  qualityWeight: number
  /** 多様性の重み */
  diversityWeight: number
  /** サンプリング温度 (高いほどランダム) */
  temperature: number
  /** 正則化項（数値安定性向上） */
  regularization: number
}

export const DEFAULT_DPP_CONFIG: DPPConfig = {
  qualityWeight: DIVERSITY_DEFAULTS.dppQualityWeight,
  diversityWeight: DIVERSITY_DEFAULTS.dppDiversityWeight,
  temperature: DIVERSITY_DEFAULTS.dppTemperature,
  regularization: NUMERICAL_DEFAULTS.matrixRegularization
}

// ============================================
// 類似度計算
// ============================================

// cosineSimilarity, euclideanDistance, euclideanToSimilarity are imported from utils.ts
// and re-exported above for backward compatibility

/**
 * ユークリッド距離を類似度に変換
 * Wrapper for backward compatibility with different signature
 */
export function euclideanSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  const distance = euclideanDistance(a, b)
  return euclideanToSimilarity(distance)
}

/**
 * Jaccard類似度を計算 (特徴量セット用)
 */
export function jaccardSimilarity(
  a: Record<string, number>,
  b: Record<string, number>,
  threshold: number = 0.5
): number {
  const setA = new Set(Object.entries(a).filter(([, v]) => v >= threshold).map(([k]) => k))
  const setB = new Set(Object.entries(b).filter(([, v]) => v >= threshold).map(([k]) => k))

  const intersection = new Set([...setA].filter(x => setB.has(x)))
  const union = new Set([...setA, ...setB])

  if (union.size === 0) return 0
  return intersection.size / union.size
}

/**
 * クラスタベースの類似度 (同一クラスタ = 1, 異なる = 0)
 */
export function clusterSimilarity(clusterA: string, clusterB: string): number {
  return clusterA === clusterB ? 1.0 : 0.0
}

/**
 * アイテム間の類似度を計算
 */
export function calculateSimilarity(
  itemA: DiversityItem,
  itemB: DiversityItem,
  method: MMRConfig['similarityMethod'] = 'cosine'
): number {
  switch (method) {
    case 'cosine':
      if (itemA.embedding && itemB.embedding) {
        return cosineSimilarity(itemA.embedding, itemB.embedding)
      }
      // 埋め込みがない場合はクラスタで判定
      return clusterSimilarity(itemA.clusterId, itemB.clusterId)

    case 'euclidean':
      if (itemA.embedding && itemB.embedding) {
        return euclideanSimilarity(itemA.embedding, itemB.embedding)
      }
      return clusterSimilarity(itemA.clusterId, itemB.clusterId)

    case 'jaccard':
      if (itemA.features && itemB.features) {
        return jaccardSimilarity(itemA.features, itemB.features)
      }
      return clusterSimilarity(itemA.clusterId, itemB.clusterId)

    case 'cluster':
      return clusterSimilarity(itemA.clusterId, itemB.clusterId)

    default:
      return 0
  }
}

// ============================================
// MMR (Maximal Marginal Relevance)
// ============================================

/**
 * MMRスコアを計算
 *
 * MMR = λ * Rel(d) - (1-λ) * max(Sim(d, d'))
 *
 * @param candidate - 候補アイテム
 * @param selected - 既選択アイテム
 * @param config - MMR設定
 * @returns MMRスコア
 */
export function calculateMMRScore(
  candidate: DiversityItem,
  selected: DiversityItem[],
  config: MMRConfig = DEFAULT_MMR_CONFIG
): number {
  const { lambda, similarityMethod } = config

  // 関連性スコア (正規化済みと仮定)
  const relevance = candidate.score

  // 既選択との最大類似度
  let maxSimilarity = 0
  for (const s of selected) {
    const sim = calculateSimilarity(candidate, s, similarityMethod)
    if (sim > maxSimilarity) {
      maxSimilarity = sim
    }
  }

  // MMRスコア
  return lambda * relevance - (1 - lambda) * maxSimilarity
}

/**
 * MMRによる再ランキング
 *
 * 貪欲法で、各ステップで最もMMRスコアが高いアイテムを選択
 *
 * @param candidates - 候補アイテム (スコア降順でソート済み)
 * @param k - 選択数
 * @param config - MMR設定
 * @returns 選択されたアイテム
 */
export function mmrRerank(
  candidates: DiversityItem[],
  k: number,
  config: MMRConfig = DEFAULT_MMR_CONFIG
): DiversityItem[] {
  if (candidates.length === 0) return []
  if (k >= candidates.length) return candidates

  const selected: DiversityItem[] = []
  const remaining = [...candidates]

  // 最初のアイテムは最高スコアを選択
  const first = remaining.shift()!
  selected.push(first)

  // 残りをMMRで選択
  while (selected.length < k && remaining.length > 0) {
    let bestIdx = 0
    let bestScore = -Infinity

    for (let i = 0; i < remaining.length; i++) {
      const mmrScore = calculateMMRScore(remaining[i], selected, config)
      if (mmrScore > bestScore) {
        bestScore = mmrScore
        bestIdx = i
      }
    }

    selected.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }

  return selected
}

// ============================================
// DPP (Determinantal Point Process)
// ============================================

/**
 * DPP用のカーネル行列を構築
 *
 * L[i,j] = q_i * S[i,j] * q_j
 * - q_i: アイテムiの品質スコア
 * - S[i,j]: アイテムi,j間の類似度
 *
 * @param items - アイテムリスト
 * @param config - DPP設定
 * @returns カーネル行列
 */
export function buildDPPKernel(
  items: DiversityItem[],
  config: DPPConfig = DEFAULT_DPP_CONFIG
): number[][] {
  const n = items.length
  const L: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

  // Guard: clamp qualityWeight to reasonable range (computed once)
  const safeQW = Math.max(0, Math.min(10, config.qualityWeight))

  // Pre-compute quality scores for all items (optimization)
  const qualityScores: number[] = items.map(item => {
    const score = Math.max(1e-10, item.score)
    return Math.pow(score, safeQW)
  })

  // Build symmetric matrix - only compute upper triangle
  for (let i = 0; i < n; i++) {
    const qi = qualityScores[i]

    // Diagonal: L[i,i] = qi^2
    L[i][i] = qi * qi

    // Upper triangle (j > i), then mirror to lower triangle
    for (let j = i + 1; j < n; j++) {
      const qj = qualityScores[j]

      // 類似度 (computed once per pair)
      const similarity = calculateSimilarity(items[i], items[j], 'cosine')

      // 多様性カーネル: 類似度が高いほど行列式が小さくなる
      const diversityFactor = 1 - config.diversityWeight * similarity
      const value = qi * Math.max(0, diversityFactor) * qj

      // Set both L[i][j] and L[j][i] (symmetric)
      L[i][j] = value
      L[j][i] = value
    }
  }

  return L
}

/**
 * 行列式を計算 (LU分解)
 */
export function determinant(matrix: number[][]): number {
  const n = matrix.length
  if (n === 0) return 1
  if (n === 1) return matrix[0][0]
  if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0]

  // LU分解で計算
  const lu = matrix.map(row => [...row])
  let det = 1

  for (let i = 0; i < n; i++) {
    // ピボット選択
    let maxRow = i
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(lu[k][i]) > Math.abs(lu[maxRow][i])) {
        maxRow = k
      }
    }

    if (maxRow !== i) {
      [lu[i], lu[maxRow]] = [lu[maxRow], lu[i]]
      det *= -1
    }

    if (Math.abs(lu[i][i]) < 1e-10) return 0

    det *= lu[i][i]

    for (let k = i + 1; k < n; k++) {
      const factor = lu[k][i] / lu[i][i]
      for (let j = i + 1; j < n; j++) {
        lu[k][j] -= factor * lu[i][j]
      }
    }
  }

  return det
}

/**
 * 部分集合のカーネル行列を抽出
 */
function extractSubKernel(L: number[][], indices: number[]): number[][] {
  if (indices.length === 0) return []
  if (L.length === 0) return []

  return indices.map(i => {
    // Guard: validate row index is within bounds
    if (i < 0 || i >= L.length || !L[i]) {
      return indices.map(() => 0)
    }
    return indices.map(j => {
      // Guard: validate column index is within bounds
      if (j < 0 || j >= L[i].length) return 0
      const value = L[i][j]
      // Guard: sanitize NaN/Infinity values
      return Number.isFinite(value) ? value : 0
    })
  })
}

/**
 * DPPによるサンプリング (貪欲近似)
 *
 * 各ステップで条件付き確率が最大のアイテムを選択
 *
 * @param items - アイテムリスト
 * @param k - 選択数
 * @param config - DPP設定
 * @returns 選択されたアイテムとインデックス
 */
export function dppSampleGreedy(
  items: DiversityItem[],
  k: number,
  config: DPPConfig = DEFAULT_DPP_CONFIG
): { selected: DiversityItem[]; indices: number[] } {
  if (items.length === 0) return { selected: [], indices: [] }
  if (k >= items.length) return { selected: items, indices: items.map((_, i) => i) }

  const L = buildDPPKernel(items, config)
  const selectedIndices: number[] = []
  // Optimization: use Set for O(1) deletion instead of array indexOf+splice (O(n))
  const remainingSet = new Set(items.map((_, i) => i))

  while (selectedIndices.length < k && remainingSet.size > 0) {
    let bestIdx = -1
    let bestGain = -Infinity

    for (const idx of remainingSet) {
      // 追加時の確率ゲインを計算
      const testIndices = [...selectedIndices, idx]
      const subL = extractSubKernel(L, testIndices)
      const rawGain = stableDeterminant(subL, config.regularization)

      // Guard: ensure gain is positive and finite
      const gain = Math.max(0, Number.isFinite(rawGain) ? rawGain : 0)
      const safeTemperature = Math.max(config.temperature, 1e-6)

      // 温度でスケーリング
      // Guard: avoid Math.pow edge cases (0^fractional = 0, but check for Infinity)
      let scaledGain: number
      if (gain <= 0) {
        scaledGain = 0
      } else {
        const exponent = 1 / safeTemperature
        scaledGain = Math.pow(gain, exponent)
        // Guard: check result is finite
        if (!Number.isFinite(scaledGain)) {
          scaledGain = 0
        }
      }

      if (Number.isNaN(scaledGain)) {
        continue
      }

      if (scaledGain > bestGain) {
        bestGain = scaledGain
        bestIdx = idx
      }
    }

    if (bestIdx === -1) break

    selectedIndices.push(bestIdx)
    // Optimization: O(1) Set deletion instead of O(n) indexOf+splice
    remainingSet.delete(bestIdx)
  }

  return {
    selected: selectedIndices.map(i => items[i]),
    indices: selectedIndices
  }
}

// ============================================
// Sliding Window Diversity
// ============================================

/** スライディングウィンドウ設定 */
export interface SlidingWindowConfig {
  /** ウィンドウサイズ */
  windowSize: number
  /** 同一クラスタの最大数 */
  maxPerCluster: number
  /** 最小類似度閾値 (これ以上類似していたら追加しない) */
  minDiversityThreshold: number
}

export const DEFAULT_SLIDING_WINDOW_CONFIG: SlidingWindowConfig = {
  windowSize: DIVERSITY_DEFAULTS.diversityCapN,
  maxPerCluster: DIVERSITY_DEFAULTS.diversityCapK,
  minDiversityThreshold: DIVERSITY_DEFAULTS.slidingWindowSimilarityThreshold
}

/**
 * スライディングウィンドウによる多様性フィルタリング
 *
 * @param candidates - 候補アイテム (優先度順)
 * @param config - 設定
 * @returns フィルタリング結果
 */
export function slidingWindowFilter(
  candidates: DiversityItem[],
  config: SlidingWindowConfig = DEFAULT_SLIDING_WINDOW_CONFIG
): {
  filtered: DiversityItem[]
  stats: {
    clusterViolations: number
    similarityViolations: number
    totalFiltered: number
  }
} {
  const { windowSize, maxPerCluster, minDiversityThreshold } = config
  const result: DiversityItem[] = []
  const clusterCounts: Record<string, number> = {}
  let clusterViolations = 0
  let similarityViolations = 0

  for (const candidate of candidates) {
    if (result.length >= windowSize) break

    // クラスタ制約チェック
    const currentClusterCount = clusterCounts[candidate.clusterId] || 0
    if (currentClusterCount >= maxPerCluster) {
      clusterViolations++
      continue
    }

    // 類似度制約チェック (直近アイテムとの比較)
    let tooSimilar = false
    const recentWindow = result.slice(-5) // 直近5件と比較
    for (const recent of recentWindow) {
      const sim = calculateSimilarity(candidate, recent, 'cosine')
      if (sim >= minDiversityThreshold) {
        tooSimilar = true
        break
      }
    }

    if (tooSimilar) {
      similarityViolations++
      continue
    }

    // 追加
    result.push(candidate)
    clusterCounts[candidate.clusterId] = currentClusterCount + 1
  }

  return {
    filtered: result,
    stats: {
      clusterViolations,
      similarityViolations,
      totalFiltered: clusterViolations + similarityViolations
    }
  }
}

// ============================================
// 統合: ハイブリッド多様性再ランキング
// ============================================

/** ハイブリッド設定 */
export interface HybridDiversityConfig {
  /** 使用する手法 */
  method: 'mmr' | 'dpp' | 'sliding' | 'hybrid'
  /** MMR設定 */
  mmr: MMRConfig
  /** DPP設定 */
  dpp: DPPConfig
  /** スライディングウィンドウ設定 */
  sliding: SlidingWindowConfig
  /** ハイブリッド時のMMR重み (0.0-1.0) */
  hybridMMRWeight: number
}

export const DEFAULT_HYBRID_CONFIG: HybridDiversityConfig = {
  method: 'hybrid',
  mmr: DEFAULT_MMR_CONFIG,
  dpp: DEFAULT_DPP_CONFIG,
  sliding: DEFAULT_SLIDING_WINDOW_CONFIG,
  hybridMMRWeight: 0.6
}

/**
 * ハイブリッド多様性再ランキング
 *
 * - MMRで初期選択
 * - DPPで確率的調整
 * - スライディングウィンドウで最終制約
 *
 * @param candidates - 候補アイテム
 * @param k - 選択数
 * @param config - 設定
 * @returns 再ランキング結果
 */
export function hybridDiversityRerank(
  candidates: DiversityItem[],
  k: number,
  config: HybridDiversityConfig = DEFAULT_HYBRID_CONFIG
): {
  result: DiversityItem[]
  method: string
  stats: Record<string, unknown>
} {
  if (candidates.length === 0) {
    return { result: [], method: config.method, stats: {} }
  }

  switch (config.method) {
    case 'mmr': {
      const result = mmrRerank(candidates, k, config.mmr)
      return {
        result,
        method: 'mmr',
        stats: { lambda: config.mmr.lambda }
      }
    }

    case 'dpp': {
      const { selected, indices } = dppSampleGreedy(candidates, k, config.dpp)
      return {
        result: selected,
        method: 'dpp',
        stats: { selectedIndices: indices }
      }
    }

    case 'sliding': {
      const { filtered, stats } = slidingWindowFilter(candidates, config.sliding)
      return {
        result: filtered.slice(0, k),
        method: 'sliding',
        stats
      }
    }

    case 'hybrid':
    default: {
      // 1. MMRで2倍の候補を選択
      const mmrK = Math.min(k * 2, candidates.length)
      const mmrResult = mmrRerank(candidates, mmrK, config.mmr)

      // 2. DPPで最終選択
      const { selected, indices } = dppSampleGreedy(mmrResult, k, config.dpp)

      // 3. スライディングウィンドウで制約チェック
      const { filtered, stats } = slidingWindowFilter(selected, config.sliding)

      // 足りない場合はMMR結果から補完
      const finalResult = [...filtered]
      if (finalResult.length < k) {
        for (const item of mmrResult) {
          if (finalResult.length >= k) break
          if (!finalResult.find(r => r.itemKey === item.itemKey)) {
            finalResult.push(item)
          }
        }
      }

      return {
        result: finalResult.slice(0, k),
        method: 'hybrid',
        stats: {
          mmrCandidates: mmrK,
          dppSelected: indices.length,
          slidingStats: stats,
          finalCount: finalResult.length
        }
      }
    }
  }
}

/**
 * 多様性スコアを計算
 *
 * @param items - アイテムリスト
 * @returns 多様性メトリクス
 */
export function calculateDiversityMetrics(items: DiversityItem[]): {
  /** クラスタエントロピー */
  clusterEntropy: number
  /** 平均ペアワイズ距離 */
  averagePairwiseDistance: number
  /** ユニーククラスタ数 */
  uniqueClusters: number
  /** 最大クラスタ比率 */
  maxClusterRatio: number
} {
  if (items.length === 0) {
    return {
      clusterEntropy: 0,
      averagePairwiseDistance: 0,
      uniqueClusters: 0,
      maxClusterRatio: 0
    }
  }

  // クラスタ分布を計算
  const clusterCounts: Record<string, number> = {}
  for (const item of items) {
    clusterCounts[item.clusterId] = (clusterCounts[item.clusterId] || 0) + 1
  }

  const clusters = Object.keys(clusterCounts)
  const total = items.length

  // エントロピー計算
  let entropy = 0
  let maxCount = 0
  for (const cluster of clusters) {
    const p = clusterCounts[cluster] / total
    if (p > 0) {
      entropy -= p * Math.log2(p)
    }
    if (clusterCounts[cluster] > maxCount) {
      maxCount = clusterCounts[cluster]
    }
  }

  // 平均ペアワイズ距離
  let totalDistance = 0
  let pairCount = 0
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const sim = calculateSimilarity(items[i], items[j], 'cosine')
      totalDistance += 1 - sim // 距離 = 1 - 類似度
      pairCount++
    }
  }
  const avgDistance = pairCount > 0 ? totalDistance / pairCount : 0

  return {
    clusterEntropy: entropy,
    averagePairwiseDistance: avgDistance,
    uniqueClusters: clusters.length,
    maxClusterRatio: maxCount / total
  }
}
