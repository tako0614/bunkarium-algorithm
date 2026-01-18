/**
 * 共通ユーティリティ関数
 *
 * 複数モジュールで使用される計算ロジックを一元化
 */

import { NUMERICAL_DEFAULTS } from './defaults'

// ============================================
// ベクトル演算
// ============================================

/**
 * コサイン類似度を計算（共通実装）
 *
 * @param a - ベクトルA
 * @param b - ベクトルB
 * @returns 類似度 (-1 to 1)、次元不一致や空ベクトルの場合は0
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return 0
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator < NUMERICAL_DEFAULTS.zeroThreshold) {
    return 0
  }

  return dotProduct / denominator
}

/**
 * ユークリッド距離を計算
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) {
    return Infinity
  }

  let sumSquared = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sumSquared += diff * diff
  }

  return Math.sqrt(sumSquared)
}

/**
 * ユークリッド距離を類似度に変換 (0-1)
 * Guard: 負の距離は0として扱う
 */
export function euclideanToSimilarity(distance: number): number {
  // Guard: negative distance treated as 0 (same point)
  const safeDistance = Math.max(0, distance)
  return 1 / (1 + safeDistance)
}

/**
 * L2ノルム（ベクトルの長さ）を計算
 */
export function l2Norm(v: number[]): number {
  if (!v || v.length === 0) return 0
  let sum = 0
  for (const x of v) {
    sum += x * x
  }
  return Math.sqrt(sum)
}

/**
 * ベクトルを正規化（単位ベクトルに変換）
 */
export function normalizeVector(v: number[]): number[] {
  const norm = l2Norm(v)
  if (norm < NUMERICAL_DEFAULTS.zeroThreshold) {
    return v.map(() => 0)
  }
  return v.map(x => x / norm)
}

/**
 * ドット積を計算
 */
export function dotProduct(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) {
    return 0
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

// ============================================
// 行列演算
// ============================================

/**
 * 行列式を計算（LU分解、数値安定性向上版）
 *
 * @param matrix - 正方行列
 * @param regularization - 正則化項（対角成分に加算）
 * @returns 行列式の値
 */
export function determinant(
  matrix: number[][],
  regularization: number = NUMERICAL_DEFAULTS.matrixRegularization
): number {
  const n = matrix.length
  if (n === 0) return 1
  if (n === 1) return matrix[0][0] + regularization
  if (n === 2) {
    const a = matrix[0][0] + regularization
    const d = matrix[1][1] + regularization
    return a * d - matrix[0][1] * matrix[1][0]
  }

  // コピーを作成し、正則化項を対角成分に加算
  const lu = matrix.map((row, i) =>
    row.map((val, j) => i === j ? val + regularization : val)
  )
  let det = 1
  let swapCount = 0

  for (let i = 0; i < n; i++) {
    // 部分ピボット選択（数値安定性のため）
    let maxRow = i
    let maxVal = Math.abs(lu[i][i])
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(lu[k][i]) > maxVal) {
        maxVal = Math.abs(lu[k][i])
        maxRow = k
      }
    }

    // 行交換
    if (maxRow !== i) {
      [lu[i], lu[maxRow]] = [lu[maxRow], lu[i]]
      swapCount++
    }

    // ピボットが小さすぎる場合（特異行列に近い）
    if (Math.abs(lu[i][i]) < NUMERICAL_DEFAULTS.zeroThreshold) {
      return 0
    }

    det *= lu[i][i]

    // 消去
    for (let k = i + 1; k < n; k++) {
      const factor = lu[k][i] / lu[i][i]
      for (let j = i + 1; j < n; j++) {
        lu[k][j] -= factor * lu[i][j]
      }
      lu[k][i] = 0
    }
  }

  // 行交換の符号を反映
  return swapCount % 2 === 0 ? det : -det
}

/**
 * 対称行列の類似度を効率的に計算（上三角のみ計算）
 *
 * @param items - アイテムリスト
 * @param similarityFn - 類似度計算関数
 * @returns 類似度行列
 */
