// ============================================================
// Algorithm Contract Types
// ============================================================

/** アルゴリズムパラメータ */
export interface AlgorithmParams {
  /** いいね逓減の窓（ミリ秒） デフォルト: 24時間 */
  likeDecayWindowMs: number
  /** いいね逓減係数α デフォルト: 0.05 */
  likeDecayAlpha: number
  /** 多様性制約: 直近N件 デフォルト: 20 */
  diversityCapN: number
  /** 多様性制約: 同一クラスタ上限K デフォルト: 5 */
  diversityCapK: number
  /** 探索枠（0.0〜1.0） デフォルト: 0.15 */
  explorationBudget: number
  /** スコア重み */
  weights: ScoreWeights
}

export interface ScoreWeights {
  /** Personal Relevance Score weight */
  prs: number
  /** Cultural Value Score weight */
  cvs: number
  /** Diversity/Novelty Score weight */
  dns: number
}

/** デフォルトパラメータ */
export const DEFAULT_PARAMS: AlgorithmParams = {
  likeDecayWindowMs: 24 * 60 * 60 * 1000, // 24h
  likeDecayAlpha: 0.05,
  diversityCapN: 20,
  diversityCapK: 5,
  explorationBudget: 0.15,
  weights: { prs: 0.55, cvs: 0.25, dns: 0.20 }
}

// ============================================================
// User Types
// ============================================================

/** ユーザー状態スナップショット（アルゴリズム入力用） */
export interface UserStateSnapshot {
  /** ユーザーキー（匿名化ID） */
  userKey: string
  /** 24時間内のいいね回数 */
  likeWindowCount24h: number
  /** 直近のクラスタ露出カウント */
  recentClusterExposures: Record<string, number>
  /** ユーザーの多様性スライダー値（0.0〜1.0） */
  diversitySlider: number
  /** ユーザーのCR（Curator Reputation） */
  curatorReputation: number
}

// ============================================================
// Content Types
// ============================================================

export type ContentType = 'post' | 'work' | 'collection' | 'note' | 'bridge'

/** コンテンツ候補 */
export interface Candidate {
  /** アイテムキー */
  itemKey: string
  /** コンテンツ種別 */
  type: ContentType
  /** クラスタID */
  clusterId: string
  /** 作成日時 */
  createdAt: number
  /** 特徴量 */
  features: CandidateFeatures
}

/** コンテンツ特徴量 */
export interface CandidateFeatures {
  /** CVSコンポーネント */
  cvsComponents: CVSComponents
  /** ユニーク閲覧数 */
  uniqueViews: number
  /** 品質フラグ */
  qualityFlags: QualityFlags
  /** 埋め込みベクトル（任意） */
  embedding?: number[]
  /** PRS（Personal Relevance Score） - 事前計算済み */
  prs?: number
  /** PRSの根拠（任意） */
  prsSource?: 'saved' | 'liked' | 'following'
  /** 公開メトリクス（説明用、任意） */
  publicMetrics?: PublicMetrics
}

export interface CVSComponents {
  /** いいねシグナル（重み付き合計） */
  likeSignal: number
  /** コンテキストシグナル（注釈の質） */
  contextSignal: number
  /** コレクションシグナル */
  collectionSignal: number
  /** ブリッジシグナル */
  bridgeSignal: number
  /** 持続シグナル */
  sustainSignal: number
}

export interface QualityFlags {
  /** モデレーション済み */
  moderated: boolean
  /** NSFW */
  nsfw: boolean
  /** スパム疑い */
  spamSuspect: boolean
}

// ============================================================
// Metrics Types
// ============================================================

/** 公開メトリクス（総数ではなく割合/密度） */
export interface PublicMetrics {
  /** 支持密度 */
  supportDensity: number
  /** 支持率 */
  supportRate: number
  /** 広がり（到達クラスタ数） */
  breadth: number
  /** 広がりレベル（low/medium/high） */
  breadthLevel: 'low' | 'medium' | 'high'
  /** 持続（日数） */
  persistenceDays: number
  /** 持続レベル */
  persistenceLevel: 'low' | 'medium' | 'high'
}

