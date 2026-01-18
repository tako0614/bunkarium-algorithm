// ============================================================
// Algorithm Contract Types
// ============================================================

/** Surface ids */
export type SurfaceId =
  | 'home_mix'
  | 'home_diverse'
  | 'following'
  | 'scenes'
  | 'search'
  | 'work_page'

/** アルゴリズムパラメータ */
export interface AlgorithmParams {
  /** いいね逓減の窓（ミリ秒） デフォルト: 24時間 */
  likeWindowMs: number
  /** いいね逓減係数α デフォルト: 0.05 */
  likeDecayAlpha: number
  /** 連打判定閾値（30秒内の回数） デフォルト: 50 */
  rapidPenaltyThreshold: number
  /** 連打ペナルティ乗数 デフォルト: 0.1 */
  rapidPenaltyMultiplier: number
  /** 公開メトリクスのパラメータ */
  publicMetrics: PublicMetricsParams
  /** パラメータセットID（監査/計測用、任意） */
  variantId?: string
  /** Per-surface moderation requirements */
  surfacePolicies?: Partial<Record<SurfaceId, SurfacePolicy>>
  /** 多様性制約: 直近N件 デフォルト: 20 */
  diversityCapN: number
  /** 多様性制約: 同一クラスタ上限K デフォルト: 5 */
  diversityCapK: number
  /** 探索枠（0.0～1.0） デフォルト: 0.15 */
  explorationBudget: number
  /** 再ランキング対象の最大件数 デフォルト: 200 */
  rerankMaxCandidates: number
  /** Minimum candidates per cluster (default: 1) */
  rerankMinCandidatesPerCluster: number
  /** スコア重み */
  weights: ScoreWeights
  /** DNS: クラスタ新規性係数 デフォルト: 0.06 */
  clusterNoveltyFactor: number
  /** DNS: 時間新規性の半減期（時間） デフォルト: 72 */
  timeHalfLifeHours: number
  /** MMR: 類似度ペナルティ重み デフォルト: 0.15 */
  mmrSimilarityPenalty: number
  /** 再ランキング戦略 デフォルト: MMR */
  rerankStrategy: 'MMR' | 'DPP'
  /** 理由コード判定閾値 */
  explainThresholds: ExplainThresholds
}
export interface ScoreWeights {
  /** Personal Relevance Score weight */
  prs: number
  /** Cultural Value Score weight */
  cvs: number
  /** Diversity/Novelty Score weight */
  dns: number
}

export interface PublicMetricsParams {
  /** 支持密度の指数β デフォルト: 1.0 */
  beta: number
  /** 支持率/支持密度の事前分母 デフォルト: 10 */
  priorViews: number
  /** 支持率/支持密度の事前分子 デフォルト: 1 */
  priorLikes: number
  /** uniqueLikers の平滑化事前値 デフォルト: 1 */
  priorUniqueLikers: number
  /** 持続の半減期（日） デフォルト: 14 */
  halfLifeDays: number
  /** 公開メトリクスの集計窓（日） デフォルト: 14 */
  metricsWindowDays: number
}

export interface SurfacePolicy {
  /** trueの場合、moderated=falseを除外する */
  requireModerated: boolean
}

export interface ExplainThresholds {
  /** context component 高閾値 デフォルト: 0.70 */
  contextHigh: number
  /** bridge component 高閾値 デフォルト: 0.70 */
  bridgeHigh: number
  /** supportDensity 高閾値（絶対値） デフォルト: 0.15 */
  supportDensityHigh: number
  /** NEW_IN_CLUSTER の露出上限 デフォルト: 2 */
  newClusterExposureMax: number
  /** PRS 類似度最小値 デフォルト: 0.65 */
  prsSimilarityMin: number
}

export const DEFAULT_PUBLIC_METRICS_PARAMS: PublicMetricsParams = {
  beta: 1.0,
  priorViews: 10,
  priorLikes: 1,
  priorUniqueLikers: 1,
  halfLifeDays: 14,
  metricsWindowDays: 14
}

export const DEFAULT_EXPLAIN_THRESHOLDS: ExplainThresholds = {
  contextHigh: 0.70,
  bridgeHigh: 0.70,
  supportDensityHigh: 0.15,
  newClusterExposureMax: 2,
  prsSimilarityMin: 0.65
}

export const DEFAULT_SURFACE_POLICIES: Record<SurfaceId, SurfacePolicy> = {
  home_mix: { requireModerated: true },
  home_diverse: { requireModerated: true },
  following: { requireModerated: true },
  scenes: { requireModerated: true },
  search: { requireModerated: true },
  work_page: { requireModerated: true }
}


