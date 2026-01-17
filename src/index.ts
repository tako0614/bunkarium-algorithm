/**
 * @bunkarium/algorithm
 *
 * Culture-focused ranking utilities.
 */

// Types
export * from './types'

// Core algorithms
export {
  // Like decay
  calculateLikeWeight,
  predictNextLikeWeight,
  calculateWeightedLikeSignal,

  // Metrics
  calculateSupportDensity,
  calculateSupportRate,
  calculateWeightedSupportIndex,
  calculateWeightedSupportRateClamped,
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
  rankSync,

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
  calculateViewWeight,
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
  evaluateOffline,
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
  calculateCPDiminishingMultiplier,
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
export { ALGORITHM_ID, ALGORITHM_VERSION, CONTRACT_VERSION } from './constants'
