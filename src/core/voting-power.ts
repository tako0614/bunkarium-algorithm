/**
 * Voting Power System (v2.1)
 *
 * 投票力は以下の要素で決定される:
 * - CR Multiplier (文化度): アンボンド
 *   → 文化的価値の高いユーザーは発言力が大きい
 *
 * Final Voting Power = CR
 * - 各いいねの重み = CR（一定）
 * - いいね回数による分割なし
 *
 * Rapid Detection (連打検出) は別軸で処理:
 * - 投票力には影響しない
 * - 30秒内の連打を検出しフラグを立てる
 * - アプリケーション側でフィルタリングや警告に使用
 */

import type { CRConfig } from '../types'
import { getCRMultiplier, getCRLevel } from './reputation'
import { LIKE_DECAY_DEFAULTS } from './defaults'

export interface VotingPowerInput {
  /** 24時間内のいいね回数 (統計用) */
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
  /** CR倍率（アンボンド: CR値をそのまま使用） */
  crMultiplier: number
  /** 連打ペナルティ乗数 (情報提供用、投票力には影響しない) */
  rapidPenaltyMultiplier: number
  /** 連打判定 */
  isRapid: boolean
  /** 内訳詳細 */
  breakdown: {
    /** 今日のいいね回数 (統計用) */
    dailyLikeCount: number
    /** CR値 */
    curatorReputation: number
    /** CRレベル */
    crLevel: 'explorer' | 'finder' | 'curator' | 'archiver'
  }
}

/**
 * Calculate voting power based on CR
 *
 * v2.1: votingPower = CR
 * - いいね回数による分割なし
 * - 各いいねが同じCR重みを持つ
 *
 * 連打検出は別軸: isRapidフラグで検出、投票力には影響しない
 */
export function calculateVotingPower(input: VotingPowerInput): VotingPowerOutput {
  const n = Math.max(1, input.likeWindowCount)

  // CR multiplier (アンボンド)
  const crMultiplier = getCRMultiplier(input.curatorReputation, input.crConfig)

  // Rapid detection (連打検出 - 別軸、投票力には影響しない)
  const recentLikeCount30s = input.recentLikeCount30s ?? 0
  const beta = input.rapidDecayBeta ?? LIKE_DECAY_DEFAULTS.rapidDecayBeta
  const rapidMin = input.rapidPenaltyMin ?? LIKE_DECAY_DEFAULTS.rapidPenaltyMin
  const rawRapidMultiplier = 1 / (1 + beta * Math.max(0, recentLikeCount30s - 1))
  const rapidMultiplier = Math.max(rapidMin, rawRapidMultiplier)
  const rapidThreshold = 3
  const isRapid = recentLikeCount30s >= rapidThreshold

  // Final voting power: CR (no /n division)
  const votingPower = crMultiplier
  const votingPowerPercent = Math.min(9999999, Math.round(Math.max(0, votingPower * 100)))

  // CR level
  const crLevel = getCRLevel(input.curatorReputation)

  return {
    votingPower,
    votingPowerPercent,
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

/**
 * Get voting power explanation text
 */
export function getVotingPowerExplanation(output: VotingPowerOutput, locale: 'ja' | 'en' = 'ja'): string {
  const { votingPowerPercent, breakdown, crMultiplier, isRapid } = output

  if (locale === 'ja') {
    const crLevelJa = {
      explorer: '探索者',
      finder: '発見者',
      curator: '目利き',
      archiver: '継承者'
    }[breakdown.crLevel]

    let text = `投票力: ${votingPowerPercent}%\n`
    text += `├─ 文化度: ×${crMultiplier.toFixed(2)} (${crLevelJa})\n`
    text += `└─ 本日${breakdown.dailyLikeCount}件いいね`
    if (isRapid) {
      text += `\n⚠️ 連打検出中`
    }
    return text
  }

  // English
  let text = `Voting Power: ${votingPowerPercent}%\n`
  text += `├─ Cultural: ×${crMultiplier.toFixed(2)} (${breakdown.crLevel})\n`
  text += `└─ ${breakdown.dailyLikeCount} likes today`
  if (isRapid) {
    text += `\n⚠️ Rapid liking detected`
  }
  return text
}

/**
 * Predict voting power for next like
 * Note: Since votingPower = CR, this returns the same as current
 */
export function predictNextVotingPower(
  currentLikeCount: number,
  curatorReputation: number,
  crConfig?: CRConfig
): VotingPowerOutput {
  const safeCurrentCount = Math.max(0, currentLikeCount)
  return calculateVotingPower({
    likeWindowCount: safeCurrentCount + 1,
    curatorReputation,
    crConfig
  })
}

/**
 * CR Level reference
 *
 * CR値は上限なし（アンボンド設計）
 *
 * | CR Range  | Level     | Description          |
 * |-----------|-----------|----------------------|
 * | < 0.5     | explorer  | 探索者               |
 * | 0.5-2.0   | finder    | 発見者               |
 * | 2.0-5.0   | curator   | 目利き               |
 * | >= 5.0    | archiver  | 継承者               |
 */
