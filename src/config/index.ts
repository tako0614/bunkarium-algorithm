/**
 * Centralized Configuration Module
 *
 * All algorithm and backend constants are defined here for easy tuning.
 * These values control the behavior of the cultural amplification engine,
 * discovery evaluation, feed composition, and content quality assessment.
 */

/**
 * Soft caps for various metrics to prevent extreme inflation
 * Values below cap are unchanged, values above grow logarithmically
 */
export const SOFT_CAPS = {
  reach: 10.0,
  growth: 5.0,
  cpMultiplier: 5.0,
  discoveryValue: 15.0,
  rarity: 100.0,
} as const;

/**
 * Time windows for various calculations (in milliseconds)
 */
export const TIME_WINDOWS = {
  likeWindow24h: 24 * 60 * 60 * 1000,
  rapidWindow30s: 30 * 1000,
  clusterExposure7d: 7 * 24 * 60 * 60 * 1000,
  cpEarning90d: 90 * 24 * 60 * 60 * 1000,
  discoveryDelay24h: 24 * 60 * 60 * 1000,
  staleJobTimeout: 11 * 60 * 1000,
} as const;

/**
 * Discovery evaluation configuration
 * Controls how early discovery of content is rewarded
 */
export const DISCOVERY_CONFIG = {
  minGrowthThreshold: 0.3,
  minCurrentPopularity: 0.5,
  crWeight: 0.1,
  epsilon: 0.01,
} as const;

/**
 * Feed composition configuration
 * Controls the ratio of content sources in the For You feed
 */
export const FEED_CONFIG = {
  defaultFollowingRatio: 0.70,
  defaultClusterRatio: 0.30,
  followingWindowDays: 7,
  clusterWindowDays: 3,
  clusterMinCRScore: 0.5,
  maxActiveClusters: 5,
} as const;

/**
 * Content quality assessment limits
 * Controls content length evaluation and quality scoring
 */
export const CONTENT_LIMITS = {
  maxContentLength: 100000,
  idealContentLength: 300,
  contentSigma: 200,
} as const;
