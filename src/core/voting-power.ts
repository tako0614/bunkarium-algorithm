/**
 * Voting Power System (v2.0)
 *
 * 投票力は以下の要素で決定される:
 * 1. Base Weight (発言力配分): w(n) = 1 / n
 *    → どんなにいいねしても総発言力は一定（ゼロサム設計）
 *    → 1回いいね: 1.0 × 1 = 1.0
 *    → 10回いいね: 0.1 × 10 = 1.0
 * 2. CR Multiplier (文化度): アンボンド
 *    → 文化的価値の高いユーザーは総発言力が大きい
 *
 * Final Voting Power = baseWeight × crMultiplier = CR / n
 * Total Daily Voting Power = CR × 1.0 (一定、ゼロサム)
 *
 * Rapid Detection (連打検出) は別軸で処理:
 * - ゼロサム計算には影響しない
 * - 30秒内の連打を検出しフラグを立てる
 * - アプリケーション側でフィルタリングや警告に使用
 */

import type { CRConfig } from '../types'
import { getCRMultiplier, getCRLevel } from './reputation'
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
 * votingPower = CR / n
 * 総発言力 = n × (CR/n) = CR (一定)
 *
 * 連打検出は別軸: isRapidフラグで検出、投票力には影響しない
 */
export function calculateVotingPower(input: VotingPowerInput): VotingPowerOutput {
  const n = Math.max(1, input.likeWindowCount)

  // Base weight: ゼロサム設計（総発言力一定）
  // w(n) = 1/n → 総発言力 = n × (1/n) = 1.0
  const baseWeight = 1 / n

  // CR multiplier (アンボンド)
  const crMultiplier = getCRMultiplier(input.curatorReputation, input.crConfig)

  // Rapid detection (連打検出 - 別軸、投票力には影響しない)
  // 30秒内の連打を検出しフラグを立てる
  const recentLikeCount30s = input.recentLikeCount30s ?? 0
  const beta = input.rapidDecayBeta ?? LIKE_DECAY_DEFAULTS.rapidDecayBeta
  const rapidMin = input.rapidPenaltyMin ?? LIKE_DECAY_DEFAULTS.rapidPenaltyMin
  // 連打レベル計算（情報提供用）
  // Formula: 1 / (1 + β × (n - 1))
  // With β=0.1: n=2→0.91, n=6→0.67, n=11→0.50
  // With β=0.5: n=2→0.67, n=3→0.50, n=5→0.33
  const rawRapidMultiplier = 1 / (1 + beta * Math.max(0, recentLikeCount30s - 1))
  const rapidMultiplier = Math.max(rapidMin, rawRapidMultiplier)
  // 連打判定: 3回以上の30秒内いいねで警告（閾値ベースに変更）
  // 旧: rapidMultiplier < 0.5 (beta=0.1では11回必要で実用的でない)
  // 新: 直接回数で判定（より明確で調整しやすい）
  const rapidThreshold = 3 // 30秒内に3回以上で連打と判定
  const isRapid = recentLikeCount30s >= rapidThreshold

  // Final voting power: CR / n (ゼロサム設計を維持)
  // rapidMultiplierは投票力に影響しない（別軸で処理）
  const votingPower = baseWeight * crMultiplier
  // Guard: prevent overflow with extremely large CR values
  // Cap at 9999999% to avoid Infinity/NaN from Math.round
  const votingPowerPercent = Math.min(9999999, Math.round(Math.max(0, votingPower * 100)))

  // CR level
  const crLevel = getCRLevel(input.curatorReputation)

  return {
    votingPower,
    votingPowerPercent,
    baseWeight,
    crMultiplier,
    rapidPenaltyMultiplier: rapidMultiplier, // 情報提供用（投票力には非適用）
    isRapid,
    breakdown: {
      dailyLikeCount: n,
      curatorReputation: input.curatorReputation,
      crLevel
    }
  }
}

// getCRLevel is now imported from ./reputation to avoid duplication

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
  // Guard: ensure currentLikeCount is non-negative
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
 * クラスタ正規化によりゼロサム発言権を実現
 *
 * | CR Range  | Level     | Description          |
 * |-----------|-----------|----------------------|
 * | < 0.5     | explorer  | 探索者               |
 * | 0.5-2.0   | finder    | 発見者               |
 * | 2.0-5.0   | curator   | 目利き               |
 * | >= 5.0    | archiver  | 継承者               |
 */
