import type { Candidate, ReasonCode, REASON_DESCRIPTIONS } from '../types'

/**
 * 理由コード生成（Explain）
 *
 * "Why this?"（露出理由）をログ化し、UIに表示する
 */

/**
 * 理由コードを決定
 *
 * @param candidate - 候補アイテム
 * @param clusterCounts - クラスタ露出カウント
 * @returns 理由コード一覧
 */
export function determineReasonCodes(
  candidate: Candidate,
  clusterCounts: Record<string, number>
): ReasonCode[] {
  const codes: ReasonCode[] = []
  const { features } = candidate

  // CVSコンポーネントに基づく理由
  if (features.cvsComponents.contextSignal > 0.5) {
    codes.push('GROWING_CONTEXT')
  }

  if (features.cvsComponents.bridgeSignal > 0.5) {
    codes.push('BRIDGE_SUCCESS')
  }

  // 支持密度が高い
  if (features.cvsComponents.likeSignal > 1.0) {
    codes.push('HIGH_SUPPORT_DENSITY')
  }

  // クラスタの新規性
  const clusterExposure = clusterCounts[candidate.clusterId] || 0
  if (clusterExposure === 0) {
    codes.push('NEW_IN_CLUSTER')
  }

  // PRSが高い場合（個人適合）
  if (features.prs && features.prs > 0.7) {
    codes.push('SIMILAR_TO_SAVED')
  }

  // 最低1つは理由を付ける
  if (codes.length === 0) {
    codes.push('TRENDING_IN_CLUSTER')
  }

  return codes
}

/**
 * 理由コードを人間が読める文言に変換
 *
 * @param codes - 理由コード一覧
 * @returns 表示用テキスト一覧
 */
export function formatReasonCodes(codes: ReasonCode[]): string[] {
  const descriptions: Record<ReasonCode, string> = {
    SIMILAR_TO_SAVED: 'あなたの保存した作品に近い',
    SIMILAR_TO_LIKED: 'あなたが支持した作品に近い',
    FOLLOWING: 'フォロー中のユーザーから',
    GROWING_CONTEXT: '注釈が増えている',
    BRIDGE_SUCCESS: '翻訳ブリッジで到達',
    DIVERSITY_SLOT: '多様性枠',
    EXPLORATION: '新しいシーンから',
    HIGH_SUPPORT_DENSITY: '支持密度が高い',
    TRENDING_IN_CLUSTER: 'シーン内で注目',
    NEW_IN_CLUSTER: 'シーンの新着',
    EDITORIAL: '編集枠'
  }

  return codes.map(code => descriptions[code])
}

/**
 * 詳細な説明を生成（デバッグ/透明性用）
 *
 * @param candidate - 候補アイテム
 * @param scoreBreakdown - スコア内訳
 * @param reasonCodes - 理由コード
 * @returns 詳細説明
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
      description: '個人嗜好適合スコア'
    },
    {
      name: 'CVS',
      value: scoreBreakdown.cvs,
      description: '文化価値スコア'
    },
    {
      name: 'DNS',
      value: scoreBreakdown.dns,
      description: '多様性・新規性スコア'
    }
  ]

  if (scoreBreakdown.penalty > 0) {
    factors.push({
      name: 'Penalty',
      value: -scoreBreakdown.penalty,
      description: 'ペナルティ（類似度/品質）'
    })
  }

  const humanReadable = formatReasonCodes(reasonCodes)

  // 最も寄与が大きい要因を特定
  const maxFactor = factors.reduce((max, f) =>
    Math.abs(f.value) > Math.abs(max.value) ? f : max
  )

  const summary = `${maxFactor.description}が主な要因です`

  return {
    summary,
    factors,
    humanReadable
  }
}

/**
 * スコア寄与率を計算
 *
 * @param breakdown - スコア内訳
 * @returns 各要素の寄与率（%）
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
