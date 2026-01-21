/**
 * オフライン評価メトリクス
 *
 * アルゴリズムの品質を測定するための指標
 * - 集中度 (Gini係数)
 * - 多様性 (エントロピー、カバレッジ)
 * - ロングテール露出率
 * - クラスタ到達度
 * - 公平性メトリクス
 */

import { calculateGini as calculateGiniFromUtils } from './utils'

// Re-export for backward compatibility
export { calculateGiniFromUtils as calculateGini }

// ============================================
// 基本型定義
// ============================================

/** 露出ログ */
export interface ExposureLog {
  userId: string
  itemId: string
  clusterId: string
  position: number
  timestamp: number
  clicked?: boolean
  saved?: boolean
  liked?: boolean
}

/** アイテムの人気度情報 */
export interface ItemPopularity {
  itemId: string
  clusterId: string
  totalExposures: number
  totalLikes: number
  totalSaves: number
  createdAt: number
}

/** 評価結果 */
export interface EvaluationResult {
  /** Gini係数 (0=完全平等, 1=完全不平等) */
  giniCoefficient: number
  /** 露出のGini係数 */
  exposureGini: number
  /** いいねのGini係数 */
  likeGini: number
  /** ロングテール露出率 */
  longTailExposureRate: number
  /** ロングテールクリック率 */
  longTailClickRate: number
  /** クラスタカバレッジ */
  clusterCoverage: number
  /** クラスタエントロピー */
  clusterEntropy: number
  /** 平均位置バイアス */
  averagePositionBias: number
  /** ユーザー多様性スコア */
  userDiversityScore: number
  /** 新規アイテム露出率 */
  freshItemExposureRate: number
  /** 詳細統計 */
  details: {
    totalExposures: number
    uniqueItems: number
    uniqueUsers: number
    uniqueClusters: number
    longTailThreshold: number
    freshThresholdDays: number
  }
}

// Type aliases for spec compliance (algorithm.md line 111)
export interface OfflineDataset {
  exposures: ExposureLog[]
  popularity: ItemPopularity[]
  totalClusters: number
}

export interface OfflineEvalConfig {
  longTailTopPercentile?: number
  freshDays?: number
}

export type OfflineEvalReport = EvaluationResult

// ============================================
// Gini係数の計算
// ============================================

// calculateGini is imported from utils.ts and re-exported above for backward compatibility

/**
 * 露出分布からGini係数を計算
 */
export function calculateExposureGini(exposures: ExposureLog[]): number {
  // アイテムごとの露出回数を集計
  const itemExposures: Record<string, number> = {}
  for (const exp of exposures) {
    itemExposures[exp.itemId] = (itemExposures[exp.itemId] || 0) + 1
  }

  return calculateGiniFromUtils(Object.values(itemExposures))
}

/**
 * いいね分布からGini係数を計算
 */
export function calculateLikeGini(exposures: ExposureLog[]): number {
  // アイテムごとのいいね数を集計
  const itemLikes: Record<string, number> = {}
  for (const exp of exposures) {
    if (exp.liked) {
      itemLikes[exp.itemId] = (itemLikes[exp.itemId] || 0) + 1
    }
  }

  // 露出されたが0いいねのアイテムも含める
  const uniqueItems = new Set(exposures.map(e => e.itemId))
  for (const itemId of uniqueItems) {
    if (!(itemId in itemLikes)) {
      itemLikes[itemId] = 0
    }
  }

  return calculateGiniFromUtils(Object.values(itemLikes))
}

// ============================================
// ロングテール分析
// ============================================

/**
 * ロングテール閾値を計算 (パレート80/20ルール)
 *
 * @param popularity - アイテムの人気度リスト
 * @param topPercentile - 上位何%をヘッドとするか (デフォルト: 20%)
 * @returns 閾値となる人気度
 */
export function calculateLongTailThreshold(
  popularity: ItemPopularity[],
  topPercentile: number = 0.2
): number {
  if (popularity.length === 0) return 0

  // 露出数でソート (降順)
  const sorted = [...popularity].sort((a, b) => b.totalExposures - a.totalExposures)

  // Guard: ensure sorted array is not empty (should not happen, but defensive)
  if (sorted.length === 0) return 0

  // 上位N%のインデックス
  const safePercentile = Math.min(1, Math.max(0, topPercentile))

  // Edge case: when percentile is 0, all items should be considered "tail"
  // Return the maximum exposure (first item) as threshold so nothing qualifies as tail
  if (safePercentile === 0) {
    return sorted[0].totalExposures + 1  // +1 ensures nothing is <= this threshold
  }

  const headCount = Math.max(1, Math.floor(sorted.length * safePercentile))

  // Guard: ensure index is within bounds
  const safeIndex = Math.min(headCount - 1, sorted.length - 1)

  // ヘッドとテールの境界値
  return sorted[safeIndex].totalExposures
}

