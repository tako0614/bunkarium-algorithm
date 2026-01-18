// Curator Reputation (CR) helpers.

import type { CRConfig } from '../types'
import { CR_LEVEL_THRESHOLDS } from './defaults'

export interface CREvent {
  type: CREventType
  timestamp: number
  metadata: Record<string, unknown>
}

export type CREventType =
  | 'note_adopted'
  | 'note_referenced'
  | 'collection_adopted'
  | 'bridge_success'
  | 'stake_success'
  | 'stake_failure'
  | 'spam_flag'
  | 'quality_contribution'

export interface CRWeights {
  noteAdopted: number
  noteReferenced: number
  collectionAdopted: number
  bridgeSuccess: number
  stakeSuccess: number
  stakeFailure: number
  spamFlag: number
  qualityContribution: number
}

export const DEFAULT_CR_WEIGHTS: CRWeights = {
  noteAdopted: 0.15,
  noteReferenced: 0.10,
  collectionAdopted: 0.12,
  bridgeSuccess: 0.25,
  stakeSuccess: 0.20,
  stakeFailure: -0.15,
  spamFlag: -0.30,
  qualityContribution: 0.08
}

export interface CRFullConfig {
  baseCR: number
  minCR: number
  maxCR: number
  decayHalfLifeDays: number
  weights: CRWeights
}

export const DEFAULT_CR_CONFIG: CRFullConfig = {
  baseCR: 1.0,
  minCR: 0.1,
  maxCR: 10.0,
  decayHalfLifeDays: 90,
  weights: DEFAULT_CR_WEIGHTS
}

export function calculateCR(
  events: CREvent[],
  currentCR: number = 1.0,
  config: CRFullConfig = DEFAULT_CR_CONFIG
): number {
  const now = Date.now()

  let crDelta = 0

  for (const event of events) {
    const ageDays = (now - event.timestamp) / (1000 * 60 * 60 * 24)
    const decay = Math.pow(0.5, ageDays / config.decayHalfLifeDays)
    const weight = getEventWeight(event.type, config.weights)
    crDelta += weight * decay
  }

  const alpha = 0.1
  let newCR = currentCR + alpha * crDelta
  newCR = Math.max(config.minCR, Math.min(config.maxCR, newCR))

  return newCR
}

function getEventWeight(type: CREventType, weights: CRWeights): number {
  switch (type) {
    case 'note_adopted': return weights.noteAdopted
    case 'note_referenced': return weights.noteReferenced
    case 'collection_adopted': return weights.collectionAdopted
    case 'bridge_success': return weights.bridgeSuccess
    case 'stake_success': return weights.stakeSuccess
    case 'stake_failure': return weights.stakeFailure
    case 'spam_flag': return weights.spamFlag
    case 'quality_contribution': return weights.qualityContribution
    default: return 0
  }
}

export function getCRMultiplier(cr: number, config?: CRConfig): number {
  const minCR = config?.minCR ?? 0.1
  const maxCR = config?.maxCR ?? 10.0

  // Guard: if minCR >= maxCR, return middle value
  if (minCR >= maxCR) {
    return 1.25 // Middle of [0.5, 2.0]
  }

  // Clamp CR to valid range
  const crC = Math.max(minCR, Math.min(maxCR, cr))

  // Logarithmic scaling: x = log10(crC/minCR) / log10(maxCR/minCR)
  const denominator = Math.log10(maxCR / minCR)
  // Guard: denominator should be > 0 since maxCR > minCR, but check for safety
  if (denominator <= 0) {
    return 1.25
  }

  const x = Math.log10(crC / minCR) / denominator
  const xClamped = Math.max(0, Math.min(1, x))

  // Map to [0.5, 2.0]: CRm = 0.5 + 1.5*x
  return Math.max(0.5, Math.min(2.0, 0.5 + 1.5 * xClamped))
}

export function getCRLevel(cr: number): 'newcomer' | 'regular' | 'trusted' | 'expert' {
  if (cr < CR_LEVEL_THRESHOLDS.newcomerMax) return 'newcomer'
  if (cr < CR_LEVEL_THRESHOLDS.regularMax) return 'regular'
  if (cr < CR_LEVEL_THRESHOLDS.trustedMax) return 'trusted'
  return 'expert'
}

