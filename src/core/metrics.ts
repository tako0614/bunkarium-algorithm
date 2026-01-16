import type { PublicMetrics, MetricsInput } from '../types'

const LN2 = Math.log(2)

function getClusterDistribution(clusterWeights: Record<string, number>): number[] {
  const weights = Object.values(clusterWeights)
    .map(weight => Math.max(0, weight))
    .filter(weight => weight > 0)

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
 * SD(c) = Σ(w(u) * CR(u)) / UV(c)^β
 *
 * @param weightedLikeSum - 重み付きいいね合計
 * @param qualifiedUniqueViews - 不正排除済みユニーク閲覧数
 * @param beta - 指数（デフォルト: 1.0、ロングテール救済は0.7-1.0）
 * @param priorViews - 事前分母
 * @param priorLikes - 事前分子
 * @returns 支持密度
 */
export function calculateSupportDensity(
  weightedLikeSum: number,
  qualifiedUniqueViews: number,
  beta: number = 1.0,
  priorViews: number = 10,
  priorLikes: number = 1
): number {
  const denominator = Math.pow(qualifiedUniqueViews + priorViews, beta)
  if (denominator <= 0) return 0
  return (weightedLikeSum + priorLikes) / denominator
}

/**
 * 支持率（Support Rate）を計算
 *
 * SR(c) = (Σ(w(u) * CR(u)) + priorLikes) / (UV(c) + priorViews)
 *
 * @param weightedLikeSum - 重み付きいいね合計
 * @param qualifiedUniqueViews - 不正排除済みユニーク閲覧数
 * @param priorViews - 事前分母
 * @param priorLikes - 事前分子
 * @returns 支持率
 */
export function calculateSupportRate(
  weightedLikeSum: number,
  qualifiedUniqueViews: number,
  priorViews: number = 10,
  priorLikes: number = 1
): number {
  const denominator = qualifiedUniqueViews + priorViews
  if (denominator <= 0) return 0
  const rate = (weightedLikeSum + priorLikes) / denominator
  return Math.min(1, rate)
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
    if (p > 0) {
      entropy -= p * Math.log(p)
    }
  }

  return Math.exp(entropy)
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
  if (recentReactionRate <= 0 || halfLifeDays <= 0) return 0

  const ageDays = Math.max(0, daysSinceFirstReaction)
  const factor = 1 - Math.exp(-LN2 * ageDays / halfLifeDays)
  return recentReactionRate * factor * halfLifeDays
}

/**
 * 持続レベルを判定
 *
 * @param persistenceDays - 持続日数
 * @returns レベル（low/medium/high）
 */
export function getPersistenceLevel(persistenceDays: number): 'low' | 'medium' | 'high' {
  if (persistenceDays >= 14) return 'high'
  if (persistenceDays >= 7) return 'medium'
  return 'low'
}

/**
 * 公開メトリクスを一括計算
 *
 * @param input - メトリクス計算用入力
 * @param options - 追加パラメータ
 * @returns 公開メトリクス
 */
export function calculatePublicMetrics(
  input: MetricsInput,
  options: {
    beta?: number
    priorViews?: number
    priorLikes?: number
    persistenceHalfLifeDays?: number
  } = {}
): PublicMetrics {
  const beta = options.beta ?? 1.0
  const priorViews = options.priorViews ?? 10
  const priorLikes = options.priorLikes ?? 1
  const persistenceHalfLifeDays = options.persistenceHalfLifeDays ?? 14

  const supportDensity = calculateSupportDensity(
    input.weightedLikeSum,
    input.qualifiedUniqueViews,
    beta,
    priorViews,
    priorLikes
  )

  const supportRate = calculateSupportRate(
    input.weightedLikeSum,
    input.qualifiedUniqueViews,
    priorViews,
    priorLikes
  )

  const breadth = calculateBreadth(input.clusterWeights)
  const breadthLevel = getBreadthLevel(breadth)
  const topClusterShare = calculateTopClusterShare(input.clusterWeights)

  const persistenceDays = calculatePersistence(
    input.daysSinceFirstReaction,
    input.recentReactionRate,
    persistenceHalfLifeDays
  )
  const persistenceLevel = getPersistenceLevel(persistenceDays)

  return {
    supportDensity,
    supportRate,
    culturalViewValue: input.weightedViews,
    weightedViews: input.weightedViews,
    qualifiedUniqueViews: input.qualifiedUniqueViews,
    breadth,
    breadthLevel,
    persistenceDays,
    persistenceLevel,
    topClusterShare
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
