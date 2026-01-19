import type { Candidate, ScoreBreakdown, CVSComponents } from '../types'
import { SCORING_DEFAULTS } from './defaults'
import { round9 } from './utils'

/**
 * Community-First Scoring System
 *
 * シンプルな2要素スコアリング:
 * - PRS (Personal Relevance Score): フォロー関係・親密度
 * - CVS (Cultural Value Score): 文化的価値（CR/CP由来）
 *
 * 多様性スコア(DNS)は削除 - 多様性は結果であってアルゴリズムには含まない
 */

/** CVS component weights */
export interface CVSWeights {
  like: number
  context: number
  collection: number
  bridge: number
  sustain: number
}

export const DEFAULT_CVS_WEIGHTS: CVSWeights = {
  like: SCORING_DEFAULTS.cvsComponentWeights.like,
  context: SCORING_DEFAULTS.cvsComponentWeights.context,
  collection: SCORING_DEFAULTS.cvsComponentWeights.collection,
  bridge: SCORING_DEFAULTS.cvsComponentWeights.bridge,
  sustain: SCORING_DEFAULTS.cvsComponentWeights.sustain
}

/**
 * Cultural Value Score
 * CVS = a*like + b*context + d*collection + e*bridge + f*sustain
 *
 * 文化的価値を数値化:
 * - like: いいねの質（重み付き）
 * - context: コンテキスト品質（作品引用など）
 * - collection: コレクション価値
 * - bridge: クラスタ間ブリッジ貢献
 * - sustain: 持続的価値
 */
export function calculateCVS(
  components: CVSComponents,
  weights: CVSWeights = DEFAULT_CVS_WEIGHTS
): number {
  const cvs =
    weights.like * components.like +
    weights.context * components.context +
    weights.collection * components.collection +
    weights.bridge * components.bridge +
    weights.sustain * components.sustain
  // アンボンド: 負の値のみ防止、上限なし
  return Math.max(0, cvs)
}

/**
 * Spam/Quality penalties
 * アンボンド: 上限なし、負の値のみ防止
 */
export function calculatePenalty(candidate: Candidate): number {
  let penalty = 0

  if (candidate.qualityFlags.spamSuspect) {
    penalty += 0.5
  }

  // 負の値のみ防止、上限なし
  return Math.max(0, penalty)
}

/** Simple score weights (PRS + CVS only, no DNS) */
export interface SimpleScoreWeights {
  prs: number
  cvs: number
}

export const DEFAULT_SIMPLE_WEIGHTS: SimpleScoreWeights = {
  prs: SCORING_DEFAULTS.prsWeight,
  cvs: SCORING_DEFAULTS.cvsWeight
}

/**
 * Community-First Score Calculation
 *
 * FinalScore = w_prs * PRS + w_cvs * CVS - penalty
 *
 * シンプルな2要素:
 * - PRS: フォロー関係スコア（親密度、相互フォローなど）
 * - CVS: 文化的価値スコア（CR/CP由来の質評価）
 *
 * DNSは削除 - 多様性は結果であってアルゴリズムには含まない
 */
export function calculateScore(
  candidate: Candidate,
  weights: SimpleScoreWeights = DEFAULT_SIMPLE_WEIGHTS
): { finalScore: number; breakdown: ScoreBreakdown } {
  // PRS: Personal Relevance Score（フォロー関係など）
  const prs = Math.max(0, candidate.features.prs ?? 0)

  // CVS: Cultural Value Score（文化的価値）
  const cvs = calculateCVS(candidate.features.cvsComponents)

  // Penalty: スパム等のペナルティ
  const penalty = calculatePenalty(candidate)

  // Final Score = PRS + CVS - penalty（重み付き）
  const rawFinalScore =
    weights.prs * prs +
    weights.cvs * cvs -
    penalty

  // 9桁精度で丸める（決定性のため）
  const finalScore = round9(rawFinalScore)

  return {
    finalScore,
    breakdown: {
      prs,
      cvs,
      dns: 0,  // 後方互換性のため0を返す
      penalty,
      finalScore
    }
  }
}

/**
 * @deprecated Use calculateScore instead
 * 後方互換性のために残す（DNSは常に0）
 */
export function calculateMixedScore(
  candidate: Candidate,
  _recentClusterExposures: Record<string, number>,
  _nowTs: number,
  weights?: { prs: number; cvs: number; dns?: number },
  _clusterNoveltyFactor?: number,
  _timeHalfLifeHours?: number
): { finalScore: number; breakdown: ScoreBreakdown } {
  const simpleWeights: SimpleScoreWeights = {
    prs: weights?.prs ?? DEFAULT_SIMPLE_WEIGHTS.prs,
    cvs: weights?.cvs ?? DEFAULT_SIMPLE_WEIGHTS.cvs
  }
  return calculateScore(candidate, simpleWeights)
}

/**
 * @deprecated DNS is removed from the algorithm
 * 後方互換性のために残す（常に0を返す）
 */
export function calculateDNS(
  _candidate: Candidate,
  _recentClusterExposures: Record<string, number>,
  _nowTs: number,
  _clusterNoveltyFactor?: number,
  _timeHalfLifeHours?: number
): number {
  return 0
}