/**
 * ロングテール露出率を計算
 *
 * ロングテールアイテムが全露出のうち何%を占めているか
 *
 * @param exposures - 露出ログ
 * @param popularity - アイテム人気度
 * @param topPercentile - ヘッドの割合
 * @returns ロングテール露出率 (0-1)
 */
export function calculateLongTailExposureRate(
  exposures: ExposureLog[],
  popularity: ItemPopularity[],
  topPercentile: number = 0.2
): number {
  if (exposures.length === 0 || popularity.length === 0) return 0

  const threshold = calculateLongTailThreshold(popularity, topPercentile)

  // ロングテールアイテムのセット
  // Use Math.floor on threshold to avoid floating-point comparison issues
  const safeThreshold = Math.floor(threshold)
  const longTailItems = new Set(
    popularity
      .filter(p => p.totalExposures <= safeThreshold)
      .map(p => p.itemId)
  )

  // ロングテールへの露出をカウント
  let longTailExposures = 0
  for (const exp of exposures) {
    if (longTailItems.has(exp.itemId)) {
      longTailExposures++
    }
  }

  return longTailExposures / exposures.length
}

/**
 * ロングテールクリック率を計算
 */
export function calculateLongTailClickRate(
  exposures: ExposureLog[],
  popularity: ItemPopularity[],
  topPercentile: number = 0.2
): number {
  const threshold = calculateLongTailThreshold(popularity, topPercentile)

  const longTailItems = new Set(
    popularity
      .filter(p => p.totalExposures <= threshold)
      .map(p => p.itemId)
  )

  // ロングテールでのクリック
  let longTailClicks = 0
  let longTailExposures = 0
  for (const exp of exposures) {
    if (longTailItems.has(exp.itemId)) {
      longTailExposures++
      if (exp.clicked) {
        longTailClicks++
      }
    }
  }

  return longTailExposures > 0 ? longTailClicks / longTailExposures : 0
}

// ============================================
// クラスタ多様性
// ============================================

/**
 * クラスタカバレッジを計算
 *
 * 露出されたクラスタ数 / 全クラスタ数
 *
 * @param exposures - 露出ログ
 * @param totalClusters - 全クラスタ数
 * @returns カバレッジ率 (0-1)
 */
export function calculateClusterCoverage(
  exposures: ExposureLog[],
  totalClusters: number
): number {
  if (totalClusters === 0) return 0

  const uniqueClusters = new Set(exposures.map(e => e.clusterId))
  return uniqueClusters.size / totalClusters
}

/**
 * クラスタエントロピーを計算
 *
 * 高いほど多様 (均等に分布)
 * 低いほど偏り (特定クラスタに集中)
 *
 * @param exposures - 露出ログ
 * @returns 正規化エントロピー (0-1)
 */
export function calculateClusterEntropy(exposures: ExposureLog[]): number {
  if (exposures.length === 0) return 0

  // クラスタごとのカウント
  const clusterCounts: Record<string, number> = {}
  for (const exp of exposures) {
    clusterCounts[exp.clusterId] = (clusterCounts[exp.clusterId] || 0) + 1
  }

  const clusters = Object.values(clusterCounts)
  const total = exposures.length

  // エントロピー計算
  let entropy = 0
  for (const count of clusters) {
    const p = count / total
    if (p > 0) {
      entropy -= p * Math.log2(p)
    }
  }

  // 正規化 (最大エントロピー = log2(クラスタ数))
  // Guard: clusters.length が 0 または 1 の場合は 0 を返す
  if (clusters.length <= 1) return 0
  const maxEntropy = Math.log2(clusters.length)
  return maxEntropy > 0 ? entropy / maxEntropy : 0
}

/**
 * ユーザーごとの多様性スコアを計算
 *
 * @param exposures - 露出ログ
 * @returns 平均多様性スコア
 */
