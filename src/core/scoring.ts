import type {
  Candidate,
  ScoreWeights,
  ScoreBreakdown,
  CVSComponents,
  DEFAULT_PARAMS
} from '../types'

/**
 * スコアリング
 *
 * 3つのスコアを分離して保持:
 * - PRS: Personal Relevance Score（個人嗜好適合）
 * - CVS: Cultural Value Score（文化貢献由来価値）
 * - DNS: Diversity/Novelty Score（多様性・新規性）
 */

/** CVS計算用の重み（運用で調整可能） */
export interface CVSWeights {
  like: number
  context: number
  collection: number
  bridge: number
  sustain: number
}

export const DEFAULT_CVS_WEIGHTS: CVSWeights = {
  like: 1.0,
  context: 1.5,
  collection: 1.2,
  bridge: 2.0,
  sustain: 0.5
}

/**
 * CVS（Cultural Value Score）を計算
 *
 * CVS = a*LikeSignal + b*ContextSignal + d*CollectionSignal + e*BridgeSignal + f*SustainSignal
 *
 * @param components - CVSコンポーネント
 * @param weights - 重み（省略時はデフォルト）
 * @returns CVSスコア
 */
export function calculateCVS(
  components: CVSComponents,
  weights: CVSWeights = DEFAULT_CVS_WEIGHTS
): number {
  return (
    weights.like * components.likeSignal +
    weights.context * components.contextSignal +
    weights.collection * components.collectionSignal +
    weights.bridge * components.bridgeSignal +
    weights.sustain * components.sustainSignal
  )
}

/**
 * DNS（Diversity/Novelty Score）を計算
 *
 * @param candidate - 候補アイテム
 * @param recentClusterExposures - 直近のクラスタ露出
 * @param nowTs - 現在時刻
 * @returns DNSスコア
 */
export function calculateDNS(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  nowTs: number
): number {
  let score = 0

  // クラスタの新規性（直近で見ていないクラスタほど高い）
  const clusterExposureCount = recentClusterExposures[candidate.clusterId] || 0
  const clusterNovelty = 1 / (1 + clusterExposureCount * 0.2)
  score += clusterNovelty * 0.6

  // 時間的新規性（新しいコンテンツほど高い）
  const ageHours = (nowTs - candidate.createdAt) / (1000 * 60 * 60)
  const timeNovelty = Math.exp(-ageHours / 168) // 7日で半減
  score += timeNovelty * 0.4

  return score
}

/**
 * ペナルティを計算
 *
 * @param candidate - 候補アイテム
 * @param existingItems - 既に選択されたアイテム
 * @returns ペナルティ値
 */
export function calculatePenalty(
  candidate: Candidate,
  existingItems: Candidate[]
): number {
  let penalty = 0

  // 品質フラグによるペナルティ
  if (candidate.features.qualityFlags.spamSuspect) {
    penalty += 0.5
  }
  if (candidate.features.qualityFlags.nsfw) {
    penalty += 0.1 // NSFWは軽いペナルティ（フィルタは別で）
  }

  // 類似度ペナルティ（MMR相当）
  if (candidate.features.embedding && existingItems.length > 0) {
    const maxSimilarity = existingItems.reduce((max, item) => {
      if (!item.features.embedding) return max
      const sim = cosineSimilarity(candidate.features.embedding!, item.features.embedding)
      return Math.max(max, sim)
    }, 0)
    penalty += maxSimilarity * 0.3
  }

  return penalty
}

/**
 * 混合スコアを計算
 *
 * Score = λprs*PRS + λcvs*CVS + λdns*DNS - Penalty
 *
 * @param candidate - 候補アイテム
 * @param userState - ユーザー状態
 * @param existingItems - 既に選択されたアイテム
 * @param nowTs - 現在時刻
 * @param weights - スコア重み
 * @returns スコア内訳と最終スコア
 */
export function calculateMixedScore(
  candidate: Candidate,
  recentClusterExposures: Record<string, number>,
  existingItems: Candidate[],
  nowTs: number,
  weights: ScoreWeights = { prs: 0.55, cvs: 0.25, dns: 0.20 }
): { finalScore: number; breakdown: ScoreBreakdown } {
  // PRS（事前計算済みを使用、なければ0）
  const prs = candidate.features.prs ?? 0

  // CVS
  const cvs = calculateCVS(candidate.features.cvsComponents)

  // DNS
  const dns = calculateDNS(candidate, recentClusterExposures, nowTs)

  // Penalty
  const penalty = calculatePenalty(candidate, existingItems)

  // 混合スコア
  const finalScore =
    weights.prs * prs +
    weights.cvs * cvs +
    weights.dns * dns -
    penalty

  return {
    finalScore,
    breakdown: { prs, cvs, dns, penalty }
  }
}

/**
 * コサイン類似度を計算
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  if (denominator === 0) return 0

  return dotProduct / denominator
}
