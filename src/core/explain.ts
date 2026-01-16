import type { Candidate, ReasonCode } from '../types'
import { REASON_DESCRIPTIONS } from '../types'
import { calculateSupportDensity } from './metrics'
import { EXPLAIN_THRESHOLDS } from './defaults'

/**
 * Build reason codes for explain.
 */
export function determineReasonCodes(
  candidate: Candidate,
  clusterCounts: Record<string, number>
): ReasonCode[] {
  const codes: ReasonCode[] = []
  const { features } = candidate
  const thresholds = EXPLAIN_THRESHOLDS

  if (features.cvsComponents.contextSignal >= thresholds.contextSignalThreshold) {
    codes.push('GROWING_CONTEXT')
  }

  if (features.cvsComponents.bridgeSignal >= thresholds.bridgeSignalThreshold) {
    codes.push('BRIDGE_SUCCESS')
  }

  const derivedSupportDensity =
    features.publicMetrics?.supportDensity ??
    (features.qualifiedUniqueViews > 0
      ? calculateSupportDensity(
        features.cvsComponents.likeSignal,
        features.qualifiedUniqueViews
      )
      : undefined)
  if (derivedSupportDensity !== undefined) {
    if (derivedSupportDensity >= thresholds.supportDensityThreshold) {
      codes.push('HIGH_SUPPORT_DENSITY')
    }
  } else if (features.cvsComponents.likeSignal > 1.0) {
    codes.push('HIGH_SUPPORT_DENSITY')
  }

  const clusterExposure = clusterCounts[candidate.clusterId] || 0
  if (clusterExposure < thresholds.newClusterExposureThreshold) {
    codes.push('NEW_IN_CLUSTER')
  }

  if (features.prs && features.prs >= thresholds.prsSimilarityThreshold) {
    switch (features.prsSource) {
      case 'liked':
        codes.push('SIMILAR_TO_LIKED')
        break
      case 'following':
        codes.push('FOLLOWING')
        break
      case 'saved':
      default:
        codes.push('SIMILAR_TO_SAVED')
        break
    }
  }

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
  scoreBreakdown: { prs: number; cvs: number; dns: number; penalty: number },
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
  const total = breakdown.prs + breakdown.cvs + breakdown.dns
  if (total === 0) return { prs: 0, cvs: 0, dns: 0 }

  return {
    prs: Math.round((breakdown.prs / total) * 100),
    cvs: Math.round((breakdown.cvs / total) * 100),
    dns: Math.round((breakdown.dns / total) * 100)
  }
}