export function calculateUserDiversityScore(exposures: ExposureLog[]): number {
  if (exposures.length === 0) return 0

  // ユーザーごとに分類
  const userExposures: Record<string, ExposureLog[]> = {}
  for (const exp of exposures) {
    if (!userExposures[exp.userId]) {
      userExposures[exp.userId] = []
    }
    userExposures[exp.userId].push(exp)
  }

  // 各ユーザーの多様性を計算
  const userScores: number[] = []
  for (const exps of Object.values(userExposures)) {
    const entropy = calculateClusterEntropy(exps)
    userScores.push(entropy)
  }

  // 平均
  return userScores.length > 0
    ? userScores.reduce((a, b) => a + b, 0) / userScores.length
    : 0
}

// ============================================
// 位置バイアス
// ============================================

/**
 * 位置バイアスを計算
 *
 * クリックされたアイテムの平均位置
 * 低いほど上位に良いアイテムが配置されている
 *
 * @param exposures - 露出ログ
 * @returns 平均クリック位置
 */
export function calculatePositionBias(exposures: ExposureLog[]): number {
  const clicked = exposures.filter(e => e.clicked)
  if (clicked.length === 0) return 0

  const totalPosition = clicked.reduce((sum, e) => sum + e.position, 0)
  return totalPosition / clicked.length
}

/**
 * 位置ごとのCTR (Click-Through Rate) を計算
 *
 * @param exposures - 露出ログ
 * @param maxPosition - 最大位置
 * @returns 位置ごとのCTR
 */
export function calculatePositionCTR(
  exposures: ExposureLog[],
  maxPosition: number = 20
): { position: number; ctr: number; count: number }[] {
  const positionStats: { impressions: number; clicks: number }[] =
    Array(maxPosition).fill(null).map(() => ({ impressions: 0, clicks: 0 }))

  for (const exp of exposures) {
    if (exp.position < maxPosition) {
      positionStats[exp.position].impressions++
      if (exp.clicked) {
        positionStats[exp.position].clicks++
      }
    }
  }

  return positionStats.map((stat, i) => ({
    position: i,
    ctr: stat.impressions > 0 ? stat.clicks / stat.impressions : 0,
    count: stat.impressions
  }))
}

// ============================================
// 新規性 (Freshness)
// ============================================

/**
 * 新規アイテム露出率を計算
 *
 * @param exposures - 露出ログ
 * @param popularity - アイテム人気度
 * @param freshDays - 新規と見なす日数
 * @returns 新規アイテム露出率
 */
export function calculateFreshItemExposureRate(
  exposures: ExposureLog[],
  popularity: ItemPopularity[],
  freshDays: number = 7
): number {
  if (exposures.length === 0) return 0

  const now = Date.now()
  const freshThreshold = now - freshDays * 24 * 60 * 60 * 1000

  // 新規アイテムのセット
  const freshItems = new Set(
    popularity
      .filter(p => p.createdAt >= freshThreshold)
      .map(p => p.itemId)
  )

  // 新規への露出をカウント
  let freshExposures = 0
  for (const exp of exposures) {
    if (freshItems.has(exp.itemId)) {
      freshExposures++
    }
  }

  return freshExposures / exposures.length
}

// ============================================
// 公平性メトリクス
// ============================================

/** クラスタの公平性情報 */
export interface ClusterFairness {
  clusterId: string
  itemCount: number
  exposureShare: number
  expectedShare: number
  fairnessRatio: number // exposureShare / expectedShare
}

/**
 * クラスタ公平性を計算
 *
 * 各クラスタが期待される露出シェアを得ているか
 *
 * @param exposures - 露出ログ
 * @param popularity - アイテム人気度
 * @returns クラスタごとの公平性
 */
export function calculateClusterFairness(
  exposures: ExposureLog[],
  popularity: ItemPopularity[]
): ClusterFairness[] {
  // クラスタごとのアイテム数
  const clusterItemCounts: Record<string, number> = {}
  for (const p of popularity) {
    clusterItemCounts[p.clusterId] = (clusterItemCounts[p.clusterId] || 0) + 1
  }

  const totalItems = popularity.length

  // クラスタごとの露出数
  const clusterExposures: Record<string, number> = {}
  for (const exp of exposures) {
    clusterExposures[exp.clusterId] = (clusterExposures[exp.clusterId] || 0) + 1
  }

  const totalExposures = exposures.length

  // 公平性計算
  const results: ClusterFairness[] = []
  for (const clusterId of Object.keys(clusterItemCounts)) {
    const itemCount = clusterItemCounts[clusterId]
    const exposureCount = clusterExposures[clusterId] || 0

    const expectedShare = itemCount / totalItems
    const exposureShare = totalExposures > 0 ? exposureCount / totalExposures : 0
    const fairnessRatio = expectedShare > 0 ? exposureShare / expectedShare : 0

    results.push({
      clusterId,
      itemCount,
      exposureShare,
      expectedShare,
      fairnessRatio
    })
  }

  return results.sort((a, b) => a.fairnessRatio - b.fairnessRatio)
}

