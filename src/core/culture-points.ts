/**
 * Culture Points (CP) 発行・管理ロジック
 *
 * CPの特徴:
 * - 非譲渡・非換金
 * - 台帳（レジャー）で管理、残高ではない
 * - 文化貢献イベントで発行
 * - ステーク推薦でロック
 * - 不正時に没収（スラッシュ）可能
 */

// ============================================
// 型定義
// ============================================

/** CPイベントタイプ */
export type CPEventType =
  // 発行 (Mint)
  | 'mint_note_adopted'           // 注釈が採用された
  | 'mint_note_referenced'        // 注釈が参照された
  | 'mint_collection_adopted'     // コレクションが採用された
  | 'mint_collection_referenced'  // コレクションが参照された
  | 'mint_bridge_success'         // ブリッジが成功
  | 'mint_archive_contribution'   // アーカイブ貢献（重複統合、メタ整備）
  | 'mint_quality_edit'           // 質の高い編集
  | 'mint_community_reward'       // コミュニティ報酬
  // 消費 (Burn)
  | 'burn_editorial_application'  // 編集枠への応募
  | 'burn_feature_unlock'         // 機能アンロック
  // ロック (Lock)
  | 'lock_stake_recommendation'   // ステーク推薦でロック
  // アンロック (Unlock)
  | 'unlock_stake_success'        // ステーク成功でアンロック
  | 'unlock_stake_expired'        // ステーク期限切れでアンロック
  // 没収 (Slash)
  | 'slash_fraud_detected'        // 不正検出で没収
  | 'slash_stake_failure'         // ステーク失敗で部分没収

/** CP台帳エントリ */
export interface CPLedgerEntry {
  id: string
  userId: string
  eventType: CPEventType
  amount: number  // 正=発行/アンロック, 負=消費/ロック/没収
  timestamp: number
  /** 関連オブジェクト (noteId, collectionId, stakeIdなど) */
  relatedObjectType?: string
  relatedObjectId?: string
  /** メタデータ */
  metadata?: Record<string, unknown>
  /** 逓減が適用されたか */
  diminishingApplied?: boolean
}

/** CP残高サマリー */
export interface CPBalanceSummary {
  userId: string
  /** 利用可能CP */
  available: number
  /** ロック中CP */
  locked: number
  /** 総獲得CP */
  totalEarned: number
  /** 総消費CP */
  totalSpent: number
  /** 没収されたCP */
  totalSlashed: number
  /** 計算時刻 */
  calculatedAt: number
}

/** ステーク推薦 */
export interface StakeRecommendation {
  id: string
  userId: string
  targetType: 'work' | 'collection' | 'note' | 'post'
  targetId: string
  /** ロックしたCP量 */
  stakedAmount: number
  /** ロック期間 (日) */
  lockDurationDays: number
  /** 開始時刻 */
  startedAt: number
  /** 終了予定時刻 */
  endsAt: number
  /** ステータス */
  status: 'active' | 'success' | 'failure' | 'expired' | 'cancelled'
  /** 成果スコア */
  outcomeScore?: number
  /** 成果詳細 */
  outcomeDetails?: StakeOutcome
}

/** ステーク成果 */
export interface StakeOutcome {
  /** 支持密度の改善率 */
  supportDensityImprovement: number
  /** 広がりの増加 */
  breadthIncrease: number
  /** 注釈/参照の増加 */
  contextIncrease: number
  /** 異クラスタ反応 */
  crossClusterReactions: number
  /** 総合スコア */
  totalScore: number
  /** 成功判定 */
  isSuccess: boolean
}

