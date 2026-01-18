/**
 * Voting Power System
 *
 * 投票力は以下の要素で決定される:
 * 1. Base Weight (日次いいね逓減): w(n) = 1 / (1 + α(n-1))
 * 2. CR Multiplier (文化度): CRm ∈ [0.5, 2.0]
 * 3. Rapid Penalty (連打ペナルティ): 30秒50回で0.1倍
 *
 * Final Voting Power = baseWeight × crMultiplier × rapidPenalty
 */

import type { CRConfig } from '../types'
import { getCRMultiplier } from './reputation'
import { DEFAULT_PARAMS } from '../types'

export interface VotingPowerInput {
  /** 24時間内のいいね回数 */
  likeWindowCount: number
  /** ユーザーのCR（Curator Reputation） */
  curatorReputation: number
  /** 30秒内のいいね回数 (optional) */
  recentLikeCount30s?: number
  /** 逓減係数α (default: 0.05) */
  alpha?: number
  /** 連打判定閾値 (default: 50) */
  rapidPenaltyThreshold?: number
  /** 連打ペナルティ乗数 (default: 0.1) */
  rapidPenaltyMultiplier?: number
  /** CR設定 (optional) */
  crConfig?: CRConfig
}

export interface VotingPowerOutput {
  /** 最終投票力 (0.0～2.0) */
  votingPower: number
  /** 投票力パーセント表示 (0～200%) */
  votingPowerPercent: number
  /** ベース重み (日次逓減後) */
  baseWeight: number
  /** CR倍率 (0.5～2.0) */
  crMultiplier: number
  /** 連打ペナルティ乗数 (0.1～1.0) */
  rapidPenaltyMultiplier: number
  /** 連打判定 */
  isRapid: boolean
  /** 内訳詳細 */
  breakdown: {
    /** 今日のいいね回数 */
    dailyLikeCount: number
    /** CR値 */
    curatorReputation: number
    /** CRレベル */
    crLevel: 'explorer' | 'finder' | 'curator' | 'archiver'
  }
}

/**
 * Calculate voting power based on CR and daily activity
 */
export function calculateVotingPower(input: VotingPowerInput): VotingPowerOutput {
  const n = Math.max(1, input.likeWindowCount)
  const rawAlpha = input.alpha ?? DEFAULT_PARAMS.likeDecayAlpha
  const alpha = Math.max(0.0, Math.min(1.0, rawAlpha))

  // Base weight from daily decay
  const baseWeight = 1 / (1 + alpha * (n - 1))

  // CR multiplier
  const crMultiplier = getCRMultiplier(input.curatorReputation, input.crConfig)

  // Rapid penalty
  const recentLikeCount30s = input.recentLikeCount30s ?? 0
  const rapidThreshold = input.rapidPenaltyThreshold ?? DEFAULT_PARAMS.rapidPenaltyThreshold
  const rapidPenalty = input.rapidPenaltyMultiplier ?? DEFAULT_PARAMS.rapidPenaltyMultiplier
  const isRapid = recentLikeCount30s >= rapidThreshold
  const rapidMultiplier = isRapid ? rapidPenalty : 1.0

  // Final voting power
  const votingPower = baseWeight * crMultiplier * rapidMultiplier
  const votingPowerPercent = Math.round(votingPower * 100)

  // CR level
  const crLevel = getCRLevel(input.curatorReputation)

  return {
    votingPower,
    votingPowerPercent,
    baseWeight,
    crMultiplier,
    rapidPenaltyMultiplier: rapidMultiplier,
    isRapid,
    breakdown: {
      dailyLikeCount: n,
      curatorReputation: input.curatorReputation,
      crLevel
    }
  }
}

function getCRLevel(cr: number): 'explorer' | 'finder' | 'curator' | 'archiver' {
  if (cr < 0.5) return 'explorer'
  if (cr < 2.0) return 'finder'
  if (cr < 5.0) return 'curator'
  return 'archiver'
}

/**
 * Get voting power explanation text
 */
export function getVotingPowerExplanation(output: VotingPowerOutput, locale: 'ja' | 'en' = 'ja'): string {
  const { votingPowerPercent, breakdown, crMultiplier, baseWeight, isRapid } = output

  if (locale === 'ja') {
    const crLevelJa = {
      explorer: '探索者',
      finder: '発見者',
      curator: '目利き',
      archiver: '継承者'
    }[breakdown.crLevel]

    let text = `投票力: ${votingPowerPercent}%\n`
    text += `├─ 基礎: ${Math.round(baseWeight * 100)}% (本日${breakdown.dailyLikeCount}件目)\n`
    text += `├─ 文化度: ×${crMultiplier.toFixed(2)} (${crLevelJa})\n`
    if (isRapid) {
      text += `└─ 連打ペナルティ適用中`
    }
    return text
  }

  // English
  let text = `Voting Power: ${votingPowerPercent}%\n`
  text += `├─ Base: ${Math.round(baseWeight * 100)}% (${breakdown.dailyLikeCount} likes today)\n`
  text += `├─ Cultural: ×${crMultiplier.toFixed(2)} (${breakdown.crLevel})\n`
  if (isRapid) {
    text += `└─ Rapid penalty applied`
  }
  return text
}

/**
 * Predict voting power for next like
 */
export function predictNextVotingPower(
  currentLikeCount: number,
  curatorReputation: number,
  crConfig?: CRConfig
): VotingPowerOutput {
  return calculateVotingPower({
    likeWindowCount: currentLikeCount + 1,
    curatorReputation,
    crConfig
  })
}

/**
 * CR Multiplier table for reference (actual computed values)
 *
 * Formula: x = log10(CR/0.1) / log10(100), CRm = 0.1 + 9.9 * x
 * Range: [0.1, 10.0]
 *
 * | CR    | Multiplier | Level     |
 * |-------|------------|-----------|
 * | 0.1   | 0.10x      | explorer  |
 * | 0.5   | 3.56x      | finder    |
 * | 1.0   | 5.05x      | finder    |
 * | 2.0   | 6.54x      | curator   |
 * | 5.0   | 8.52x      | archiver  |
 * | 10.0  | 10.00x     | archiver  |
 */
export const CR_MULTIPLIER_TABLE = [
  { cr: 0.1, multiplier: 0.1, level: 'explorer' },
  { cr: 0.5, multiplier: 3.56, level: 'finder' },
  { cr: 1.0, multiplier: 5.05, level: 'finder' },
  { cr: 2.0, multiplier: 6.54, level: 'curator' },
  { cr: 5.0, multiplier: 8.52, level: 'archiver' },
  { cr: 10.0, multiplier: 10.0, level: 'archiver' }
] as const