/** デフォルトパラメータ */
export const DEFAULT_PARAMS: AlgorithmParams = {
  likeWindowMs: 24 * 60 * 60 * 1000, // 24h
  likeDecayAlpha: 0.05,
  rapidPenaltyThreshold: 50,
  rapidPenaltyMultiplier: 0.1,
  publicMetrics: { ...DEFAULT_PUBLIC_METRICS_PARAMS },
  variantId: 'default',
  surfacePolicies: { ...DEFAULT_SURFACE_POLICIES },
  diversityCapN: 20,
  diversityCapK: 5,
  explorationBudget: 0.15,
  rerankMaxCandidates: 200,
  rerankMinCandidatesPerCluster: 1,
  weights: { prs: 0.55, cvs: 0.25, dns: 0.20 },
  clusterNoveltyFactor: 0.06,
  timeHalfLifeHours: 72,
  mmrSimilarityPenalty: 0.15,
  rerankStrategy: 'MMR',
  explainThresholds: { ...DEFAULT_EXPLAIN_THRESHOLDS }
}
// ============================================================
// User Types
// ============================================================

/** ユーザー状態スナップショット（アルゴリズム入力用） */
export interface UserStateSnapshot {
  /** ユーザーキー（匿名化ID） */
  userKey: string
  /** likeWindowMs 内のいいね回数 */
  likeWindowCount: number
  /** 30秒内のいいね回数（OPTIONAL: undefinedの場合rapid penaltyは適用されない） */
  recentLikeCount30s?: number
  /** 直近のクラスタ露出カウント */
  recentClusterExposures: Record<string, number>
  /** ユーザーの多様性スライダー値（0.0～1.0） */
  diversitySlider: number
  /** ユーザーのCR（Curator Reputation） */
  curatorReputation: number
  /** 直近90日のCP発行量 */
  cpEarned90d: number
}
// ============================================================
// Content Types
// ============================================================

export type CandidateType = 'post' | 'work' | 'collection' | 'note' | 'bridge'

/** コンテンツ候補 */
export interface Candidate {
  /** アイテムキー */
  itemKey: string
  /** コンテンツ種別 */
  type: CandidateType
  /** クラスタID */
  clusterId: string
  /** クラスタ分類バージョン（任意） */
  clusterVersion?: string
  /** 作成日時 */
  createdAt: number
  /** 品質フラグ */
  qualityFlags: QualityFlags
  /** 特徴量 */
  features: CandidateFeatures
}

/** PRSの根拠タイプ */
export type PRSSource = 'saved' | 'liked' | 'following' | 'unknown'

/** 候補用の公開メトリクスヒント（説明用、フルセットより軽量） */
export interface CandidatePublicMetricsHint {
  supportDensity?: number
  supportRate?: number
  weightedSupportIndex?: number
  breadth?: number
  persistenceDays?: number
}

/** コンテンツ特徴量 */
export interface CandidateFeatures {
  /** CVSコンポーネント */
  cvsComponents: CVSComponents
  /** PRS（Personal Relevance Score） - 事前計算済み */
  prs?: number
  /** PRSの根拠（任意） */
  prsSource?: PRSSource
  /** 埋め込みベクトル（任意） - L2正規化ベクトル */
  embedding?: number[]
  /** 公開メトリクス（説明用、任意） */
  publicMetricsHint?: CandidatePublicMetricsHint
  /** 不正排除済みユニーク閲覧者数（distinct viewers） */
  qualifiedUniqueViewers?: number
  /** ユニークいいね者数（distinct likers） */
  uniqueLikers?: number
  /** 重み付きいいね合計 */
  weightedLikeSum?: number
  /** 重み付き視聴合計（文化視聴価値） */
  weightedViews?: number
}

export interface CVSComponents {
  /** いいねシグナル（normalized 0～1） */
  like: number
  /** コンテキストシグナル（normalized 0～1） */
  context: number
  /** コレクションシグナル（normalized 0～1） */
  collection: number
  /** ブリッジシグナル（normalized 0～1） */
  bridge: number
  /** 持続シグナル（normalized 0～1） */
  sustain: number
}

export interface QualityFlags {
  /** 表示面のモデレーションを通過済み */
  moderated: boolean
  /** 強制非表示 */
  hardBlock?: boolean
  /** スパム疑い */
  spamSuspect?: boolean
}

// ============================================================
// Metrics Types
// ============================================================

