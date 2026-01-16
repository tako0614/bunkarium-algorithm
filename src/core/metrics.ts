import type { PublicMetrics, MetricsInput } from '../types'

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
 * @param uniqueViews - ユニーク閲覧数
 * @param beta - 指数（デフォルト: 1.0、ロングテール救済は0.7〜1.0）
 * @returns 支持密度
 */
export function calculateSupportDensity(
  weightedLikeSum: number,
  uniqueViews: number,
  beta: number = 1.0
): number {
  if (uniqueViews <= 0) return 0
  return weightedLikeSum / Math.pow(uniqueViews, beta)
}

/**
 * 支持率（Support Rate）を計算
 *
 * SR(c) = Σ(w(u) * CR(u)) / UV(c)
 *
 * @param weightedLikeSum - 重み付きいいね合計
 * @param uniqueViews - ユニーク閲覧数
 * @returns 支持率
 */
export function calculateSupportRate(
  weightedLikeSum: number,
  uniqueViews: number
): number {
  if (uniqueViews <= 0) return 0
  return weightedLikeSum / uniqueViews
}

/**
 * 広がり（Breadth）を計算
 *
 * 支持者のクラスタ分布から到達クラスタ数を計算
 *
 * @param supporterClusters - 支持者のクラスタID一覧
 * @returns 到達クラスタ数
 */
export function calculateBreadth(supporterClusters: string[]): number {
  return new Set(supporterClusters).size
}

/**
 * 広がりレベルを判定
 *
 * @param breadth - 到達クラスタ数
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
 * @param recentReactionRate - 直近の反応残存率（0.0〜1.0）
 * @returns 持続日数（重み付き）
 */
export function calculatePersistence(
  daysSinceFirstReaction: number,
  recentReactionRate: number
): number {
  // 反応残存率で重み付けした持続日数
  return daysSinceFirstReaction * recentReactionRate
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
 * @param beta - 支持密度のβ値
 * @returns 公開メトリクス
 */
export function calculatePublicMetrics(
  input: MetricsInput,
  beta: number = 1.0
): PublicMetrics {
  const supportDensity = calculateSupportDensity(
    input.weightedLikeSum,
    input.uniqueViews,
    beta
  )

  const supportRate = calculateSupportRate(
    input.weightedLikeSum,
    input.uniqueViews
  )

  const breadth = calculateBreadth(input.supporterClusters)
  const breadthLevel = getBreadthLevel(breadth)

  const persistenceDays = calculatePersistence(
    input.daysSinceFirstReaction,
    input.recentReactionRate
  )
  const persistenceLevel = getPersistenceLevel(persistenceDays)

  return {
    supportDensity,
    supportRate,
    breadth,
    breadthLevel,
    persistenceDays,
    persistenceLevel
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
