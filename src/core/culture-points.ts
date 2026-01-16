// Culture Points (CP) issuance and ledger helpers.

export type CPEventType =
  | 'mint_note_adopted'
  | 'mint_note_referenced'
  | 'mint_collection_adopted'
  | 'mint_collection_referenced'
  | 'mint_bridge_success'
  | 'mint_archive_contribution'
  | 'mint_quality_edit'
  | 'mint_community_reward'
  | 'burn_editorial_application'
  | 'burn_feature_unlock'
  | 'lock_stake_recommendation'
  | 'unlock_stake_success'
  | 'unlock_stake_expired'
  | 'slash_fraud_detected'
  | 'slash_stake_failure'

export interface CPLedgerEntry {
  id: string
  userId: string
  eventType: CPEventType
  amount: number
  timestamp: number
  relatedObjectType?: string
  relatedObjectId?: string
  metadata?: Record<string, unknown>
  diminishingApplied?: boolean
}

export interface CPBalanceSummary {
  userId: string
  available: number
  locked: number
  totalEarned: number
  totalSpent: number
  totalSlashed: number
  calculatedAt: number
}

export interface StakeRecommendation {
  id: string
  userId: string
  targetType: 'work' | 'collection' | 'note' | 'post'
  targetId: string
  stakedAmount: number
  lockDurationDays: number
  startedAt: number
  endsAt: number
  status: 'active' | 'success' | 'failure' | 'expired' | 'cancelled'
  outcomeScore?: number
  outcomeDetails?: StakeOutcome
}

export interface StakeOutcome {
  supportDensityImprovement: number
  breadthIncrease: number
  contextIncrease: number
  crossClusterReactions: number
  totalScore: number
  isSuccess: boolean
}

export interface CPIssuanceConfig {
  baseAmounts: {
    noteAdopted: number
    noteReferenced: number
    collectionAdopted: number
    collectionReferenced: number
    bridgeSuccess: number
    archiveContribution: number
    qualityEdit: number
    communityReward: number
  }
  diminishing: {
    windowHours: number
    rate: number
    minMultiplier: number
  }
  stake: {
    defaultLockDays: number
    minStakeAmount: number
    successBonusRate: number
    failureSlashRate: number
    successThreshold: number
  }
}

export const DEFAULT_CP_CONFIG: CPIssuanceConfig = {
  baseAmounts: {
    noteAdopted: 10,
    noteReferenced: 5,
    collectionAdopted: 15,
    collectionReferenced: 7,
    bridgeSuccess: 20,
    archiveContribution: 8,
    qualityEdit: 5,
    communityReward: 10
  },
  diminishing: {
    windowHours: 24,
    rate: 0.1,
    minMultiplier: 0.2
  },
  stake: {
    defaultLockDays: 14,
    minStakeAmount: 50,
    successBonusRate: 0.2,
    failureSlashRate: 0.3,
    successThreshold: 0.5
  }
}

export function calculateDiminishingMultiplier(
  recentEventCount: number,
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): number {
  const { rate, minMultiplier } = config.diminishing
  const safeCount = Math.max(1, recentEventCount)
  const multiplier = 1 / (1 + rate * (safeCount - 1))
  return Math.max(minMultiplier, multiplier)
}

export function calculateCPIssuance(
  eventType: CPEventType,
  recentEventCount: number,
  crMultiplier: number = 1.0,
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): {
  amount: number
  baseAmount: number
  diminishingMultiplier: number
  crMultiplier: number
  details: string
} {
  let baseAmount = 0
  switch (eventType) {
    case 'mint_note_adopted':
      baseAmount = config.baseAmounts.noteAdopted
      break
    case 'mint_note_referenced':
      baseAmount = config.baseAmounts.noteReferenced
      break
    case 'mint_collection_adopted':
      baseAmount = config.baseAmounts.collectionAdopted
      break
    case 'mint_collection_referenced':
      baseAmount = config.baseAmounts.collectionReferenced
      break
    case 'mint_bridge_success':
      baseAmount = config.baseAmounts.bridgeSuccess
      break
    case 'mint_archive_contribution':
      baseAmount = config.baseAmounts.archiveContribution
      break
    case 'mint_quality_edit':
      baseAmount = config.baseAmounts.qualityEdit
      break
    case 'mint_community_reward':
      baseAmount = config.baseAmounts.communityReward
      break
    default:
      baseAmount = 0
  }

  const diminishingMultiplier = calculateDiminishingMultiplier(recentEventCount, config)
  const safeCrMultiplier = Math.max(0.9, Math.min(1.1, crMultiplier))
  const amount = Math.round(baseAmount * diminishingMultiplier * safeCrMultiplier)

  return {
    amount,
    baseAmount,
    diminishingMultiplier,
    crMultiplier: safeCrMultiplier,
    details: `Base: ${baseAmount}, Diminishing: ${(diminishingMultiplier * 100).toFixed(1)}%, CR: ${(safeCrMultiplier * 100).toFixed(1)}%`
  }
}

