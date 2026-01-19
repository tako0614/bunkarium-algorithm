/**
 * アルゴリズム全体のデフォルトパラメータ
 *
 * Community-First Algorithm: シンプルな設計
 * - PRS（フォロー関係）+ CVS（文化的価値）のみ
 * - 多様性はアルゴリズムに含まない（結果として生まれる）
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
  /** 連打逓減係数β (逓減式: 1/(1+β*(n-1)), 高いほど速く逓減) */
  rapidDecayBeta: 0.1,
  /** 連打判定時間窓（秒） */
  rapidWindowSeconds: 30,
  /** 連打ペナルティ最小値 (逓減しても下回らない) */
  rapidPenaltyMin: 0.01
} as const

// ============================================
// スコアリングパラメータ (シンプル化: PRS + CVS のみ)
// ============================================

export const SCORING_DEFAULTS = {
  /** PRS重み: フォロー関係・親密度 */
  prsWeight: 0.50,
  /** CVS重み: 文化的価値（CR/CP由来） */
  cvsWeight: 0.50,
  /** CVS各コンポーネントのデフォルト重み */
  cvsComponentWeights: {
    like: 0.35,      // いいねの質（CR加重）
    context: 0.25,   // コンテキスト品質（作品引用など）
    collection: 0.15, // コレクション価値
    bridge: 0.15,    // ブリッジ貢献（クラスタ間の価値発見）
    sustain: 0.10    // 持続的価値
  }
} as const

// ============================================
// CR（Curator Reputation）パラメータ
// ============================================

