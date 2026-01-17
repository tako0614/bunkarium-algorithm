import type { Candidate, ScoreWeights, ScoreBreakdown, CVSComponents } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { SCORING_DEFAULTS } from './defaults'

const LN2 = Math.log(2)
const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

/** CVS component weights. */
export interface CVSWeights {
  like: number
  context: number
  collection: number
  bridge: number
  sustain: number
}

export const DEFAULT_CVS_WEIGHTS: CVSWeights = {
  like: SCORING_DEFAULTS.cvsComponentWeights.likeSignal,
  context: SCORING_DEFAULTS.cvsComponentWeights.contextSignal,
  collection: SCORING_DEFAULTS.cvsComponentWeights.collectionSignal,
  bridge: SCORING_DEFAULTS.cvsComponentWeights.bridgeSignal,
  sustain: SCORING_DEFAULTS.cvsComponentWeights.sustainSignal
}

/**
 * Cultural Value Score.
 */
export function calculateCVS(
  components: CVSComponents,
  weights: CVSWeights = DEFAULT_CVS_WEIGHTS
): number {
  return (
    weights.like * components.likeSignal +
    weights.context * components.contextSignal +
    weights.collection * components.collectionSignal +
    weights.bridge * components.bridgeSignal +
    weights.sustain * components.sustainSignal
  )
}

/**
 * Diversity/Novelty Score.
 */
export function calculateDNS(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  nowTs: number
): number {
  let score = 0

  const clusterExposureCount = recentClusterExposures[candidate.clusterId] || 0
  const clusterNovelty =
    1 / (1 + clusterExposureCount * SCORING_DEFAULTS.clusterExposurePenaltyFactor)
  score += clusterNovelty * 0.6

  const ageHours = Math.max(0, (nowTs - candidate.createdAt) / (1000 * 60 * 60))
  const timeNovelty = Math.exp(-LN2 * ageHours / SCORING_DEFAULTS.timeDecayHalfLifeHours)
  score += timeNovelty * 0.4

  return score
}

/**
 * Penalties only cover quality flags. Similarity penalties are applied in rerank.
 */
export function calculatePenalty(candidate: Candidate): number {
  let penalty = 0

  if (candidate.features.qualityFlags.spamSuspect) {
    penalty += 0.5
  }

  return clamp01(penalty)
}

/**
 * Mixed score: w_prs * PRS + w_cvs * CVS + w_dns * DNS - penalty.
 */
export function calculateMixedScore(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  nowTs: number,
  weights: ScoreWeights = DEFAULT_PARAMS.weights
): { finalScore: number; breakdown: ScoreBreakdown } {
  const prs = clamp01(candidate.features.prs ?? 0)
  const cvs = clamp01(calculateCVS(candidate.features.cvsComponents))
  const dns = clamp01(calculateDNS(candidate, recentClusterExposures, nowTs))
  const penalty = calculatePenalty(candidate)

  const finalScore =
    weights.prs * prs +
    weights.cvs * cvs +
    weights.dns * dns -
    penalty

  return {
    finalScore,
    breakdown: { prs, cvs, dns, penalty }
  }
}