export function calculateCPBalance(
  entries: CPLedgerEntry[],
  userId: string
): CPBalanceSummary {
  const userEntries = entries.filter(e => e.userId === userId)

  let available = 0
  let locked = 0
  let totalEarned = 0
  let totalSpent = 0
  let totalSlashed = 0

  for (const entry of userEntries) {
    if (entry.eventType.startsWith('mint_')) {
      totalEarned += entry.amount
      available += entry.amount
    } else if (entry.eventType.startsWith('burn_')) {
      totalSpent += Math.abs(entry.amount)
      available += entry.amount
    } else if (entry.eventType.startsWith('lock_')) {
      locked += Math.abs(entry.amount)
      available += entry.amount
    } else if (entry.eventType.startsWith('unlock_')) {
      locked -= entry.amount
      available += entry.amount
    } else if (entry.eventType.startsWith('slash_')) {
      totalSlashed += Math.abs(entry.amount)
      if (entry.metadata?.fromLocked) {
        locked += entry.amount
      } else {
        available += entry.amount
      }
    }
  }

  return {
    userId,
    available: Math.max(0, available),
    locked: Math.max(0, locked),
    totalEarned,
    totalSpent,
    totalSlashed,
    calculatedAt: Date.now()
  }
}

export function countRecentEvents(
  entries: CPLedgerEntry[],
  userId: string,
  eventType: string,
  windowHours: number = 24
): number {
  const windowMs = windowHours * 60 * 60 * 1000
  const cutoff = Date.now() - windowMs

  return entries.filter(e =>
    e.userId === userId &&
    e.eventType.includes(eventType) &&
    e.timestamp >= cutoff
  ).length
}

export function createMintEntry(
  userId: string,
  eventType: CPEventType,
  existingEntries: CPLedgerEntry[],
  crMultiplier: number = 1.0,
  relatedObject?: { type: string; id: string },
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): CPLedgerEntry {
  const recentCount = countRecentEvents(
    existingEntries,
    userId,
    eventType,
    config.diminishing.windowHours
  ) + 1

  const issuance = calculateCPIssuance(eventType, recentCount, crMultiplier, config)

  return {
    id: `cp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    eventType,
    amount: issuance.amount,
    timestamp: Date.now(),
    relatedObjectType: relatedObject?.type,
    relatedObjectId: relatedObject?.id,
    metadata: {
      baseAmount: issuance.baseAmount,
      diminishingMultiplier: issuance.diminishingMultiplier,
      crMultiplier: issuance.crMultiplier,
      recentEventCount: recentCount
    },
    diminishingApplied: issuance.diminishingMultiplier < 1.0
  }
}

export function createStakeRecommendation(
  userId: string,
  targetType: StakeRecommendation['targetType'],
  targetId: string,
  amount: number,
  balance: CPBalanceSummary,
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): { stake: StakeRecommendation; lockEntry: CPLedgerEntry } | { error: string } {
  if (amount < config.stake.minStakeAmount) {
    return { error: `Minimum stake is ${config.stake.minStakeAmount} CP.` }
  }

  if (balance.available < amount) {
    return { error: `Insufficient CP balance. Required ${amount}, available ${balance.available}.` }
  }

  const now = Date.now()
  const stakeId = `stake_${now}_${Math.random().toString(36).substr(2, 9)}`

  const stake: StakeRecommendation = {
    id: stakeId,
    userId,
    targetType,
    targetId,
    stakedAmount: amount,
    lockDurationDays: config.stake.defaultLockDays,
    startedAt: now,
    endsAt: now + config.stake.defaultLockDays * 24 * 60 * 60 * 1000,
    status: 'active'
  }

  const lockEntry: CPLedgerEntry = {
    id: `cp_lock_${now}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    eventType: 'lock_stake_recommendation',
    amount: -amount,
    timestamp: now,
    relatedObjectType: 'stake',
    relatedObjectId: stakeId,
    metadata: {
      targetType,
      targetId,
      lockDurationDays: config.stake.defaultLockDays
    }
  }

  return { stake, lockEntry }
}