/** メトリクス計算用の入力データ */
export interface MetricsInput {
  /** 重み付きいいね合計 */
  weightedLikeSum: number
  /** ユニーク閲覧数 */
  uniqueViews: number
  /** 支持者のクラスタ分布 */
  supporterClusters: string[]
  /** 最初の反応からの日数 */
  daysSinceFirstReaction: number
  /** 直近7日の反応残存率 */
  recentReactionRate: number
}

// ============================================================
// Ranking Types
// ============================================================

/** ランキングリクエスト */
export interface RankRequest {
  /** コントラクトバージョン */
  contractVersion: string
  /** リクエストID */
  requestId: string
  /** ユーザー状態 */
  userState: UserStateSnapshot
  /** 候補一覧 */
  candidates: Candidate[]
  /** コンテキスト */
  context: RankContext
  /** パラメータ（省略時はデフォルト） */
  params?: Partial<AlgorithmParams>
}

export interface RankContext {
  /** 表示面 */
  surface: 'home_mix' | 'home_diverse' | 'following' | 'scenes' | 'search' | 'work_page'
  /** 現在時刻 */
  nowTs: number
}

/** ランキングレスポンス */
export interface RankResponse {
  /** リクエストID */
  requestId: string
  /** アルゴリズムID */
  algorithmId: string
  /** アルゴリズムバージョン */
  algorithmVersion: string
  /** ランキング結果 */
  ranked: RankedItem[]
  /** 制約レポート */
  constraintsReport: ConstraintsReport
}

export interface RankedItem {
  /** アイテムキー */
  itemKey: string
  /** 最終スコア */
  finalScore: number
  /** 理由コード */
  reasonCodes: ReasonCode[]
  /** スコア内訳（デバッグ用） */
  scoreBreakdown: ScoreBreakdown
}

export interface ScoreBreakdown {
  prs: number
  cvs: number
  dns: number
  penalty: number
}

export interface ConstraintsReport {
  /** クラスタ上限が適用された回数 */
  clusterCapsApplied: number
  /** 探索枠使用数 */
  explorationSlotsUsed: number
}

// ============================================================
// Reason Codes
// ============================================================

export type ReasonCode =
  | 'SIMILAR_TO_SAVED'
  | 'SIMILAR_TO_LIKED'
  | 'FOLLOWING'
  | 'GROWING_CONTEXT'
  | 'BRIDGE_SUCCESS'
  | 'DIVERSITY_SLOT'
  | 'EXPLORATION'
  | 'HIGH_SUPPORT_DENSITY'
  | 'TRENDING_IN_CLUSTER'
  | 'NEW_IN_CLUSTER'
  | 'EDITORIAL'

/** 理由コードの説明テンプレート */
export const REASON_DESCRIPTIONS: Record<ReasonCode, string> = {
  SIMILAR_TO_SAVED: 'あなたの保存した作品に近い',
  SIMILAR_TO_LIKED: 'あなたが支持した作品に近い',
  FOLLOWING: 'フォロー中のユーザーから',
  GROWING_CONTEXT: '注釈が増えている',
  BRIDGE_SUCCESS: '翻訳ブリッジで到達',
  DIVERSITY_SLOT: '多様性枠',
  EXPLORATION: '新しいシーンから',
  HIGH_SUPPORT_DENSITY: '支持密度が高い',
  TRENDING_IN_CLUSTER: 'シーン内で注目',
  NEW_IN_CLUSTER: 'シーンの新着',
  EDITORIAL: '編集枠'
}

// ============================================================
// Like Decay Types
// ============================================================

/** いいね重み計算結果 */
export interface LikeWeight {
  /** 重み値（0.0〜1.0） */
  weight: number
  /** 支持力メーター表示用（0〜100%） */
  supportPowerPercent: number
}
