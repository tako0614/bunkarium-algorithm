import type { LikeWeight } from '../types'

/**
 * Like decay weight.
 * w(n) = 1 / (1 + alpha * (n - 1))
 */
export function calculateLikeWeight(
  likeCount: number,
  alpha: number = 0.05
): LikeWeight {
  const n = Math.max(1, likeCount)
  const weight = 1 / (1 + alpha * (n - 1))
  const supportPowerPercent = Math.round(weight * 100)

  return {
    weight,
    supportPowerPercent
  }
}

/**
 * Like decay with rapid-activity penalty.
 */
export function calculateLikeWeightWithRapidPenalty(
  likeCount: number,
  recentLikeCount: number,
  alpha: number = 0.05,
  rapidThreshold: number = 50,
  rapidPenaltyMultiplier: number = 0.1
): LikeWeight & { isRapid: boolean } {
  const baseWeight = calculateLikeWeight(likeCount, alpha)
  const isRapid = recentLikeCount >= rapidThreshold

  if (isRapid) {
    const penalizedWeight = baseWeight.weight * rapidPenaltyMultiplier
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
 * Predict the next like weight (for UI hints).
 */
export function predictNextLikeWeight(
  currentLikeCount: number,
  alpha: number = 0.05
): LikeWeight {
  return calculateLikeWeight(currentLikeCount + 1, alpha)
}

/**
 * Weighted like signal with time decay.
 */
export function calculateWeightedLikeSignal(
  likes: Array<{ weight: number; curatorReputation: number; ageHours: number }>,
  timeDecayHalfLifeHours: number = 168
): number {
  return likes.reduce((sum, like) => {
    const timeDecay = Math.pow(0.5, like.ageHours / timeDecayHalfLifeHours)
    return sum + like.weight * like.curatorReputation * timeDecay
  }, 0)
}