/**
 * 公平性のずれを計算 (Jensen-Shannon Divergence)
 *
 * @param exposures - 露出ログ
 * @param popularity - アイテム人気度
 * @returns JSD (0=完全に公平, 1=完全に不公平)
 */
export function calculateFairnessDivergence(
  exposures: ExposureLog[],
  popularity: ItemPopularity[]
): number {
  const fairness = calculateClusterFairness(exposures, popularity)
  if (fairness.length === 0) return 0

  // 期待分布と実際の分布
  const expected = fairness.map(f => f.expectedShare)
  const actual = fairness.map(f => f.exposureShare)

  // 正規化
  const expectedSum = expected.reduce((a, b) => a + b, 0)
  const actualSum = actual.reduce((a, b) => a + b, 0)

  // Guard: 両方の分布が全てゼロの場合は発散なし
  if (expectedSum <= 0 && actualSum <= 0) return 0
  // Guard: empty array guard for fallback division
  const n = expected.length
  if (n === 0) return 0

  const normalizedExpected = expectedSum > 0
    ? expected.map(e => e / expectedSum)
    : expected.map(() => 1 / n)
  const normalizedActual = actualSum > 0
    ? actual.map(a => a / actualSum)
    : actual.map(() => 1 / n)

  // Jensen-Shannon Divergence
  const m = normalizedExpected.map((e, i) => (e + normalizedActual[i]) / 2)

  const klPM = normalizedExpected.reduce((sum, p, i) => {
    if (p > 0 && m[i] > 0) {
      return sum + p * Math.log2(p / m[i])
    }
    return sum
  }, 0)

  const klQM = normalizedActual.reduce((sum, q, i) => {
    if (q > 0 && m[i] > 0) {
      return sum + q * Math.log2(q / m[i])
    }
    return sum
  }, 0)

  return (klPM + klQM) / 2
}

// ============================================
// 総合評価
// ============================================

/**
 * 総合評価を実行
 *
 * @param exposures - 露出ログ
 * @param popularity - アイテム人気度
 * @param totalClusters - 全クラスタ数
 * @param config - 設定
 * @returns 評価結果
 */
// Spec-compliant overload (algorithm.md line 111)
export function evaluateOffline(
  dataset: OfflineDataset,
  config?: OfflineEvalConfig
): OfflineEvalReport
// Backward-compatible signature
export function evaluateOffline(
  exposures: ExposureLog[],
  popularity: ItemPopularity[],
  totalClusters: number,
  config?: OfflineEvalConfig
): EvaluationResult
// Implementation
export function evaluateOffline(
  exposuresOrDataset: ExposureLog[] | OfflineDataset,
  popularityOrConfig?: ItemPopularity[] | OfflineEvalConfig,
  totalClusters?: number,
  config?: OfflineEvalConfig
): EvaluationResult {
  // Spec-compliant signature: (dataset: OfflineDataset, config?: OfflineEvalConfig)
  if (!Array.isArray(exposuresOrDataset)) {
    const dataset = exposuresOrDataset as OfflineDataset
    const evalConfig = popularityOrConfig as OfflineEvalConfig | undefined
    return evaluateOffline(dataset.exposures, dataset.popularity, dataset.totalClusters, evalConfig)
  }

  // Backward-compatible signature
  const exposures = exposuresOrDataset as ExposureLog[]
  const popularity = popularityOrConfig as ItemPopularity[]
  if (totalClusters === undefined) {
    throw new Error('totalClusters is required when calling with separate parameters')
  }
  const clusters = totalClusters
  const evalConfig = config ?? {}

  const { longTailTopPercentile = 0.2, freshDays = 7 } = evalConfig

  const threshold = calculateLongTailThreshold(popularity, longTailTopPercentile)

  return {
    giniCoefficient: calculateGiniFromUtils(popularity.map(p => p.totalExposures)),
    exposureGini: calculateExposureGini(exposures),
    likeGini: calculateLikeGini(exposures),
    longTailExposureRate: calculateLongTailExposureRate(exposures, popularity, longTailTopPercentile),
    longTailClickRate: calculateLongTailClickRate(exposures, popularity, longTailTopPercentile),
    clusterCoverage: calculateClusterCoverage(exposures, totalClusters),
    clusterEntropy: calculateClusterEntropy(exposures),
    averagePositionBias: calculatePositionBias(exposures),
    userDiversityScore: calculateUserDiversityScore(exposures),
    freshItemExposureRate: calculateFreshItemExposureRate(exposures, popularity, freshDays),
    details: {
      totalExposures: exposures.length,
      uniqueItems: new Set(exposures.map(e => e.itemId)).size,
      uniqueUsers: new Set(exposures.map(e => e.userId)).size,
      uniqueClusters: new Set(exposures.map(e => e.clusterId)).size,
      longTailThreshold: threshold,
      freshThresholdDays: freshDays
    }
  }
}

