/**
 * @bunkarium/algorithm
 *
 * 文化多様性を重視するレコメンデーションアルゴリズム
 *
 * 特徴:
 * - いいね逓減（押せるが目減り）
 * - 総数ではなく割合/密度/分布表示
 * - PRS/CVS/DNS の多目的スコアリング
 * - 多様性制約付き再ランキング
 * - 説明可能な理由コード
 */

// Types
export * from './types'

// Core algorithms
export {
  // Like decay
  calculateLikeWeight,
  calculateLikeWeightWithRapidPenalty,
  predictNextLikeWeight,
  calculateWeightedLikeSignal,

  // Metrics
  calculateSupportDensity,
  calculateSupportRate,
  calculateBreadth,
  getBreadthLevel,
  calculatePersistence,
  getPersistenceLevel,
  calculatePublicMetrics,
  formatMetricsForDisplay,

  // Scoring
  calculateCVS,
  calculateDNS,
  calculatePenalty,
  calculateMixedScore,
  DEFAULT_CVS_WEIGHTS,

  // Reranking
  primaryRank,
  diversityRerank,
  rank,

  // Explain
  determineReasonCodes,
  formatReasonCodes,
  generateDetailedExplanation,
  calculateContributionRates
} from './core'

// Version info
export const ALGORITHM_ID = 'bunkarium-culture-rank'
export const ALGORITHM_VERSION = '1.0.0'
export const CONTRACT_VERSION = '1.0'
