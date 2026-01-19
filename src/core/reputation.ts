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
  // Minority discovery bonus: rewarded when user discovers new value early
  | 'early_discovery'        // Liked content before it became popular
  | 'cross_cluster_discovery'  // Discovered value outside user's typical clusters

export interface CRWeights {
  noteAdopted: number
  noteReferenced: number
  collectionAdopted: number
  bridgeSuccess: number
  stakeSuccess: number
  stakeFailure: number
  spamFlag: number
  qualityContribution: number
  // Minority discovery weights
  earlyDiscovery: number         // Bonus for early adoption of later-popular content
  crossClusterDiscovery: number  // Bonus for finding value in unfamiliar clusters
}

export const DEFAULT_CR_WEIGHTS: CRWeights = {
  noteAdopted: 0.15,
  noteReferenced: 0.10,
  collectionAdopted: 0.12,
  bridgeSuccess: 0.25,
  stakeSuccess: 0.20,
  stakeFailure: -0.15,
  spamFlag: -0.30,
  qualityContribution: 0.08,
  // Discovery bonuses reward users who find new cultural value
  earlyDiscovery: 0.30,          // High reward for prescient taste
  crossClusterDiscovery: 0.20    // Reward for expanding cultural horizons
}

export interface CRFullConfig {
  baseCR: number
  minCR?: number        // Optional: if undefined, no lower limit
  maxCR?: number        // Optional: if undefined, no upper limit
  decayHalfLifeDays: number
  learningRate: number  // How fast CR changes (default 0.1)
  weights: CRWeights
}

export const DEFAULT_CR_CONFIG: CRFullConfig = {
  baseCR: 1.0,
  minCR: undefined,     // No lower limit - CR can approach 0
  maxCR: undefined,     // No upper limit - CR can grow unbounded
  decayHalfLifeDays: 90,
  learningRate: 0.1,
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

  const alpha = config.learningRate ?? 0.1
  let newCR = currentCR + alpha * crDelta

  // Apply optional limits (if undefined, no limit)
  if (config.minCR !== undefined) {
    newCR = Math.max(config.minCR, newCR)
  }
  if (config.maxCR !== undefined) {
    newCR = Math.min(config.maxCR, newCR)
  }

  // Ensure CR is always positive (can approach but not go below 0)
  return Math.max(0.001, newCR)
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
    // Minority discovery bonuses
    case 'early_discovery': return weights.earlyDiscovery
    case 'cross_cluster_discovery': return weights.crossClusterDiscovery
    default: return 0
  }
}

/**
 * Discovery bonus configuration
 */
export interface DiscoveryBonusConfig {
  /** Popularity threshold for early discovery (default: 0.2) */
  earlyDiscoveryThreshold?: number;
  /** Bonus multiplier for early + cross-cluster (default: 2.0) */
  earlyAndCrossClusterBonus?: number;
  /** Bonus multiplier for early discovery only (default: 1.5) */
  earlyOnlyBonus?: number;
  /** Bonus multiplier for cross-cluster only (default: 1.3) */
  crossClusterOnlyBonus?: number;
}

/**
 * Calculate discovery bonus for likes outside user's typical clusters
 *
 * When a user engages with content from unfamiliar clusters, they may be
 * discovering new cultural value. This function calculates a bonus multiplier
 * for such "exploration" actions.
 *
 * @param userTypicalClusters - Cluster IDs the user typically engages with
 * @param contentClusterId - Cluster of the content being engaged with
 * @param contentPopularity - Normalized popularity score (0-1) at time of engagement
 * @param config - Optional configuration for thresholds and bonus multipliers
 * @returns Discovery bonus multiplier (1.0 = no bonus, higher = more bonus)
 */