/** 公開メトリクス（総数ではなく割合/密度） */
export interface PublicMetrics {
  /** 支持密度 */
  supportDensity: number
  /** 支持率（raw, uniqueLikers/QUV） */
  supportRate: number
  /** 重み付き支持指数（weightedLikeSum/QUV、1を超える可能性あり） */
  weightedSupportIndex: number
  /** 重み付き支持率（clampedで0～1） */
  weightedSupportRateClamped: number
  /** 文化視聴値 == weightedViews */
  culturalViewValue: number
  /** 重み付き視聴合計（文化視聴価値と同じ） */
  weightedViews: number
  /** 不正排除済みユニーク閲覧者数（distinct viewers） */
  qualifiedUniqueViewers: number
  /** 広がり（実効クラスタ数） */
  breadth: number
  /** 広がりレベル（low/medium/high） */
  breadthLevel: 'low' | 'medium' | 'high'
  /** 持続（日数） */
  persistenceDays: number
  /** 持続レベル */
  persistenceLevel: 'low' | 'medium' | 'high'
  /** 上位クラスタ偏り */
  topClusterShare: number
}
/** メトリクス計算用の入力データ */
export interface PublicMetricsInput {
  /** 重み付きいいね合計 */
  weightedLikeSum: number
  /** ユニークいいね者数（distinct likers） */
  uniqueLikers: number
  /** 不正排除済みユニーク閲覧者数（distinct viewers） */
  qualifiedUniqueViewers: number
  /** 重み付き視聴合計（文化視聴価値） */
  weightedViews: number
  /** 支持者のクラスタ分布（重み、集計窓はpublicMetrics.metricsWindowDaysに準拠） */
  clusterWeights: Record<string, number>
  /** 最初の反応からの日数 */
  daysSinceFirstReaction: number
  /** 直近の反応残存率（0～1、アプリ定義） */
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
  /** 決定性用シード（任意） */
  requestSeed?: string
  /** クラスタ分類バージョン（REQUIRED: 全候補に共通のクラスタ体系バージョン） */
  clusterVersion: string
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
  surface: SurfaceId
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
  /** コントラクトバージョン */
  contractVersion: string
  /** パラメータセットID（effective paramsのsha256ハッシュ） */
  paramSetId: string
  /** パラメータ variant ID（人間可読、任意） */
  variantId?: string
  /** ランキング結果 */
  ranked: RankedItem[]
  /** 制約レポート */
  constraintsReport: ConstraintsReport
}

export interface RankedItem {
  /** アイテムキー */
  itemKey: string
  /** コンテンツ種別 */
  type: CandidateType
  /** クラスタID */
  clusterId: string
  /** 最終スコア */
  finalScore: number
  /** 理由コード */
  reasonCodes: ReasonCode[]
  /** Surface reason codes (optional) */
  surfaceReasonCodes?: SurfaceReasonCode[]
  /** スコア内訳（デバッグ用） */
  scoreBreakdown: ScoreBreakdown
}

export interface ScoreBreakdown {
  prs: number
  cvs: number
  dns: number
  penalty: number
  finalScore: number
}

export interface ConstraintsReport {
  /** 使用した戦略 */
  usedStrategy: 'MMR' | 'DPP' | 'NONE'
  /** クラスタ上限が適用された回数 */
  capAppliedCount: number
  /** 探索枠要求数 */
  explorationSlotsRequested: number
  /** 探索枠実際に埋まった数 */
  explorationSlotsFilled: number
  /** 実効多様性上限K */
  effectiveDiversityCapK: number
  /** 実効探索予算 */
  effectiveExplorationBudget: number
  /** 実効重み */
  effectiveWeights: ScoreWeights
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

export type SurfaceReasonCode = 'EDITORIAL'

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
}

export const SURFACE_REASON_DESCRIPTIONS: Record<SurfaceReasonCode, string> = {
  EDITORIAL: '編集枠'
}


// ============================================================
// Like Decay Types
// ============================================================

/** いいね重み入力 */
export interface LikeWeightInput {
  /** likeWindowMs 内のいいね回数 */
  likeWindowCount: number
  /** 逓減係数α */
  alpha?: number
  /** 30秒内のいいね回数 */
  recentLikeCount30s?: number
  /** 連打判定閾値（30秒内の回数） */
  rapidPenaltyThreshold?: number
  /** 連打ペナルティ乗数 */
  rapidPenaltyMultiplier?: number
}

/** いいね重み計算結果 */
export interface LikeWeightOutput {
  /** 重み値（0.0～1.0） */
  weight: number
  /** 支持力メーター表示用（0～100%） */
  supportPowerPercent: number
  /** 連打判定 */
  isRapid: boolean
  /** 連打ペナルティが適用されたか */
  rapidPenaltyApplied: boolean
}

/** CR（Curator Reputation）設定 */
export interface CRConfig {
  /** 最小CR値 */
  minCR: number
  /** 最大CR値 */
  maxCR: number
  /** 時間減衰の半減期（日） */
  halfLifeDays: number
}

// ============================================================
// Culture Points Types
// ============================================================

export type { CPEventType, CPLedgerEntry, CPBalanceSummary, StakeRecommendation } from '../core/culture-points'
export type { VotingPowerInput, VotingPowerOutput } from '../core/voting-power'

