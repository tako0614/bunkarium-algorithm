/**
 * アルゴリズム全体のデフォルトパラメータ
 *
 * 全モジュールからこのファイルを参照することで一元管理
 */

// ============================================
// いいね逓減パラメータ
// ============================================

export const LIKE_DECAY_DEFAULTS = {
  /** 逓減係数α (デフォルト: 0.05) */
  alpha: 0.05,
  /** 時間窓（ミリ秒、24時間 = 86400000ms） */
  likeWindowMs: 86400000,
  /** 時間窓（時間） */
  windowHours: 24,
  /** 連打判定閾値（30秒内の回数） */
  rapidThreshold: 50,
  /** 連打判定時間窓（秒） */
  rapidWindowSeconds: 30,
  /** 連打ペナルティ乗数 */
  rapidPenaltyMultiplier: 0.1
} as const

// ============================================
// スコアリングパラメータ
// ============================================

export const SCORING_DEFAULTS = {
  /** PRS重み */
  prsWeight: 0.55,
  /** CVS重み */
  cvsWeight: 0.25,
  /** DNS重み */
  dnsWeight: 0.20,
  /** CVS各コンポーネントのデフォルト重み（algorithm.md v1.0仕様） */
  cvsComponentWeights: {
    like: 0.40,
    context: 0.25,
    collection: 0.20,
    bridge: 0.10,
    sustain: 0.05
  },
  /** DNS計算用のクラスタ露出係数（algorithm.md: clusterNoveltyFactor） */
  clusterNoveltyFactor: 0.06,
  /** 時間新規性の半減期（時間、algorithm.md: timeHalfLifeHours） */
  timeHalfLifeHours: 72,
  /** DNS計算: クラスタ新規性の重み */
  dnsClusterNoveltyWeight: 0.6,
  /** DNS計算: 時間新規性の重み */
  dnsTimeNoveltyWeight: 0.4,
  /** 探索スコア: DNSの重み */
  explorationDNSWeight: 0.7,
  /** 探索スコア: finalScoreの重み */
  explorationFinalScoreWeight: 0.3
} as const

// ============================================
// 多様性制約パラメータ
// ============================================

export const DIVERSITY_DEFAULTS = {
  /** 直近N件 */
  diversityCapN: 20,
  /** 同一クラスタ上限K */
  diversityCapK: 5,
  /** 探索枠（0.0〜1.0） */
  explorationBudget: 0.15,
  /** 多様性スライダーの最小値（ユーザーが下げられない下限） */
  minimumDiversityRatio: 0.1,
  /** 多様性スライダー: 重み調整のdeltaMax */
  sliderDeltaMax: 0.10,
  /** 多様性スライダー: 重み正規化の最小値 */
  sliderMinWeight: 0.05,
  /** 多様性スライダー: 重み正規化の最大値 */
  sliderMaxWeight: 0.90,
  /** 多様性スライダー: 重み正規化の最大反復回数 */
  sliderMaxIterations: 3,
  /** 探索予算の最小値 */
  explorationBudgetMin: 0.05,
  /** 探索予算の最大値 */
  explorationBudgetMax: 0.30,
  /** MMR: 類似度ペナルティの重み (algorithm.md v1.0仕様: lambda=0.15) */
  mmrLambda: 0.15,
  /** DPP: 品質の重み */
  dppQualityWeight: 1.0,
  /** DPP: 多様性の重み */
  dppDiversityWeight: 1.0,
  /** DPP: サンプリング温度 */
  dppTemperature: 1.0,
  /** スライディングウィンドウ: 類似度閾値 */
  slidingWindowSimilarityThreshold: 0.8
} as const

// ============================================
// CR（Curator Reputation）パラメータ
// ============================================

