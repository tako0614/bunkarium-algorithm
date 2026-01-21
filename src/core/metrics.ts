import type { PublicMetrics, PublicMetricsInput } from '../types'

import type { PublicMetricsParams } from '../types'
import { DEFAULT_PUBLIC_METRICS_PARAMS } from '../types'
import { round6 } from './utils'
import { LN2 } from './defaults'

/**
 * クラスタ重みを上位50に集約（パフォーマンス対策）
 * algorithm.md仕様: クラスタ数が50を超える場合、上位49を保持し残りは"__other__"に集約
 */
function aggregateClusters(clusterWeights: Record<string, number>): Record<string, number> {
  const entries = Object.entries(clusterWeights)
    .map(([cluster, weight]) => ({ cluster, weight: Math.max(0, weight) }))
    .filter(entry => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight)

  if (entries.length <= 50) {
    return Object.fromEntries(entries.map(e => [e.cluster, e.weight]))
  }

  // 上位49 + "__other__"
  const top49 = entries.slice(0, 49)
  const otherWeight = entries.slice(49).reduce((sum, e) => sum + e.weight, 0)

  const aggregated: Record<string, number> = Object.fromEntries(top49.map(e => [e.cluster, e.weight]))
  if (otherWeight > 0) {
    aggregated['__other__'] = otherWeight
  }

  return aggregated
}

function getClusterDistribution(clusterWeights: Record<string, number>): number[] {
  const aggregated = aggregateClusters(clusterWeights)
  const weights = Object.values(aggregated)

  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (total <= 0) return []

  return weights.map(weight => weight / total)
}

/**
 * 公開メトリクス計算
 *
 * 「総数」ではなく「割合/密度/分布」を基本とする
 */

/**
 * 支持密度（Support Density）を計算
 *
 * SD(c) = (weightedLikeSum + priorLikes) / (qualifiedUniqueViewers + priorViews)^β
 *
 * @param weightedLikeSum - 重み付きいいね合計
 * @param qualifiedUniqueViewers - 不正排除済みユニーク閲覧者数（distinct viewers）
 * @param beta - 指数（デフォルト: 1.0）
 * @param priorViews - 事前分母
 * @param priorLikes - 事前分子
 * @returns 支持密度
 */
export function calculateSupportDensity(
  weightedLikeSum: number,
  qualifiedUniqueViewers: number,
  beta: number = 1.0,
  priorViews: number = 10,
  priorLikes: number = 1
): number {
  // Guard: clamp beta to reasonable range to prevent underflow/overflow
  const safeBeta = Math.max(-10, Math.min(10, beta))
  // Guard: ensure base value is at least 1e-10 to prevent extreme overflow with negative beta
  const baseValue = Math.max(1e-10, qualifiedUniqueViewers + priorViews)
  const denominator = Math.pow(baseValue, safeBeta)
  // Guard: check for underflow (very small values) and overflow (Infinity/very large)
  if (!Number.isFinite(denominator) || denominator < 1e-100) return 0
  const numerator = Math.max(0, weightedLikeSum + priorLikes)
  const result = numerator / denominator
  // For very large denominators, result will be very small but valid
  // Only return 0 for truly invalid results (NaN, Infinity, negative)
  if (!Number.isFinite(result) || result < 0) return 0
  // Clamp extremely small values to prevent floating-point noise
  return result < 1e-15 ? 0 : result
}

/**
 * 支持率（Support Rate）を計算
 * algorithm.md仕様: uniqueLikersを分子に使用（weightedLikeSumとは分離）
 *
 * SR(c) = clamp(0, 1, (uniqueLikers + priorUniqueLikers) / (qualifiedUniqueViewers + priorViews))
 *
 * @param uniqueLikers - ユニークいいね者数（distinct likers）
 * @param qualifiedUniqueViewers - 不正排除済みユニーク閲覧者数（distinct viewers）
 * @param priorViews - 事前分母
 * @param priorUniqueLikers - uniqueLikers平滑化事前値
 * @returns 支持率（0～1）
 */
export function calculateSupportRate(
  uniqueLikers: number,
  qualifiedUniqueViewers: number,
  priorViews: number = 10,
  priorUniqueLikers: number = 1
): number {
  // Guard: ensure priors are valid to prevent division by zero when both are 0
  const safePriorViews = Math.max(1, priorViews)
  const V = qualifiedUniqueViewers + safePriorViews
  if (V <= 0) return 0
  const Lu = uniqueLikers + priorUniqueLikers
  const rate = Lu / V
  return Math.max(0, Math.min(1, rate))
}