export function calculateDiscoveryBonus(
  userTypicalClusters: string[],
  contentClusterId: string,
  contentPopularity: number = 0.5,
  config?: DiscoveryBonusConfig
): { isDiscovery: boolean; bonusMultiplier: number; type: 'early' | 'cross_cluster' | 'none' } {
  const threshold = config?.earlyDiscoveryThreshold ?? 0.2;
  const earlyAndCrossBonus = config?.earlyAndCrossClusterBonus ?? 2.0;
  const earlyOnlyBonus = config?.earlyOnlyBonus ?? 1.5;
  const crossClusterOnlyBonus = config?.crossClusterOnlyBonus ?? 1.3;

  const isCrossCluster = !userTypicalClusters.includes(contentClusterId);
  const isEarlyDiscovery = contentPopularity < threshold;

  if (isCrossCluster && isEarlyDiscovery) {
    // Best case: found unpopular content in unfamiliar cluster
    return { isDiscovery: true, bonusMultiplier: earlyAndCrossBonus, type: 'early' };
  } else if (isEarlyDiscovery) {
    // Early discovery within familiar clusters
    return { isDiscovery: true, bonusMultiplier: earlyOnlyBonus, type: 'early' };
  } else if (isCrossCluster) {
    // Cross-cluster exploration (content already somewhat popular)
    return { isDiscovery: true, bonusMultiplier: crossClusterOnlyBonus, type: 'cross_cluster' };
  }

  return { isDiscovery: false, bonusMultiplier: 1.0, type: 'none' };
}

/**
 * Get CR multiplier for voting power.
 *
 * In the new design:
 * - Raw CR is used when cluster normalization is not applied
 * - When cluster normalization is applied, use getNormalizedCR() instead
 * - No artificial limits (0.1-10.0 removed)
 *
 * @param cr - The curator's reputation score
 * @param config - Optional config (deprecated, kept for compatibility)
 * @returns The CR value directly (no transformation)
 */
export function getCRMultiplier(cr: number, config?: CRConfig): number {
  // Simply return the CR value - limits are now optional and handled elsewhere
  // Ensure positive value
  return Math.max(0.001, cr)
}

export function getCRLevel(cr: number): 'explorer' | 'finder' | 'curator' | 'archiver' {
  if (cr < CR_LEVEL_THRESHOLDS.explorerMax) return 'explorer'
  if (cr < CR_LEVEL_THRESHOLDS.finderMax) return 'finder'
  if (cr < CR_LEVEL_THRESHOLDS.curatorMax) return 'curator'
  return 'archiver'
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
 * Formula (unbounded design):
 * - CRm = getCRMultiplier(curatorReputation) - direct CR value, no limits
 * - CPm = 1.0 + 0.2 × log10(1 + cpEarned90d/50) - no upper limit
 * - viewWeight = CRm × CPm - no artificial caps
 *
 * Note: In the new zero-sum design, raw viewWeight is unbounded. Cluster
 * normalization at the application level ensures total speaking power is constant.
 *
 * @param curatorReputation - The curator's reputation score (CR)
 * @param cpEarned90d - Culture Points earned in the last 90 days
 * @param config - Optional CR configuration for getCRMultiplier
 * @returns View weight (unbounded positive value)
 */
export function calculateViewWeight(
  curatorReputation: number,
  cpEarned90d: number,
  config?: CRConfig
): number {
  // Get CR multiplier (unbounded - direct CR value)
  const crMultiplier = getCRMultiplier(curatorReputation, config)

  // Calculate CP multiplier (unbounded)
  // CPm = 1.0 + 0.2 × log10(1 + cpEarned90d/50)
  // Guard: ensure cpBase is positive to avoid Math.log10(<=0) -> NaN/-Infinity
  const cpBase = Math.max(0.001, 1.0 + cpEarned90d / 50)
  const cpLog = Math.log10(cpBase)
  // Guard: ensure cpLog is finite
  const safeCpLog = Number.isFinite(cpLog) ? cpLog : 0
  // No upper limit on CPm - higher CP = higher multiplier
  const cpMultiplier = Math.max(1.0, 1.0 + 0.2 * safeCpLog)

  // Calculate final view weight (unbounded - cluster normalization handles zero-sum)
  const viewWeight = crMultiplier * cpMultiplier
  // Only ensure positive value (no upper limit)
  return Math.max(0.001, viewWeight)
}