export const REPUTATION_DEFAULTS = {
  /** 基準CR値（新規ユーザー） */
  baseCR: 1.0,
  /** 最小CR値 */
  minCR: 0.1,
  /** 最大CR値 */
  maxCR: 10.0,
  /** 時間減衰の半減期（日） */
  decayHalfLifeDays: 90,
  /** CR更新の学習率 */
  learningRate: 0.1,
  /** イベント重み */
  eventWeights: {
    noteAdopted: 0.15,
    noteReferenced: 0.10,
    collectionAdopted: 0.12,
    bridgeSuccess: 0.25,
    stakeSuccess: 0.20,
    stakeFailure: -0.15,
    spamFlag: -0.30,
    qualityContribution: 0.08
  },
  /** ブリッジ成功の反応タイプ重み */
  bridgeReactionWeights: {
    like: 0.3,
    save: 0.5,
    comment: 0.8
  },
  /** ブリッジ成功の最小クラスタ数 */
  bridgeMinClusters: 2,
  /** ブリッジ成功の最小エンゲージメント */
  bridgeMinEngagement: 1.0
} as const

// ============================================
// CP（Culture Points）パラメータ
// ============================================

export const CULTURE_POINTS_DEFAULTS = {
  /** 基本発行量 */
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
  /** 逓減設定 (algorithm.md v1.0仕様: rate=0.05) */
  diminishing: {
    windowHours: 24,
    rate: 0.05,
    minMultiplier: 0.2
  },
  /** ステーク設定 */
  stake: {
    defaultLockDays: 14,
    minStakeAmount: 50,
    successBonusRate: 0.2,
    failureSlashRate: 0.3,
    successThreshold: 0.5
  }
} as const

// ============================================
// 理由コード閾値 (algorithm.md v1.0仕様準拠)
// 注: types/index.ts の DEFAULT_EXPLAIN_THRESHOLDS が公式定義
// ============================================

export const EXPLAIN_THRESHOLDS = {
  /** context component 高閾値 (GROWING_CONTEXT判定) */
  contextHigh: 0.70,
  /** bridge component 高閾値 (BRIDGE_SUCCESS判定) */
  bridgeHigh: 0.70,
  /** supportDensity 高閾値 (HIGH_SUPPORT_DENSITY判定) */
  supportDensityHigh: 0.15,
  /** NEW_IN_CLUSTER の露出上限 */
  newClusterExposureMax: 2,
  /** PRS 類似度最小値 (SIMILAR_TO_*判定) */
  prsSimilarityMin: 0.65
} as const

// ============================================
// 評価メトリクス
// ============================================

export const EVALUATION_DEFAULTS = {
  /** ロングテール定義: 上位何%がヘッドか */
  longTailTopPercentile: 0.2,
  /** 新規アイテム定義: 何日以内 */
  freshItemDays: 7,
  /** 位置バイアス分析: 最大位置 */
  maxPositionForAnalysis: 20
} as const

// ============================================
// 公開メトリクスパラメータ (algorithm.md v1.0仕様)
// ============================================

export const PUBLIC_METRICS_PARAMS = {
  /** 支持密度計算の指数β */
  beta: 1.0,
  /** 事前分母（閲覧者数） */
  priorViews: 10,
  /** 事前分子（重み付きいいね） */
  priorLikes: 1,
  /** 事前ユニークいいね者数 */
  priorUniqueLikers: 1,
  /** 持続性計算の半減期（日） */
  halfLifeDays: 14,
  /** メトリクス集計期間（日） */
  metricsWindowDays: 14
} as const

// ============================================
// 数値計算
// ============================================

export const NUMERICAL_DEFAULTS = {
  /** 行列計算の正則化項 */
  matrixRegularization: 1e-6,
  /** ゼロ判定の閾値 */
  zeroThreshold: 1e-10,
  /** 数値安定性のための最小値 */
  minPositiveValue: 1e-12
} as const

// ============================================
// 型定義
// ============================================

export type LikeDecayDefaults = typeof LIKE_DECAY_DEFAULTS
export type ScoringDefaults = typeof SCORING_DEFAULTS
export type DiversityDefaults = typeof DIVERSITY_DEFAULTS
export type ReputationDefaults = typeof REPUTATION_DEFAULTS
export type CulturePointsDefaults = typeof CULTURE_POINTS_DEFAULTS
export type EvaluationDefaults = typeof EVALUATION_DEFAULTS
export type NumericalDefaults = typeof NUMERICAL_DEFAULTS