/**
 * 重み付き支持指数（Weighted Support Index）を計算
 * algorithm.md仕様: weightedLikeSum/QUV（1を超える可能性あり）
 *
 * WSI(c) = (weightedLikeSum + priorLikes) / (qualifiedUniqueViewers + priorViews)
 *
 * @param weightedLikeSum - 重み付きいいね合計
 * @param qualifiedUniqueViewers - 不正排除済みユニーク閲覧者数
 * @param priorViews - 事前分母
 * @param priorLikes - 事前分子
 * @returns 重み付き支持指数（1を超える可能性あり）
 */
export function calculateWeightedSupportIndex(
  weightedLikeSum: number,
  qualifiedUniqueViewers: number,
  priorViews: number = 10,
  priorLikes: number = 1
): number {
  // Guard: ensure priors are valid to prevent division by zero when both are 0
  const safePriorViews = Math.max(1, priorViews)
  const V = qualifiedUniqueViewers + safePriorViews
  if (V <= 0) return 0
  const Lw = weightedLikeSum + priorLikes
  return Lw / V
}

/**
 * 重み付き支持率（Weighted Support Rate Clamped）を計算
 * algorithm.md仕様: weightedSupportIndexを0～1にクランプ
 *
 * @param weightedLikeSum - 重み付きいいね合計
 * @param qualifiedUniqueViewers - 不正排除済みユニーク閲覧者数
 * @param priorViews - 事前分母
 * @param priorLikes - 事前分子
 * @returns 重み付き支持率（0～1）
 */
export function calculateWeightedSupportRateClamped(
  weightedLikeSum: number,
  qualifiedUniqueViewers: number,
  priorViews: number = 10,
  priorLikes: number = 1
): number {
  const wsi = calculateWeightedSupportIndex(weightedLikeSum, qualifiedUniqueViewers, priorViews, priorLikes)
  return Math.max(0, Math.min(1, wsi))
}

/**
 * 広がり（Breadth）を計算
 *
 * 実効クラスタ数（exp(entropy)）
 *
 * @param clusterWeights - 支持クラスタの重み分布
 * @returns 実効クラスタ数
 */
export function calculateBreadth(clusterWeights: Record<string, number>): number {
  const distribution = getClusterDistribution(clusterWeights)
  if (distribution.length === 0) return 0

  let entropy = 0
  for (const p of distribution) {
    // Guard: ensure p is finite and positive to avoid NaN
    if (p > 0 && Number.isFinite(p)) {
      entropy -= p * Math.log(p)
    }
  }

  // Guard: clamp entropy to prevent Math.exp overflow (Math.exp(709) ≈ 8.2e307)
  const safeEntropy = Math.min(709, entropy)
  return Number.isFinite(safeEntropy) ? Math.exp(safeEntropy) : 1
}

/**
 * 上位クラスタ偏りを計算
 *
 * @param clusterWeights - 支持クラスタの重み分布
 * @returns 最大クラスタ比率
 */
export function calculateTopClusterShare(clusterWeights: Record<string, number>): number {
  const distribution = getClusterDistribution(clusterWeights)
  let maxShare = 0
  for (const p of distribution) {
    maxShare = Math.max(maxShare, p)
  }
  return maxShare
}

/**
 * 広がりレベルを判定
 *
 * @param breadth - 実効クラスタ数
 * @returns レベル（low/medium/high）
 */
export function getBreadthLevel(breadth: number): 'low' | 'medium' | 'high' {
  if (breadth >= 5) return 'high'
  if (breadth >= 3) return 'medium'
  return 'low'
}

/**
 * 持続（Persistence）を計算
 *
 * @param daysSinceFirstReaction - 最初の反応からの日数
 * @param recentReactionRate - 直近の反応残存率（0.0-1.0）
 * @param halfLifeDays - 半減期（日）
 * @returns 持続日数（重み付き）
 */