/**
 * A/B テスト比較
 *
 * @param controlExposures - コントロール群の露出
 * @param treatmentExposures - 実験群の露出
 * @param popularity - アイテム人気度
 * @param totalClusters - 全クラスタ数
 * @returns 比較結果
 */
export function compareABTest(
  controlExposures: ExposureLog[],
  treatmentExposures: ExposureLog[],
  popularity: ItemPopularity[],
  totalClusters: number
): {
  control: EvaluationResult
  treatment: EvaluationResult
  improvement: Record<string, number>
} {
  const control = evaluateOffline(controlExposures, popularity, totalClusters)
  const treatment = evaluateOffline(treatmentExposures, popularity, totalClusters)

  // 改善率を計算 (正の値 = treatment が良い)
  const improvement: Record<string, number> = {}

  // 低いほうが良い指標
  const lowerIsBetter = ['giniCoefficient', 'exposureGini', 'likeGini', 'averagePositionBias']

  for (const key of Object.keys(control) as (keyof EvaluationResult)[]) {
    if (key === 'details') continue

    const controlVal = control[key] as number
    const treatmentVal = treatment[key] as number

    if (controlVal === 0) {
      if (treatmentVal === 0) {
        improvement[key] = 0
      } else if (lowerIsBetter.includes(key)) {
        improvement[key] = -Infinity
      } else {
        improvement[key] = Infinity
      }
    } else if (lowerIsBetter.includes(key)) {
      improvement[key] = (controlVal - treatmentVal) / controlVal
    } else {
      improvement[key] = (treatmentVal - controlVal) / controlVal
    }
  }

  return { control, treatment, improvement }
}

/**
 * 評価サマリーを生成
 *
 * @param result - 評価結果
 * @returns 人間が読めるサマリー
 */
export function generateEvaluationSummary(result: EvaluationResult): string {
  const lines: string[] = [
    '=== アルゴリズム評価サマリー ===',
    '',
    '【集中度】',
    `  Gini係数: ${(result.giniCoefficient * 100).toFixed(1)}% (低いほど平等)`,
    `  露出Gini: ${(result.exposureGini * 100).toFixed(1)}%`,
    `  いいねGini: ${(result.likeGini * 100).toFixed(1)}%`,
    '',
    '【多様性】',
    `  クラスタカバレッジ: ${(result.clusterCoverage * 100).toFixed(1)}%`,
    `  クラスタエントロピー: ${(result.clusterEntropy * 100).toFixed(1)}%`,
    `  ユーザー平均多様性: ${(result.userDiversityScore * 100).toFixed(1)}%`,
    '',
    '【ロングテール】',
    `  ロングテール露出率: ${(result.longTailExposureRate * 100).toFixed(1)}%`,
    `  ロングテールクリック率: ${(result.longTailClickRate * 100).toFixed(1)}%`,
    '',
    '【その他】',
    `  新規アイテム露出率: ${(result.freshItemExposureRate * 100).toFixed(1)}%`,
    `  平均クリック位置: ${result.averagePositionBias.toFixed(2)}`,
    '',
    '【詳細】',
    `  総露出数: ${result.details.totalExposures.toLocaleString()}`,
    `  ユニークアイテム: ${result.details.uniqueItems.toLocaleString()}`,
    `  ユニークユーザー: ${result.details.uniqueUsers.toLocaleString()}`,
    `  ユニーククラスタ: ${result.details.uniqueClusters}`
  ]

  return lines.join('\n')
}
