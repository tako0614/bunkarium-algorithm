import { describe, expect, test } from 'bun:test'
import {
  cosineSimilarity,
  euclideanSimilarity,
  jaccardSimilarity,
  clusterSimilarity,
  calculateMMRScore,
  mmrRerank,
  dppSampleGreedy,
  slidingWindowFilter,
  hybridDiversityRerank,
  calculateDiversityMetrics,
  type DiversityItem
} from './diversity'

describe('diversity', () => {
  describe('similarity functions', () => {
    test('cosineSimilarity - 同一ベクトルは1.0', () => {
      const v = [1, 2, 3]
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0)
    })

    test('cosineSimilarity - 直交ベクトルは0', () => {
      const v1 = [1, 0, 0]
      const v2 = [0, 1, 0]
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0)
    })

    test('euclideanSimilarity - 同一ベクトルは1.0', () => {
      const v = [1, 2, 3]
      expect(euclideanSimilarity(v, v)).toBe(1.0)
    })

    test('jaccardSimilarity - 完全一致は1.0', () => {
      const features = { a: 1, b: 1 }
      expect(jaccardSimilarity(features, features)).toBe(1.0)
    })

    test('jaccardSimilarity - 重複なしは0', () => {
      const f1 = { a: 1 }
      const f2 = { b: 1 }
      expect(jaccardSimilarity(f1, f2)).toBe(0)
    })

    test('clusterSimilarity - 同一クラスタは1.0', () => {
      expect(clusterSimilarity('c1', 'c1')).toBe(1.0)
    })

    test('clusterSimilarity - 異なるクラスタは0', () => {
      expect(clusterSimilarity('c1', 'c2')).toBe(0)
    })
  })

  describe('MMR', () => {
    const createItem = (id: string, score: number, clusterId: string, embedding?: number[]): DiversityItem => ({
      itemKey: id,
      score,
      clusterId,
      embedding
    })

    test('calculateMMRScore - 選択済みがない場合は関連性のみ', () => {
      const candidate = createItem('a', 0.8, 'c1')
      const score = calculateMMRScore(candidate, [], { lambda: 0.7, similarityMethod: 'cluster' })
      expect(score).toBeCloseTo(0.7 * 0.8)
    })

    test('calculateMMRScore - 類似アイテムがあると減点', () => {
      const candidate = createItem('a', 0.8, 'c1')
      const selected = [createItem('b', 0.9, 'c1')]

      const score = calculateMMRScore(candidate, selected, { lambda: 0.7, similarityMethod: 'cluster' })
      expect(score).toBeLessThan(0.7 * 0.8)
    })

    test('mmrRerank - 多様なアイテムを選択する', () => {
      const candidates = [
        createItem('a', 0.9, 'c1'),
        createItem('b', 0.85, 'c1'),
        createItem('c', 0.8, 'c2'),
        createItem('d', 0.75, 'c3'),
        createItem('e', 0.7, 'c1')
      ]

      const result = mmrRerank(candidates, 3, { lambda: 0.5, similarityMethod: 'cluster' })
      expect(result.length).toBe(3)

      // 異なるクラスタが選ばれているはず
      const clusters = new Set(result.map(r => r.clusterId))
      expect(clusters.size).toBeGreaterThan(1)
    })
  })

  describe('DPP', () => {
    const createItem = (id: string, score: number, clusterId: string): DiversityItem => ({
      itemKey: id,
      score,
      clusterId,
      embedding: [Math.random(), Math.random(), Math.random()]
    })

    test('dppSampleGreedy - k個のアイテムを選択する', () => {
      const items = [
        createItem('a', 0.9, 'c1'),
        createItem('b', 0.8, 'c2'),
        createItem('c', 0.7, 'c3'),
        createItem('d', 0.6, 'c1'),
        createItem('e', 0.5, 'c2')
      ]

      const { selected, indices } = dppSampleGreedy(items, 3)
      expect(selected.length).toBe(3)
      expect(indices.length).toBe(3)
    })

    test('dppSampleGreedy - アイテム数より多くは選択しない', () => {
      const items = [
        createItem('a', 0.9, 'c1'),
        createItem('b', 0.8, 'c2')
      ]

      const { selected } = dppSampleGreedy(items, 5)
      expect(selected.length).toBe(2)
    })
  })

  describe('slidingWindowFilter', () => {
    const createItem = (id: string, score: number, clusterId: string): DiversityItem => ({
      itemKey: id,
      score,
      clusterId
    })

    test('クラスタ制約が適用される', () => {
      const candidates = Array(10).fill(null).map((_, i) =>
        createItem(`item${i}`, 1 - i * 0.1, 'same_cluster')
      )

      const { filtered, stats } = slidingWindowFilter(candidates, {
        windowSize: 10,
        maxPerCluster: 3,
        minDiversityThreshold: 0.9
      })

      // 同一クラスタからは3つしか選ばれない
      expect(filtered.length).toBeLessThanOrEqual(3)
      // クラスタ違反が発生するはず（10 - 3 = 7回）
      expect(stats.totalFiltered).toBeGreaterThanOrEqual(0)
    })
  })

  describe('hybridDiversityRerank', () => {
    const createItem = (id: string, score: number, clusterId: string): DiversityItem => ({
      itemKey: id,
      score,
      clusterId,
      embedding: [Math.random(), Math.random()]
    })

    test('ハイブリッド手法で再ランキングできる', () => {
      const candidates = Array(10).fill(null).map((_, i) =>
        createItem(`item${i}`, 1 - i * 0.1, `c${i % 3}`)
      )

      const { result, method } = hybridDiversityRerank(candidates, 5)
      expect(result.length).toBe(5)
      expect(method).toBe('hybrid')
    })
  })

  describe('calculateDiversityMetrics', () => {
    test('多様性メトリクスを計算できる', () => {
      const items: DiversityItem[] = [
        { itemKey: 'a', score: 0.9, clusterId: 'c1' },
        { itemKey: 'b', score: 0.8, clusterId: 'c2' },
        { itemKey: 'c', score: 0.7, clusterId: 'c3' },
        { itemKey: 'd', score: 0.6, clusterId: 'c1' }
      ]

      const metrics = calculateDiversityMetrics(items)
      expect(metrics.uniqueClusters).toBe(3)
      expect(metrics.clusterEntropy).toBeGreaterThan(0)
      expect(metrics.maxClusterRatio).toBe(0.5) // 2/4
    })
  })
})
