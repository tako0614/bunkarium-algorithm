import type { Candidate, ReasonCode, ExplainThresholds } from '../types'
import { REASON_DESCRIPTIONS, DEFAULT_EXPLAIN_THRESHOLDS } from '../types'

/**
 * 理由コード判定（algorithm.md仕様）
 *
 * 優先順位:
 * 1) GROWING_CONTEXT (context >= contextHigh)
 * 2) BRIDGE_SUCCESS (bridge >= bridgeHigh)
 * 3) HIGH_SUPPORT_DENSITY (supportDensity >= supportDensityHigh)
 * 4) NEW_IN_CLUSTER (exposure <= newClusterExposureMax)
 * 5) SIMILAR_TO_SAVED / SIMILAR_TO_LIKED / FOLLOWING (prs >= prsSimilarityMin)
 * 6) TRENDING_IN_CLUSTER (fallback)
 * 7) DIVERSITY_SLOT / EXPLORATION (added by reranking)
 */
export function determineReasonCodes(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  thresholds: ExplainThresholds = DEFAULT_EXPLAIN_THRESHOLDS
): ReasonCode[] {
  const codes: ReasonCode[] = []
  const { features } = candidate

  // 1) GROWING_CONTEXT
  if (features.cvsComponents.context >= thresholds.contextHigh) {
    codes.push('GROWING_CONTEXT')
  }

  // 2) BRIDGE_SUCCESS
  if (features.cvsComponents.bridge >= thresholds.bridgeHigh) {
    codes.push('BRIDGE_SUCCESS')
  }

  // 3) HIGH_SUPPORT_DENSITY
  const supportDensity = features.publicMetricsHint?.supportDensity
  if (supportDensity !== undefined && supportDensity >= thresholds.supportDensityHigh) {
    codes.push('HIGH_SUPPORT_DENSITY')
  }

  // 4) NEW_IN_CLUSTER
  const clusterExposure = recentClusterExposures[candidate.clusterId] ?? 0
  if (clusterExposure <= thresholds.newClusterExposureMax) {
    codes.push('NEW_IN_CLUSTER')
  }

  // 5) SIMILAR_TO_* / FOLLOWING
  if (features.prs !== undefined && features.prs >= thresholds.prsSimilarityMin) {
    switch (features.prsSource) {
      case 'saved':
        codes.push('SIMILAR_TO_SAVED')
        break
      case 'liked':
        codes.push('SIMILAR_TO_LIKED')
        break
      case 'following':
        codes.push('FOLLOWING')
        break
    }
  }

  // 6) TRENDING_IN_CLUSTER (fallback)
  if (codes.length === 0) {
    codes.push('TRENDING_IN_CLUSTER')
  }

  return codes
}

/**
 * Convert reason codes to labels.
 */
export function formatReasonCodes(codes: ReasonCode[]): string[] {
  return codes.map(code => REASON_DESCRIPTIONS[code])
}

/**
 * Generate a detailed explanation for debug/UX.
 */
export function generateDetailedExplanation(
  candidate: Candidate,
  scoreBreakdown: { prs: number; cvs: number; dns: number; penalty: number; finalScore: number },
  reasonCodes: ReasonCode[]
): {
  summary: string
  factors: Array<{ name: string; value: number; description: string }>
  humanReadable: string[]
} {
  const factors = [
    {
      name: 'PRS',
      value: scoreBreakdown.prs,
      description: 'Personal relevance'
    },
    {
      name: 'CVS',
      value: scoreBreakdown.cvs,
      description: 'Cultural value'
    },
    {
      name: 'DNS',
      value: scoreBreakdown.dns,
      description: 'Diversity/novelty'
    }
  ]

  if (scoreBreakdown.penalty > 0) {
    factors.push({
      name: 'Penalty',
      value: -scoreBreakdown.penalty,
      description: 'Quality penalties'
    })
  }

  const humanReadable = formatReasonCodes(reasonCodes)

  const maxFactor = factors.reduce((max, f) =>
    Math.abs(f.value) > Math.abs(max.value) ? f : max
  )

  const summary = `${maxFactor.description} is the main factor.`

  return {
    summary,
    factors,
    humanReadable
  }
}

/**
 * Contribution rates for score factors.
 */
export function calculateContributionRates(
  breakdown: { prs: number; cvs: number; dns: number; penalty: number }
): { prs: number; cvs: number; dns: number } {
  // Guard: validate inputs are finite numbers
  const safePrs = Number.isFinite(breakdown.prs) ? breakdown.prs : 0
  const safeCvs = Number.isFinite(breakdown.cvs) ? breakdown.cvs : 0
  const safeDns = Number.isFinite(breakdown.dns) ? breakdown.dns : 0

  const total = safePrs + safeCvs + safeDns
  if (total === 0) return { prs: 0, cvs: 0, dns: 0 }

  return {
    prs: Math.round((safePrs / total) * 100),
    cvs: Math.round((safeCvs / total) * 100),
    dns: Math.round((safeDns / total) * 100)
  }
}
