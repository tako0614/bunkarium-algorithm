/**
 * Voting Power System
 *
 * 投票力は以下の要素で決定される:
 * 1. Base Weight (発言力配分): w(n) = 1 / n
 *    → どんなにいいねしても総発言力は一定（ゼロサム設計）
 *    → 1回いいね: 1.0 × 1 = 1.0
 *    → 10回いいね: 0.1 × 10 = 1.0
 * 2. CR Multiplier (文化度): アンボンド
 *    → 文化的価値の高いユーザーは総発言力が大きい
 * 3. Rapid Decay (連打逓減): rapidMultiplier = 1 / (1 + β(n-1))
 *    → 30秒内の連打を抑制
 *
 * Final Voting Power = baseWeight × crMultiplier × rapidMultiplier
 * Total Daily Voting Power = CR × 1.0 (一定)
 */

import type { CRConfig } from '../types'
import { getCRMultiplier } from './reputation'
import { DEFAULT_PARAMS } from '../types'
import { LIKE_DECAY_DEFAULTS } from './defaults'

export interface VotingPowerInput {
  /** 24時間内のいいね回数 */
  likeWindowCount: number
  /** ユーザーのCR（Curator Reputation） */
  curatorReputation: number
  /** 30秒内のいいね回数 (optional) */
  recentLikeCount30s?: number
  /** 連打逓減係数β (default: 0.1) */
  rapidDecayBeta?: number
  /** 連打ペナルティ最小値 (default: 0.01) */
  rapidPenaltyMin?: number
  /** CR設定 (optional) */
  crConfig?: CRConfig
}

export interface VotingPowerOutput {
  /** 最終投票力（アンボンド: 上限なし） */
  votingPower: number
  /** 投票力パーセント表示 */
  votingPowerPercent: number
  /** ベース重み (日次逓減後) */
  baseWeight: number
  /** CR倍率（アンボンド: CR値をそのまま使用） */
  crMultiplier: number
  /** 連打ペナルティ乗数 */
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
 *
 * ゼロサム設計: どんなにいいねしても総発言力は一定
 * baseWeight = 1/n により、n回いいねの総発言力 = n × (1/n) = 1.0
 *
 * 連打ペナルティは逓減式: rapidMultiplier = max(min, 1 / (1 + β(n-1)))
 */
export function calculateVotingPower(input: VotingPowerInput): VotingPowerOutput {
  const n = Math.max(1, input.likeWindowCount)

  // Base weight: ゼロサム設計（総発言力一定）
  // w(n) = 1/n → 総発言力 = n × (1/n) = 1.0
  const baseWeight = 1 / n

  // CR multiplier (アンボンド)
  const crMultiplier = getCRMultiplier(input.curatorReputation, input.crConfig)

  // Rapid decay (逓減式、バイナリではない)
  const recentLikeCount30s = input.recentLikeCount30s ?? 0
  const beta = input.rapidDecayBeta ?? LIKE_DECAY_DEFAULTS.rapidDecayBeta
  const rapidMin = input.rapidPenaltyMin ?? LIKE_DECAY_DEFAULTS.rapidPenaltyMin
  // 逓減式: rapidMultiplier = 1 / (1 + β(n-1))
  const rawRapidMultiplier = 1 / (1 + beta * Math.max(0, recentLikeCount30s - 1))
  const rapidMultiplier = Math.max(rapidMin, rawRapidMultiplier)
  // 連打判定は逓減が大きい場合(50%以下)
  const isRapid = rapidMultiplier < 0.5

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
 * CR Level reference
 *
 * CR値は上限なし（アンボンド設計）
 * クラスタ正規化によりゼロサム発言権を実現
 *
 * | CR Range  | Level     | Description          |
 * |-----------|-----------|----------------------|
 * | < 0.5     | explorer  | 探索者               |
 * | 0.5-2.0   | finder    | 発見者               |
 * | 2.0-5.0   | curator   | 目利き               |
 * | >= 5.0    | archiver  | 継承者               |
 */
