import type { LikeWeight, LikeWeightInput } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { getCRMultiplier } from './reputation'

/**
 * Like decay weight.
 * w(n) = 1 / (1 + alpha * (n - 1))
 */
export function calculateLikeWeight(input: LikeWeightInput): LikeWeight {
  const n = Math.max(1, input.likeWindowCount)
  const alpha = input.alpha ?? DEFAULT_PARAMS.likeDecayAlpha
  const baseWeight = 1 / (1 + alpha * (n - 1))

  const recentLikeCount30s = input.recentLikeCount30s ?? 0
  const rapidThreshold = input.rapidPenaltyThreshold ?? DEFAULT_PARAMS.rapidPenaltyThreshold
  const rapidPenaltyMultiplier =
    input.rapidPenaltyMultiplier ?? DEFAULT_PARAMS.rapidPenaltyMultiplier

  const isRapid = recentLikeCount30s >= rapidThreshold
  const rapidPenaltyApplied = isRapid && rapidPenaltyMultiplier < 1
  const finalWeight = isRapid ? baseWeight * rapidPenaltyMultiplier : baseWeight
  const supportPowerPercent = Math.round(finalWeight * 100)

  return {
    weight: finalWeight,
    supportPowerPercent,
    isRapid,
    rapidPenaltyApplied
  }
}

/**
 * Predict the next like weight (for UI hints).
 */
export function predictNextLikeWeight(
  currentLikeCount: number,
  alpha: number = DEFAULT_PARAMS.likeDecayAlpha
): LikeWeight {
  return calculateLikeWeight({
    likeWindowCount: currentLikeCount + 1,
    alpha
  })
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
    const crMultiplier = getCRMultiplier(like.curatorReputation)
    return sum + like.weight * crMultiplier * timeDecay
  }, 0)
}