export function evaluateStakeOutcome(
  stake: StakeRecommendation,
  metrics: {
    supportDensityBefore: number
    supportDensityAfter: number
    breadthBefore: number
    breadthAfter: number
    contextCountBefore: number
    contextCountAfter: number
    crossClusterReactionsBefore: number
    crossClusterReactionsAfter: number
  },
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): StakeOutcome {
  const supportDensityImprovement = metrics.supportDensityBefore > 0
    ? (metrics.supportDensityAfter - metrics.supportDensityBefore) / metrics.supportDensityBefore
    : metrics.supportDensityAfter > 0 ? 1 : 0

  const breadthIncrease = metrics.breadthAfter - metrics.breadthBefore
  const contextIncrease = metrics.contextCountAfter - metrics.contextCountBefore
  const crossClusterReactions = metrics.crossClusterReactionsAfter - metrics.crossClusterReactionsBefore

  const scores = [
    Math.min(1, Math.max(0, supportDensityImprovement)),
    Math.min(1, Math.max(0, breadthIncrease / 3)),
    Math.min(1, Math.max(0, contextIncrease / 5)),
    Math.min(1, Math.max(0, crossClusterReactions / 10))
  ]

  const totalScore = scores.reduce((a, b) => a + b, 0) / scores.length

  return {
    supportDensityImprovement,
    breadthIncrease,
    contextIncrease,
    crossClusterReactions,
    totalScore,
    isSuccess: totalScore >= config.stake.successThreshold
  }
}

export function resolveStake(
  stake: StakeRecommendation,
  outcome: StakeOutcome,
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): {
  updatedStake: StakeRecommendation
  entries: CPLedgerEntry[]
} {
  const now = Date.now()
  const entries: CPLedgerEntry[] = []

  let updatedStatus: StakeRecommendation['status']
  let returnAmount: number

  if (outcome.isSuccess) {
    updatedStatus = 'success'
    const bonus = Math.round(stake.stakedAmount * config.stake.successBonusRate)
    returnAmount = stake.stakedAmount + bonus

    if (bonus > 0) {
      entries.push({
        id: `cp_bonus_${now}_${Math.random().toString(36).substr(2, 9)}`,
        userId: stake.userId,
        eventType: 'mint_community_reward',
        amount: bonus,
        timestamp: now,
        relatedObjectType: 'stake',
        relatedObjectId: stake.id,
        metadata: {
          reason: 'stake_success_bonus',
          outcomeScore: outcome.totalScore
        }
      })
    }

    entries.push({
      id: `cp_unlock_${now}_${Math.random().toString(36).substr(2, 9)}`,
      userId: stake.userId,
      eventType: 'unlock_stake_success',
      amount: stake.stakedAmount,
      timestamp: now,
      relatedObjectType: 'stake',
      relatedObjectId: stake.id,
      metadata: {
        outcomeScore: outcome.totalScore
      }
    })
  } else {
    updatedStatus = 'failure'
    const slashAmount = Math.round(stake.stakedAmount * config.stake.failureSlashRate)
    returnAmount = stake.stakedAmount - slashAmount

    if (slashAmount > 0) {
      entries.push({
        id: `cp_slash_${now}_${Math.random().toString(36).substr(2, 9)}`,
        userId: stake.userId,
        eventType: 'slash_stake_failure',
        amount: -slashAmount,
        timestamp: now,
        relatedObjectType: 'stake',
        relatedObjectId: stake.id,
        metadata: {
          fromLocked: true,
          outcomeScore: outcome.totalScore
        }
      })
    }

    if (returnAmount > 0) {
      entries.push({
        id: `cp_unlock_${now}_${Math.random().toString(36).substr(2, 9)}`,
        userId: stake.userId,
        eventType: 'unlock_stake_expired',
        amount: returnAmount,
        timestamp: now,
        relatedObjectType: 'stake',
        relatedObjectId: stake.id,
        metadata: {
          originalAmount: stake.stakedAmount,
          slashedAmount: slashAmount
        }
      })
    }
  }

  const updatedStake: StakeRecommendation = {
    ...stake,
    status: updatedStatus,
    outcomeScore: outcome.totalScore,
    outcomeDetails: outcome
  }

  return { updatedStake, entries }
}

export interface FraudDetectionResult {
  isFraudulent: boolean
  confidence: number
  reasons: string[]
  recommendedAction: 'none' | 'warning' | 'partial_slash' | 'full_slash' | 'ban'
}