/** CP発行設定 */
export interface CPIssuanceConfig {
  /** 基本発行量 */
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
  /** 逓減設定 */
  diminishing: {
    /** 時間窓（時間） */
    windowHours: number
    /** 逓減率 (0-1) */
    rate: number
    /** 最小乗数 */
    minMultiplier: number
  }
  /** ステーク設定 */
  stake: {
    /** デフォルトロック期間（日） */
    defaultLockDays: number
    /** 最小ステーク量 */
    minStakeAmount: number
    /** 成功時のボーナス率 */
    successBonusRate: number
    /** 失敗時の没収率 */
    failureSlashRate: number
    /** 成功閾値 */
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

// ============================================
// CP発行計算
// ============================================

/**
 * 逓減乗数を計算
 *
 * 同一ユーザーの短期連投でCP発行が逓減する
 *
 * @param recentEventCount - 時間窓内のイベント数
 * @param config - 設定
 * @returns 乗数 (0-1)
 */
export function calculateDiminishingMultiplier(
  recentEventCount: number,
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): number {
  const { rate, minMultiplier } = config.diminishing

  // w(n) = max(minMultiplier, 1 / (1 + rate * (n - 1)))
  const multiplier = 1 / (1 + rate * (recentEventCount - 1))
  return Math.max(minMultiplier, multiplier)
}

/**
 * CP発行量を計算
 *
 * @param eventType - イベントタイプ
 * @param recentEventCount - 時間窓内の同種イベント数
 * @param crMultiplier - CR乗数
 * @param config - 設定
 * @returns 発行量と詳細
 */
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
  // 基本発行量を取得
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

  // 逓減乗数
  const diminishingMultiplier = calculateDiminishingMultiplier(recentEventCount, config)

  // 最終発行量
  const amount = Math.round(baseAmount * diminishingMultiplier * crMultiplier)

  return {
    amount,
    baseAmount,
    diminishingMultiplier,
    crMultiplier,
    details: `Base: ${baseAmount}, Diminishing: ${(diminishingMultiplier * 100).toFixed(1)}%, CR: ${(crMultiplier * 100).toFixed(1)}%`
  }
}

// ============================================
// 台帳管理
// ============================================

/**
 * 台帳からCP残高を計算
 *
 * @param entries - 台帳エントリ
 * @param userId - ユーザーID
 * @returns 残高サマリー
 */
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
      // 発行
      totalEarned += entry.amount
      available += entry.amount
    } else if (entry.eventType.startsWith('burn_')) {
      // 消費
      totalSpent += Math.abs(entry.amount)
      available += entry.amount // amountは負
    } else if (entry.eventType.startsWith('lock_')) {
      // ロック
      locked += Math.abs(entry.amount)
      available += entry.amount // amountは負
    } else if (entry.eventType.startsWith('unlock_')) {
      // アンロック
      locked -= entry.amount
      available += entry.amount
    } else if (entry.eventType.startsWith('slash_')) {
      // 没収
      totalSlashed += Math.abs(entry.amount)
      // ロック中から没収された場合
      if (entry.metadata?.fromLocked) {
        locked += entry.amount // amountは負
      } else {
        available += entry.amount // amountは負
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

/**
 * 時間窓内のイベント数をカウント
 *
 * @param entries - 台帳エントリ
 * @param userId - ユーザーID
 * @param eventType - イベントタイプ (部分一致)
 * @param windowHours - 時間窓
 * @returns イベント数
 */
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

/**
 * CP発行のための台帳エントリを作成
 *
 * @param userId - ユーザーID
 * @param eventType - イベントタイプ
 * @param existingEntries - 既存の台帳エントリ
 * @param crMultiplier - CR乗数
 * @param relatedObject - 関連オブジェクト
 * @param config - 設定
 * @returns 新しい台帳エントリ
 */
export function createMintEntry(
  userId: string,
  eventType: CPEventType,
  existingEntries: CPLedgerEntry[],
  crMultiplier: number = 1.0,
  relatedObject?: { type: string; id: string },
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): CPLedgerEntry {
  // 直近のイベント数をカウント
  const recentCount = countRecentEvents(
    existingEntries,
    userId,
    eventType,
    config.diminishing.windowHours
  ) + 1 // 今回の分を含める

  // 発行量を計算
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

// ============================================
// ステーク推薦
// ============================================

/**
 * ステーク推薦を作成
 *
 * @param userId - ユーザーID
 * @param targetType - 対象タイプ
 * @param targetId - 対象ID
 * @param amount - ステーク量
 * @param balance - 現在の残高
 * @param config - 設定
 * @returns ステーク推薦 または エラー
 */
export function createStakeRecommendation(
  userId: string,
  targetType: StakeRecommendation['targetType'],
  targetId: string,
  amount: number,
  balance: CPBalanceSummary,
  config: CPIssuanceConfig = DEFAULT_CP_CONFIG
): { stake: StakeRecommendation; lockEntry: CPLedgerEntry } | { error: string } {
  // バリデーション
  if (amount < config.stake.minStakeAmount) {
    return { error: `最小ステーク量は ${config.stake.minStakeAmount} CPです` }
  }

  if (balance.available < amount) {
    return { error: `CP残高が不足しています (必要: ${amount}, 利用可能: ${balance.available})` }
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

/**
 * ステーク成果を評価
 *
 * @param stake - ステーク推薦
 * @param metrics - 成果メトリクス
 * @param config - 設定
 * @returns 成果評価
 */
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
  // 各指標の改善を計算
  const supportDensityImprovement = metrics.supportDensityBefore > 0
    ? (metrics.supportDensityAfter - metrics.supportDensityBefore) / metrics.supportDensityBefore
    : metrics.supportDensityAfter > 0 ? 1 : 0

  const breadthIncrease = metrics.breadthAfter - metrics.breadthBefore

  const contextIncrease = metrics.contextCountAfter - metrics.contextCountBefore

  const crossClusterReactions = metrics.crossClusterReactionsAfter - metrics.crossClusterReactionsBefore

  // 総合スコア (0-1に正規化)
  const scores = [
    Math.min(1, Math.max(0, supportDensityImprovement)),
    Math.min(1, Math.max(0, breadthIncrease / 3)),  // 3クラスタ増で満点
    Math.min(1, Math.max(0, contextIncrease / 5)),  // 5件増で満点
    Math.min(1, Math.max(0, crossClusterReactions / 10))  // 10反応で満点
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

/**
 * ステーク推薦を解決
 *
 * @param stake - ステーク推薦
 * @param outcome - 成果評価
 * @param config - 設定
 * @returns 解決エントリ
 */
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
    // 成功: 元本 + ボーナスを返却
    updatedStatus = 'success'
    const bonus = Math.round(stake.stakedAmount * config.stake.successBonusRate)
    returnAmount = stake.stakedAmount + bonus

    // ボーナス発行
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

    // アンロック
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
    // 失敗: 一部没収
    updatedStatus = 'failure'
    const slashAmount = Math.round(stake.stakedAmount * config.stake.failureSlashRate)
    returnAmount = stake.stakedAmount - slashAmount

    // 没収
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

    // 残りをアンロック
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

// ============================================
// 不正検出
// ============================================

/** 不正検出結果 */
export interface FraudDetectionResult {
  isFraudulent: boolean
  confidence: number
  reasons: string[]
  recommendedAction: 'none' | 'warning' | 'partial_slash' | 'full_slash' | 'ban'
}

/**
 * CP獲得パターンの不正を検出
 *
 * @param entries - 台帳エントリ
 * @param userId - ユーザーID
 * @param windowDays - 分析期間（日）
 * @returns 不正検出結果
 */
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

  // 1. 異常な発行頻度
  const eventsPerDay = userEntries.length / windowDays
  if (eventsPerDay > 50) {
    reasons.push(`異常に高いイベント頻度: ${eventsPerDay.toFixed(1)}/日`)
    fraudScore += 0.3
  }

  // 2. 連続的な逓減適用
  const diminishedEntries = userEntries.filter(e => e.diminishingApplied)
  const diminishedRate = userEntries.length > 0
    ? diminishedEntries.length / userEntries.length
    : 0
  if (diminishedRate > 0.8) {
    reasons.push(`逓減が頻繁に適用: ${(diminishedRate * 100).toFixed(1)}%`)
    fraudScore += 0.2
  }

  // 3. 同一オブジェクトへの繰り返し
  const objectCounts: Record<string, number> = {}
  for (const entry of userEntries) {
    if (entry.relatedObjectId) {
      const key = `${entry.relatedObjectType}_${entry.relatedObjectId}`
      objectCounts[key] = (objectCounts[key] || 0) + 1
    }
  }
  const maxObjectCount = Math.max(0, ...Object.values(objectCounts))
  if (maxObjectCount > 10) {
    reasons.push(`同一オブジェクトへの繰り返し: ${maxObjectCount}回`)
    fraudScore += 0.3
  }

  // 4. 夜間の異常活動
  const nightEvents = userEntries.filter(e => {
    const hour = new Date(e.timestamp).getHours()
    return hour >= 2 && hour <= 5
  })
  const nightRate = userEntries.length > 0
    ? nightEvents.length / userEntries.length
    : 0
  if (nightRate > 0.5 && nightEvents.length > 10) {
    reasons.push(`夜間の異常活動: ${(nightRate * 100).toFixed(1)}%`)
    fraudScore += 0.2
  }

  // 総合判定
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

// ============================================
// ユーティリティ
// ============================================

/**
 * CP台帳のサマリーを生成
 *
 * @param entries - 台帳エントリ
 * @param userId - ユーザーID
 * @returns サマリー文字列
 */
export function generateCPSummary(
  entries: CPLedgerEntry[],
  userId: string
): string {
  const balance = calculateCPBalance(entries, userId)
  const userEntries = entries.filter(e => e.userId === userId)

  // イベント種別ごとの集計
  const eventCounts: Record<string, number> = {}
  const eventAmounts: Record<string, number> = {}

  for (const entry of userEntries) {
    eventCounts[entry.eventType] = (eventCounts[entry.eventType] || 0) + 1
    eventAmounts[entry.eventType] = (eventAmounts[entry.eventType] || 0) + entry.amount
  }

  const lines: string[] = [
    '=== Culture Points サマリー ===',
    '',
    `ユーザーID: ${userId}`,
    '',
    '【残高】',
    `  利用可能: ${balance.available} CP`,
    `  ロック中: ${balance.locked} CP`,
    `  総獲得: ${balance.totalEarned} CP`,
    `  総消費: ${balance.totalSpent} CP`,
    `  没収: ${balance.totalSlashed} CP`,
    '',
    '【イベント履歴】'
  ]

  for (const [eventType, count] of Object.entries(eventCounts)) {
    const amount = eventAmounts[eventType]
    lines.push(`  ${eventType}: ${count}回 (${amount > 0 ? '+' : ''}${amount} CP)`)
  }

  return lines.join('\n')
}

/**
 * CPランキングを計算
 *
 * @param entries - 台帳エントリ
 * @param topN - 上位N件
 * @returns ランキング
 */
export function calculateCPRanking(
  entries: CPLedgerEntry[],
  topN: number = 100
): Array<{
  userId: string
  balance: CPBalanceSummary
  rank: number
}> {
  // ユニークユーザーを取得
  const userIds = [...new Set(entries.map(e => e.userId))]

  // 各ユーザーの残高を計算
  const rankings = userIds.map(userId => ({
    userId,
    balance: calculateCPBalance(entries, userId),
    rank: 0
  }))

  // 総獲得CPでソート
  rankings.sort((a, b) => b.balance.totalEarned - a.balance.totalEarned)

  // ランクを付与
  for (let i = 0; i < rankings.length; i++) {
    rankings[i].rank = i + 1
  }

  return rankings.slice(0, topN)
}
