import type { Candidate, ScoreWeights, ScoreBreakdown, CVSComponents } from '../types'
import { DEFAULT_PARAMS } from '../types'
import { SCORING_DEFAULTS, LN2 } from './defaults'
import { clamp01, round9 } from './utils'

/** CVS component weights (algorithm.md v1.0 defaults) */
export interface CVSWeights {
  like: number
  context: number
  collection: number
  bridge: number
  sustain: number
}

export const DEFAULT_CVS_WEIGHTS: CVSWeights = {
  like: SCORING_DEFAULTS.cvsComponentWeights.like,
  context: SCORING_DEFAULTS.cvsComponentWeights.context,
  collection: SCORING_DEFAULTS.cvsComponentWeights.collection,
  bridge: SCORING_DEFAULTS.cvsComponentWeights.bridge,
  sustain: SCORING_DEFAULTS.cvsComponentWeights.sustain
}

/**
 * Cultural Value Score (algorithm.md仕様)
 * CVS = a*like + b*context + d*collection + e*bridge + f*sustain
 */
export function calculateCVS(
  components: CVSComponents,
  weights: CVSWeights = DEFAULT_CVS_WEIGHTS
): number {
  const cvs =
    weights.like * components.like +
    weights.context * components.context +
    weights.collection * components.collection +
    weights.bridge * components.bridge +
    weights.sustain * components.sustain
  return clamp01(cvs)
}

/**
 * Diversity/Novelty Score (algorithm.md仕様)
 *
 * clusterNovelty = 1 / (1 + exposureCount * clusterNoveltyFactor)
 * timeNovelty = exp(-ln(2) * ageHours / timeHalfLifeHours)
 * DNS = clamp(0, 1, 0.6 * clusterNovelty + 0.4 * timeNovelty)
 */
export function calculateDNS(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  nowTs: number,
  clusterNoveltyFactor: number = SCORING_DEFAULTS.clusterNoveltyFactor,
  timeHalfLifeHours: number = SCORING_DEFAULTS.timeHalfLifeHours
): number {
  const exposureCount = recentClusterExposures[candidate.clusterId] || 0
  const clusterNovelty = 1 / (1 + exposureCount * clusterNoveltyFactor)

  const ageHours = Math.max(0, (nowTs - candidate.createdAt) / (1000 * 60 * 60))
  // Guard: prevent division by zero when timeHalfLifeHours is 0 or negative
  const safeHalfLife = Math.max(1e-6, timeHalfLifeHours)
  const timeNovelty = Math.exp(-LN2 * ageHours / safeHalfLife)

  const dns = SCORING_DEFAULTS.dnsClusterNoveltyWeight * clusterNovelty +
              SCORING_DEFAULTS.dnsTimeNoveltyWeight * timeNovelty
  return clamp01(dns)
}

/**
 * Penalties only cover quality flags. Similarity penalties are applied in rerank.
 */
export function calculatePenalty(candidate: Candidate): number {
  let penalty = 0

  if (candidate.qualityFlags.spamSuspect) {
    penalty += 0.5
  }

  return clamp01(penalty)
}

/**
 * Mixed score: w_prs * PRS + w_cvs * CVS + w_dns * DNS - penalty
 * algorithm.md仕様: finalScoreを9桁精度に丸める
 */
export function calculateMixedScore(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  nowTs: number,
  weights: ScoreWeights = DEFAULT_PARAMS.weights,
  clusterNoveltyFactor?: number,
  timeHalfLifeHours?: number
): { finalScore: number; breakdown: ScoreBreakdown } {
  const prs = clamp01(candidate.features.prs ?? 0)
  const cvs = clamp01(calculateCVS(candidate.features.cvsComponents))
  const dns = clamp01(calculateDNS(candidate, recentClusterExposures, nowTs, clusterNoveltyFactor, timeHalfLifeHours))
  const penalty = calculatePenalty(candidate)

  const rawFinalScore =
    weights.prs * prs +
    weights.cvs * cvs +
    weights.dns * dns -
    penalty

  // finalScoreを9桁精度に丸める（algorithm.md仕様: cross-implementation determinism）
  const finalScore = round9(rawFinalScore)

  return {
    finalScore,
    breakdown: { prs, cvs, dns, penalty, finalScore }
  }
}