export const REPUTATION_DEFAULTS = {
  /** 基準CR値（新規ユーザー） */
  baseCR: 1.0,
  /** 最小CR値 (undefined = 制限なし) */
  minCR: undefined as number | undefined,
  /** 最大CR値 (undefined = 制限なし) */
  maxCR: undefined as number | undefined,
  /** 時間減衰の半減期（日） */
  decayHalfLifeDays: 90,
  /** CR更新の学習率 */
  learningRate: 0.2,
  /** イベント重み */
  eventWeights: {
    noteAdopted: 0.15,
    noteReferenced: 0.10,
    collectionAdopted: 0.12,
    bridgeSuccess: 0.25,
    stakeSuccess: 0.20,
    stakeFailure: -0.15,
    spamFlag: -0.30,
    qualityContribution: 0.08,
    /** 少数派発見ボーナス: 後に人気になるコンテンツを早期発見 */
    earlyDiscovery: 0.30,
    /** 普段と異なるクラスタで価値を発見 */
    crossClusterDiscovery: 0.20
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
  bridgeMinEngagement: 1.0,
  /** 少数派発見: 早期発見の人気度閾値 */
  earlyDiscoveryPopularityThreshold: 0.2
} as const

// ============================================
// CP（Culture Points）パラメータ
// ============================================

export const CULTURE_POINTS_DEFAULTS = {
  /** 基本発行量 */
  baseAmounts: {
    postCreated: 1,
    likeReceived: 0.5,
    engagementBonus: 5,
    noteAdopted: 10,
    noteReferenced: 5,
    collectionAdopted: 15,
    collectionReferenced: 7,
    bridgeSuccess: 20,
    archiveContribution: 8,
    qualityEdit: 5,
    communityReward: 10
  },
  /** 逓減設定 */
  diminishing: {
    windowHours: 24,
    rate: 0.1,
    minMultiplier: undefined as number | undefined
  },
  /** ステーク設定 */
  stake: {
    defaultLockDays: 14,
    minStakeAmount: 50,
    successBonusRate: 0.2,
    failureSlashRate: 0.3,
    successThreshold: 0.5
  },
  /** CP発行時のCRマルチプライヤ（制限なし） */
  issuanceCRMultiplier: {
    min: undefined as number | undefined,
    max: undefined as number | undefined
  },
  /** 不正検出設定 */
  fraudDetection: {
    eventFrequencyThreshold: 50,
    diminishingRateThreshold: 0.8,
    maxObjectCountThreshold: 10,
    nightActivityRateThreshold: 0.5,
    nightActivityCountThreshold: 10,
    fraudThreshold: 0.5,
    actionThresholds: {
      ban: 0.8,
      fullSlash: 0.6,
      partialSlash: 0.4,
      warning: 0.2
    }
  }
} as const

// ============================================
// 理由コード閾値
// ============================================

export const EXPLAIN_THRESHOLDS = {
  /** context component 高閾値 */
  contextHigh: 0.70,
  /** bridge component 高閾値 */
  bridgeHigh: 0.70,
  /** supportDensity 高閾値 */
  supportDensityHigh: 0.15,
  /** NEW_IN_CLUSTER の露出上限 */
  newClusterExposureMax: 2,
  /** PRS 類似度最小値 */
  prsSimilarityMin: 0.65
} as const

// ============================================
// 評価メトリクス
// ============================================

export const EVALUATION_DEFAULTS = {
  longTailTopPercentile: 0.2,
  freshItemDays: 7,
  maxPositionForAnalysis: 20
} as const

// ============================================
// 公開メトリクスパラメータ
// ============================================

export const PUBLIC_METRICS_PARAMS = {
  beta: 1.0,
  priorViews: 10,
  priorLikes: 1,
  priorUniqueLikers: 1,
  halfLifeDays: 14,
  metricsWindowDays: 14
} as const

// ============================================
// 数値計算
// ============================================

export const LN2 = Math.log(2)

export const NUMERICAL_DEFAULTS = {
  matrixRegularization: 1e-6,
  zeroThreshold: 1e-10,
  minPositiveValue: 1e-12
} as const

// ============================================
// LSH (Locality Sensitive Hashing) パラメータ
// ============================================

export const LSH_DEFAULTS = {
  numTables: 10,
  numHashPerTable: 8,
  dimension: 128,
  seed: 42
} as const

// ============================================
// PRNG・ハッシュ定数
// ============================================

export const HASH_CONSTANTS = {
  fnv1aOffsetBasis: 14695981039346656037n,
  fnv1aPrime: 1099511628211n,
  fnv1aBitMask: 0xffffffffffffffffn,
  prngDivisor: 0x100000000
} as const

// ============================================
// CR レベル閾値
// ============================================

export const CR_LEVEL_THRESHOLDS = {
  explorerMax: 0.5,
  finderMax: 2.0,
  curatorMax: 5.0
} as const

// ============================================
// 後方互換性のためのエイリアス（非推奨）
// ============================================

/** @deprecated 多様性機能は削除されました */
export const DIVERSITY_DEFAULTS = {
  diversityCapN: 20,
  diversityCapK: 1000,
  explorationBudget: 0,
  minimumDiversityRatio: 0,
  sliderDeltaMax: 0,
  sliderMinWeight: 0,
  sliderMaxWeight: 1,
  sliderMaxIterations: 1,
  sliderDNSWeightRatio: 0,
  sliderCVSWeightRatio: 0,
  sliderEffectiveKMinMultiplier: 1,
  sliderEffectiveKMaxMultiplier: 1,
  sliderExplorationMinMultiplier: 0,
  sliderExplorationMaxMultiplier: 0,
  explorationBudgetMin: 0,
  explorationBudgetMax: 0,
  mmrLambda: 0,
  dppQualityWeight: 0,
  dppDiversityWeight: 0,
  dppTemperature: 1,
  slidingWindowSimilarityThreshold: 1,
  earlyDiscoveryPopularityThreshold: 0.2,
  discoveryBonusExplorationWeight: 0
} as const

// ============================================
// 型定義
// ============================================

export type LikeDecayDefaults = typeof LIKE_DECAY_DEFAULTS
export type ScoringDefaults = typeof SCORING_DEFAULTS
export type ReputationDefaults = typeof REPUTATION_DEFAULTS
export type CulturePointsDefaults = typeof CULTURE_POINTS_DEFAULTS
export type EvaluationDefaults = typeof EVALUATION_DEFAULTS
export type NumericalDefaults = typeof NUMERICAL_DEFAULTS
export type LSHDefaults = typeof LSH_DEFAULTS
export type HashConstants = typeof HASH_CONSTANTS
export type CRLevelThresholds = typeof CR_LEVEL_THRESHOLDS
/** @deprecated */
export type DiversityDefaults = typeof DIVERSITY_DEFAULTS
