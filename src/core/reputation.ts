/**
 * Curator Reputation (CR) 計算
 *
 * CRはフォロワー数ではなく、"成果"で更新する:
 * - 推薦/注釈/ブリッジが複数クラスタへ波及
 * - 注釈が参照され定着
 * - 不正率が低い
 */

/** CR計算の入力イベント */
export interface CREvent {
  type: CREventType
  timestamp: number
  metadata: Record<string, unknown>
}

export type CREventType =
  | 'note_adopted'          // 注釈が採用された
  | 'note_referenced'       // 注釈が参照された
  | 'collection_adopted'    // コレクションが採用された
  | 'bridge_success'        // ブリッジが成功（他クラスタで反応）
  | 'stake_success'         // ステーク推薦が成功
  | 'stake_failure'         // ステーク推薦が失敗
  | 'spam_flag'             // スパムフラグ
  | 'quality_contribution'  // 質の高い貢献（編集、メタ整備など）

/** CR計算の重み */
export interface CRWeights {
  noteAdopted: number
  noteReferenced: number
  collectionAdopted: number
  bridgeSuccess: number
  stakeSuccess: number
  stakeFailure: number      // 負の重み
  spamFlag: number          // 負の重み
  qualityContribution: number
}

export const DEFAULT_CR_WEIGHTS: CRWeights = {
  noteAdopted: 0.15,
  noteReferenced: 0.10,
  collectionAdopted: 0.12,
  bridgeSuccess: 0.25,       // ブリッジ成功は高い評価
  stakeSuccess: 0.20,
  stakeFailure: -0.15,       // 失敗はペナルティ
  spamFlag: -0.30,           // スパムは大きなペナルティ
  qualityContribution: 0.08
}

/** CR計算の設定 */
export interface CRConfig {
  /** 基準CR値（新規ユーザー） */
  baseCR: number
  /** 最小CR値 */
  minCR: number
  /** 最大CR値 */
  maxCR: number
  /** 時間減衰の半減期（日） */
  decayHalfLifeDays: number
  /** 重み */
  weights: CRWeights
}

export const DEFAULT_CR_CONFIG: CRConfig = {
  baseCR: 1.0,
  minCR: 0.1,
  maxCR: 10.0,
  decayHalfLifeDays: 90,  // 90日で影響半減
  weights: DEFAULT_CR_WEIGHTS
}

/**
 * CRを計算
 *
 * @param events - CR関連イベント履歴
 * @param currentCR - 現在のCR値
 * @param config - 設定
 * @returns 新しいCR値
 */
export function calculateCR(
  events: CREvent[],
  currentCR: number = 1.0,
  config: CRConfig = DEFAULT_CR_CONFIG
): number {
  const now = Date.now()

  let crDelta = 0

  for (const event of events) {
    // 時間減衰を適用
    const ageDays = (now - event.timestamp) / (1000 * 60 * 60 * 24)
    const decay = Math.pow(0.5, ageDays / config.decayHalfLifeDays)

    // イベントタイプに応じた重みを取得
    const weight = getEventWeight(event.type, config.weights)

    crDelta += weight * decay
  }

  // 新しいCR値を計算（指数移動平均的な更新）
  const alpha = 0.1 // 学習率
  let newCR = currentCR + alpha * crDelta

  // 範囲内にクランプ
  newCR = Math.max(config.minCR, Math.min(config.maxCR, newCR))

  return newCR
}

/**
 * イベントタイプから重みを取得
 */
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

/**
 * CRに基づくいいね重みの乗数を計算
 *
 * CRが高いユーザーのいいねは影響力が大きい
 *
 * @param cr - Curator Reputation
 * @returns 乗数（0.5〜2.0）
 */
export function getCRMultiplier(cr: number): number {
  // 対数スケールで緩やかに影響
  // CR=1.0 → multiplier=1.0
  // CR=0.1 → multiplier≈0.5
  // CR=10.0 → multiplier≈2.0
  return Math.max(0.5, Math.min(2.0, 0.5 + 0.5 * Math.log10(cr * 10)))
}

/**
 * CRレベルを判定
 *
 * @param cr - Curator Reputation
 * @returns レベル
 */
export function getCRLevel(cr: number): 'newcomer' | 'regular' | 'trusted' | 'expert' {
  if (cr < 0.5) return 'newcomer'
  if (cr < 2.0) return 'regular'
  if (cr < 5.0) return 'trusted'
  return 'expert'
}

/**
 * ブリッジ成功を判定
 *
 * @param sourceCluster - 元クラスタ
 * @param reactions - 反応データ
 * @returns 成功判定と詳細
 */
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

  // 成功条件: 2つ以上の異なるクラスタで反応があり、一定のエンゲージメントがある
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

/**
 * 注釈の定着度を評価
 *
 * @param noteId - 注釈ID
 * @param references - 参照データ
 * @param agedays - 作成からの日数
 * @returns 定着スコア
 */
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
  const recentThreshold = 7 * 24 * 60 * 60 * 1000 // 7日

  // 参照の重み付けカウント
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

  // 定着スコア = 総参照重み / sqrt(日数) で時間正規化
  const settlementScore = totalWeight / Math.sqrt(Math.max(1, ageDays))

  // 直近の活動率
  const recentActivityRate = totalWeight > 0 ? recentWeight / totalWeight : 0

  // 定着判定: スコアが閾値以上かつ複数参照がある
  const isSettled = settlementScore >= 0.5 && references.length >= 3

  return {
    settlementScore,
    isSettled,
    referenceCount: references.length,
    recentActivityRate
  }
}