export function evaluateBridgeSuccess(
  sourceCluster: string,
  reactions: Array<{
    userId: string
    userCluster: string
    type: 'like' | 'save' | 'comment'
    weight: number
  }>
): {
  success: boolean
  crossClusterReach: number
  crossClusterEngagement: number
  details: {
    totalReactions: number
    crossClusterReactions: number
    uniqueClusters: string[]
  }
} {
  const crossClusterReactions = reactions.filter(r => r.userCluster !== sourceCluster)
  const uniqueClusters = [...new Set(crossClusterReactions.map(r => r.userCluster))]

  const crossClusterReach = uniqueClusters.length
  const crossClusterEngagement = crossClusterReactions.reduce((sum, r) => sum + r.weight, 0)

  const success = crossClusterReach >= 2 && crossClusterEngagement >= 1.0

  return {
    success,
    crossClusterReach,
    crossClusterEngagement,
    details: {
      totalReactions: reactions.length,
      crossClusterReactions: crossClusterReactions.length,
      uniqueClusters
    }
  }
}

export function evaluateNoteSettlement(
  references: Array<{
    type: 'direct_reference' | 'indirect_reference' | 'citation'
    timestamp: number
    weight: number
  }>,
  ageDays: number
): {
  settlementScore: number
  isSettled: boolean
  referenceCount: number
  recentActivityRate: number
} {
  const now = Date.now()
  const recentThreshold = 7 * 24 * 60 * 60 * 1000

  let totalWeight = 0
  let recentWeight = 0

  for (const ref of references) {
    const weight = ref.type === 'direct_reference' ? 1.0 :
      ref.type === 'citation' ? 0.8 : 0.5

    totalWeight += weight * ref.weight

    if (now - ref.timestamp < recentThreshold) {
      recentWeight += weight * ref.weight
    }
  }

  const settlementScore = totalWeight / Math.sqrt(Math.max(1, ageDays))
  const recentActivityRate = totalWeight > 0 ? recentWeight / totalWeight : 0
  const isSettled = settlementScore >= 0.5 && references.length >= 3

  return {
    settlementScore,
    isSettled,
    referenceCount: references.length,
    recentActivityRate
  }
}

/**
 * Calculate Cultural View Value (CVV) view weight.
 *
 * The view weight represents the cultural value of attention from a specific viewer,
 * based on their reputation (CR) and recent contribution activity (CP earned).
 *
 * Formula:
 * - CRm = getCRMultiplier(curatorReputation) in [0.5, 2.0]
 * - CPm = clamp(1.0, 1.2, 1.0 + 0.2 × log10(1 + cpEarned90d/50))
 * - viewWeight = clamp(0.2, 2.0, CRm × CPm)
 *
 * @param curatorReputation - The curator's reputation score (CR)
 * @param cpEarned90d - Culture Points earned in the last 90 days
 * @param config - Optional CR configuration for getCRMultiplier
 * @returns View weight in range [0.2, 2.0]
 */
export function calculateViewWeight(
  curatorReputation: number,
  cpEarned90d: number,
  config?: CRConfig
): number {
  // Get CR multiplier in [0.5, 2.0]
  const crMultiplier = getCRMultiplier(curatorReputation, config)

  // Calculate CP multiplier
  // CPm = clamp(1.0, 1.2, 1.0 + 0.2 × log10(1 + cpEarned90d/50))
  // Guard: clamp cpEarned90d to prevent overflow (reasonable range: -10000 to 10000)
  const safeCpEarned = Math.max(-10000, Math.min(10000, cpEarned90d))
  // Guard: ensure cpBase is positive to avoid Math.log10(<=0) -> NaN/-Infinity
  const cpBase = Math.max(0.001, 1.0 + safeCpEarned / 50)
  const cpLog = Math.log10(cpBase)
  // Guard: ensure cpLog is finite
  const safeCpLog = Number.isFinite(cpLog) ? cpLog : 0
  const cpMultiplier = Math.max(1.0, Math.min(1.2, 1.0 + 0.2 * safeCpLog))

  // Calculate final view weight
  // viewWeight = clamp(0.2, 2.0, CRm × CPm)
  const viewWeight = crMultiplier * cpMultiplier
  return Math.max(0.2, Math.min(2.0, viewWeight))
}