export function detectCPFraud(
  entries: CPLedgerEntry[],
  userId: string,
  windowDays: number = 7
): FraudDetectionResult {
  const windowMs = windowDays * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - windowMs

  const userEntries = entries.filter(e =>
    e.userId === userId &&
    e.timestamp >= cutoff &&
    e.eventType.startsWith('mint_')
  )

  const reasons: string[] = []
  let fraudScore = 0

  const eventsPerDay = userEntries.length / windowDays
  if (eventsPerDay > 50) {
    reasons.push(`High event frequency: ${eventsPerDay.toFixed(1)}/day`)
    fraudScore += 0.3
  }

  const diminishedEntries = userEntries.filter(e => e.diminishingApplied)
  const diminishedRate = userEntries.length > 0
    ? diminishedEntries.length / userEntries.length
    : 0
  if (diminishedRate > 0.8) {
    reasons.push(`Frequent diminishing: ${(diminishedRate * 100).toFixed(1)}%`)
    fraudScore += 0.2
  }

  const objectCounts: Record<string, number> = {}
  for (const entry of userEntries) {
    if (entry.relatedObjectId) {
      const key = `${entry.relatedObjectType}_${entry.relatedObjectId}`
      objectCounts[key] = (objectCounts[key] || 0) + 1
    }
  }
  const maxObjectCount = Math.max(0, ...Object.values(objectCounts))
  if (maxObjectCount > 10) {
    reasons.push(`Repeated object minting: ${maxObjectCount} times`)
    fraudScore += 0.3
  }

  const nightEvents = userEntries.filter(e => {
    const hour = new Date(e.timestamp).getHours()
    return hour >= 2 && hour <= 5
  })
  const nightRate = userEntries.length > 0
    ? nightEvents.length / userEntries.length
    : 0
  if (nightRate > 0.5 && nightEvents.length > 10) {
    reasons.push(`Suspicious night activity: ${(nightRate * 100).toFixed(1)}%`)
    fraudScore += 0.2
  }

  const isFraudulent = fraudScore >= 0.5
  let recommendedAction: FraudDetectionResult['recommendedAction'] = 'none'

  if (fraudScore >= 0.8) {
    recommendedAction = 'ban'
  } else if (fraudScore >= 0.6) {
    recommendedAction = 'full_slash'
  } else if (fraudScore >= 0.4) {
    recommendedAction = 'partial_slash'
  } else if (fraudScore >= 0.2) {
    recommendedAction = 'warning'
  }

  return {
    isFraudulent,
    confidence: Math.min(1, fraudScore),
    reasons,
    recommendedAction
  }
}

export function generateCPSummary(
  entries: CPLedgerEntry[],
  userId: string
): string {
  const balance = calculateCPBalance(entries, userId)
  const userEntries = entries.filter(e => e.userId === userId)

  const eventCounts: Record<string, number> = {}
  const eventAmounts: Record<string, number> = {}

  for (const entry of userEntries) {
    eventCounts[entry.eventType] = (eventCounts[entry.eventType] || 0) + 1
    eventAmounts[entry.eventType] = (eventAmounts[entry.eventType] || 0) + entry.amount
  }

  const lines: string[] = [
    '=== Culture Points Summary ===',
    '',
    `User: ${userId}`,
    '',
    '[Balances]',
    `  Available: ${balance.available} CP`,
    `  Locked: ${balance.locked} CP`,
    `  Total Earned: ${balance.totalEarned} CP`,
    `  Total Spent: ${balance.totalSpent} CP`,
    `  Total Slashed: ${balance.totalSlashed} CP`,
    '',
    '[Event History]'
  ]

  for (const [eventType, count] of Object.entries(eventCounts)) {
    const amount = eventAmounts[eventType]
    lines.push(`  ${eventType}: ${count} (${amount > 0 ? '+' : ''}${amount} CP)`)
  }

  return lines.join('\n')
}

export function calculateCPRanking(
  entries: CPLedgerEntry[],
  topN: number = 100
): Array<{
  userId: string
  balance: CPBalanceSummary
  rank: number
}> {
  const userIds = [...new Set(entries.map(e => e.userId))]

  const rankings = userIds.map(userId => ({
    userId,
    balance: calculateCPBalance(entries, userId),
    rank: 0
  }))

  rankings.sort((a, b) => b.balance.totalEarned - a.balance.totalEarned)

  for (let i = 0; i < rankings.length; i++) {
    rankings[i].rank = i + 1
  }

  return rankings.slice(0, topN)
}