export function computeSymmetricSimilarityMatrix<T>(
  items: T[],
  similarityFn: (a: T, b: T) => number
): number[][] {
  const n = items.length
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0 // 対角成分（自己類似度）

    for (let j = i + 1; j < n; j++) {
      const sim = similarityFn(items[i], items[j])
      matrix[i][j] = sim
      matrix[j][i] = sim // 対称性を利用
    }
  }

  return matrix
}

// ============================================
// 統計関数
// ============================================

/**
 * エントロピーを計算
 *
 * @param distribution - 分布（確率の配列、または値の配列）
 * @param normalize - 最大エントロピーで正規化するか
 * @returns エントロピー値
 */
export function calculateEntropy(distribution: number[], normalize: boolean = false): number {
  const total = distribution.reduce((a, b) => a + b, 0)
  if (total <= 0) return 0

  let entropy = 0
  for (const count of distribution) {
    if (count > 0) {
      const p = count / total
      entropy -= p * Math.log2(p)
    }
  }

  if (normalize && distribution.length > 1) {
    const maxEntropy = Math.log2(distribution.length)
    return maxEntropy > 0 ? entropy / maxEntropy : 0
  }

  return entropy
}

/**
 * Gini係数を計算
 *
 * 0 = 完全平等 (全員同じ)
 * 1 = 完全不平等 (1人に集中)
 *
 * @param values - 値の配列（非負）
 * @returns Gini係数 (0-1)
 */
export function calculateGini(values: number[]): number {
  if (values.length <= 1) return 0

  // 負の値を0に変換
  const nonNegative = values.map(v => Math.max(0, v))
  const sorted = [...nonNegative].sort((a, b) => a - b)
  const n = sorted.length
  const sum = sorted.reduce((a, b) => a + b, 0)

  // Guard: check for zero or very small sum to prevent division issues
  // Using epsilon to avoid floating point underflow problems
  if (sum < 1e-100) return 0

  // Gini計算: G = (2 * Σ(i * x_i) - (n + 1) * Σx_i) / (n * Σx_i)
  let weightedSum = 0
  for (let i = 0; i < n; i++) {
    weightedSum += (i + 1) * sorted[i]
  }

  const result = (2 * weightedSum - (n + 1) * sum) / (n * sum)
  // Guard: ensure result is finite and within valid range [0, 1]
  if (!Number.isFinite(result)) return 0
  return Math.max(0, Math.min(1, result))
}

// ============================================
// 時間関連
// ============================================

/**
 * 指数減衰を計算
 *
 * @param ageMs - 経過時間（ミリ秒）
 * @param halfLifeMs - 半減期（ミリ秒）
 * @returns 減衰係数 (0-1)
 */
export function exponentialDecay(ageMs: number, halfLifeMs: number): number {
  if (halfLifeMs <= 0) return 1
  return Math.pow(0.5, ageMs / halfLifeMs)
}

/**
 * 時間を日数に変換
 */
export function msToDays(ms: number): number {
  return ms / (1000 * 60 * 60 * 24)
}

/**
 * 時間を時間数に変換
 */
export function msToHours(ms: number): number {
  return ms / (1000 * 60 * 60)
}

// ============================================
// バリデーション
// ============================================

/**
 * 値を範囲内にクランプ
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/**
 * 値を0-1の範囲にクランプ
 */
export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

// ============================================
// 数値精度
// ============================================

/**
 * 数値を9桁精度に丸める（algorithm.md仕様: cross-implementation compatibility）
 */
export function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9
}

/**
 * 数値を6桁精度に丸める（公開メトリクス出力用）
 */
export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

/**
 * 値が非負であることを確認
 */
export function ensureNonNegative(value: number, defaultValue: number = 0): number {
  return value >= 0 ? value : defaultValue
}

/**
 * オブジェクトの全プロパティが非負であることを確認
 */
export function validateNonNegativeValues<T extends Record<string, number>>(
  obj: T,
  fieldName: string = 'value'
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'number' && value < 0) {
      throw new Error(`${fieldName}.${key} must be non-negative, got ${value}`)
    }
  }
}

// ============================================
// ID生成
// ============================================

/**
 * ユニークIDを生成
 */
export function generateId(prefix: string = ''): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`
}
