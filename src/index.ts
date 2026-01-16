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
  calculateContributionRates,

  // Reputation (CR)
  calculateCR,
  getCRMultiplier,
  getCRLevel,
  evaluateBridgeSuccess,
  evaluateNoteSettlement,
  DEFAULT_CR_CONFIG,
  DEFAULT_CR_WEIGHTS,

  // Diversity (MMR/DPP)
  cosineSimilarity,
  euclideanSimilarity,
  jaccardSimilarity,
  clusterSimilarity,
  calculateSimilarity,
  calculateMMRScore,
  mmrRerank,
  buildDPPKernel,
  determinant,
  dppSampleGreedy,
  slidingWindowFilter,
  hybridDiversityRerank,
  calculateDiversityMetrics,
  DEFAULT_MMR_CONFIG,
  DEFAULT_DPP_CONFIG,
  DEFAULT_SLIDING_WINDOW_CONFIG,
  DEFAULT_HYBRID_CONFIG,

  // Evaluation (Offline Metrics)
  calculateGini,
  calculateExposureGini,
  calculateLikeGini,
  calculateLongTailThreshold,
  calculateLongTailExposureRate,
  calculateLongTailClickRate,
  calculateClusterCoverage,
  calculateClusterEntropy,
  calculateUserDiversityScore,
  calculatePositionBias,
  calculatePositionCTR,
  calculateFreshItemExposureRate,
  calculateClusterFairness,
  calculateFairnessDivergence,
  evaluate,
  compareABTest,
  generateEvaluationSummary,

  // Embedding
  l2Norm,
  normalizeVector,
  dotProduct,
  cosineSim,
  euclideanDistance,
  manhattanDistance,
  addVectors,
  subtractVectors,
  scaleVector,
  meanVector,
  batchSimilarity,
  similarityMatrix,
  createLSHIndex,
  addToLSHIndex,
  queryLSH,
  fitPCA,
  transformPCA,
  kmeans,
  elbowMethod,
  EmbeddingCache,
  simpleTextHash,
  averagePairwiseSimilarity,
  DEFAULT_LSH_CONFIG,

  // Culture Points (CP)
  calculateDiminishingMultiplier,
  calculateCPIssuance,
  calculateCPBalance,
  countRecentEvents,
  createMintEntry,
  createStakeRecommendation,
  evaluateStakeOutcome,
  resolveStake,
  detectCPFraud,
  generateCPSummary,
  calculateCPRanking,
  DEFAULT_CP_CONFIG
} from './core'

// Version info
export const ALGORITHM_ID = 'bunkarium-culture-rank'
export const ALGORITHM_VERSION = '1.0.0'
export const CONTRACT_VERSION = '1.0'
