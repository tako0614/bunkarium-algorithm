import type { LikeWeight } from '../types'

/**
 * いいね逓減重み計算 w(u)
 *
 * 推奨逓減関数: w(u) = 1 / (1 + α * (n(u) - 1))
 *
 * - 1回目のいいね: weight = 1.0
 * - 回数が増えると滑らかに低下
 * - 「押せない」にはならない（常に正の重み）
 *
 * @param likeCount - 時間窓内のいいね回数 n(u)
 * @param alpha - 逓減係数（デフォルト: 0.05）
 * @returns いいね重みと支持力メーター
 */
export function calculateLikeWeight(
  likeCount: number,
  alpha: number = 0.05
): LikeWeight {
  // 最低1回として扱う
  const n = Math.max(1, likeCount)

  // w(u) = 1 / (1 + α * (n - 1))
  const weight = 1 / (1 + alpha * (n - 1))

  // 支持力メーター（0〜100%）
  const supportPowerPercent = Math.round(weight * 100)

  return {
    weight,
    supportPowerPercent
  }
}

/**
 * 連打ペナルティ付きの重み計算
 *
 * 一定速度を超える連打（例: 30秒で50回）の場合、
 * 追加の急減ペナルティ（×0.1）を適用
 *
 * @param likeCount - 時間窓内のいいね回数
 * @param recentLikeCount - 直近30秒のいいね回数
 * @param alpha - 逓減係数
 * @param rapidThreshold - 連打判定閾値（デフォルト: 50）
 * @returns いいね重みと支持力メーター
 */
export function calculateLikeWeightWithRapidPenalty(
  likeCount: number,
  recentLikeCount: number,
  alpha: number = 0.05,
  rapidThreshold: number = 50
): LikeWeight & { isRapid: boolean } {
  const baseWeight = calculateLikeWeight(likeCount, alpha)

  // 連打検出
  const isRapid = recentLikeCount >= rapidThreshold

  if (isRapid) {
    // 急減ペナルティ適用（×0.1）
    const penalizedWeight = baseWeight.weight * 0.1
    return {
      weight: penalizedWeight,
      supportPowerPercent: Math.round(penalizedWeight * 100),
      isRapid: true
    }
  }

  return {
    ...baseWeight,
    isRapid: false
  }
}

/**
 * 次のいいねの予想重みを計算（UI表示用）
 *
 * @param currentLikeCount - 現在の時間窓内いいね回数
 * @param alpha - 逓減係数
 * @returns 次のいいねの重み
 */
export function predictNextLikeWeight(
  currentLikeCount: number,
  alpha: number = 0.05
): LikeWeight {
  return calculateLikeWeight(currentLikeCount + 1, alpha)
}

/**
 * 重み付きいいねシグナルを計算
 *
 * @param likes - いいね一覧（各いいねの重みとCR）
 * @param timeDecayFactor - 時間減衰係数（0.0〜1.0）
 * @returns 重み付き合計
 */
export function calculateWeightedLikeSignal(
  likes: Array<{ weight: number; curatorReputation: number; ageHours: number }>,
  timeDecayHalfLifeHours: number = 168 // 7日
): number {
  return likes.reduce((sum, like) => {
    // 時間減衰: exponential decay
    const timeDecay = Math.pow(0.5, like.ageHours / timeDecayHalfLifeHours)
    return sum + like.weight * like.curatorReputation * timeDecay
  }, 0)
}