export function calculatePersistence(
  daysSinceFirstReaction: number,
  recentReactionRate: number,
  halfLifeDays: number = 14
): number {
  const r = Math.max(0, Math.min(1, recentReactionRate))
  if (r <= 0 || halfLifeDays <= 0) return 0

  const ageDays = Math.max(0, daysSinceFirstReaction)
  const factor = 1 - Math.exp(-LN2 * ageDays / halfLifeDays)
  return r * factor * halfLifeDays
}

/**
 * 持続レベルを判定
 *
 * @param persistenceDays - 持続日数
 * @returns レベル（low/medium/high）
 */
export function getPersistenceLevel(
  persistenceDays: number,
  halfLifeDays: number = DEFAULT_PUBLIC_METRICS_PARAMS.halfLifeDays
): 'low' | 'medium' | 'high' {
  if (halfLifeDays <= 0) return 'low'
  const highThreshold = halfLifeDays * 0.8
  const mediumThreshold = halfLifeDays * 0.5
  if (persistenceDays >= highThreshold) return 'high'
  if (persistenceDays >= mediumThreshold) return 'medium'
  return 'low'
}

/**
 * 公開メトリクスを一括計算
 * algorithm.md仕様に準拠（qualifiedUniqueViewers, uniqueLikers, weightedSupportIndex等）
 *
 * @param input - メトリクス計算用入力
 * @param params - 追加パラメータ
 * @returns 公開メトリクス（数値は6桁精度）
 */
export function calculatePublicMetrics(
  input: PublicMetricsInput,
  params?: Partial<PublicMetricsParams>
): PublicMetrics {
  const effectiveParams = { ...DEFAULT_PUBLIC_METRICS_PARAMS, ...params }
  const { beta, priorViews, priorLikes, priorUniqueLikers, halfLifeDays } = effectiveParams

  const supportDensity = calculateSupportDensity(
    input.weightedLikeSum,
    input.qualifiedUniqueViewers,
    beta,
    priorViews,
    priorLikes
  )

  const supportRate = calculateSupportRate(
    input.uniqueLikers,
    input.qualifiedUniqueViewers,
    priorViews,
    priorUniqueLikers
  )

  const weightedSupportIndex = calculateWeightedSupportIndex(
    input.weightedLikeSum,
    input.qualifiedUniqueViewers,
    priorViews,
    priorLikes
  )

  const weightedSupportRateClamped = calculateWeightedSupportRateClamped(
    input.weightedLikeSum,
    input.qualifiedUniqueViewers,
    priorViews,
    priorLikes
  )

  const breadth = calculateBreadth(input.clusterWeights)
  const breadthLevel = getBreadthLevel(breadth)
  const topClusterShare = calculateTopClusterShare(input.clusterWeights)

  const persistenceDays = calculatePersistence(
    input.daysSinceFirstReaction,
    input.recentReactionRate,
    halfLifeDays
  )
  const persistenceLevel = getPersistenceLevel(persistenceDays, halfLifeDays)

  // 数値精度: 6桁に丸める（algorithm.md仕様）
  return {
    supportDensity: round6(supportDensity),
    supportRate: round6(supportRate),
    weightedSupportIndex: round6(weightedSupportIndex),
    weightedSupportRateClamped: round6(weightedSupportRateClamped),
    culturalViewValue: round6(input.weightedViews),
    weightedViews: round6(input.weightedViews),
    qualifiedUniqueViewers: input.qualifiedUniqueViewers,
    breadth: round6(breadth),
    breadthLevel,
    persistenceDays: round6(persistenceDays),
    persistenceLevel,
    topClusterShare: round6(topClusterShare)
  }
}

/**
 * メトリクスを人間が読める文言に変換
 *
 * @param metrics - 公開メトリクス
 * @returns 表示用テキスト一覧
 */
export function formatMetricsForDisplay(metrics: PublicMetrics): string[] {
  const labels: string[] = []

  // 支持密度
  if (metrics.supportDensity > 0.5) {
    labels.push('支持密度: 高（見た人の中で支持が濃い）')
  } else if (metrics.supportDensity > 0.2) {
    labels.push('支持密度: 中')
  }

  // 広がり
  if (metrics.breadth > 0) {
    labels.push(`広がり: ${metrics.breadth}シーンに到達`)
  }

  // 持続
  if (metrics.persistenceDays >= 1) {
    labels.push(`持続: ${Math.round(metrics.persistenceDays)}日間反応が継続`)
  }

  return labels
}
