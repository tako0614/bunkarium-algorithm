import { describe, expect, test } from 'bun:test'
import {
  l2Norm,
  normalizeVector,
  dotProduct,
  cosineSim,
  euclideanDistance,
  manhattanDistance,
  meanVector,
  batchSimilarity,
  similarityMatrix,
  createLSHIndex,
  addToLSHIndex,
  queryLSH,
  fitPCA,
  transformPCA,
  kmeans,
  EmbeddingCache,
  simpleTextHash,
  type EmbeddedItem
} from './embedding'

describe('embedding', () => {
  describe('vector operations', () => {
    test('l2Norm - 計算が正しい', () => {
      expect(l2Norm([3, 4])).toBe(5)
      expect(l2Norm([1, 0, 0])).toBe(1)
    })

    test('normalizeVector - 単位ベクトルを返す', () => {
      const v = [3, 4]
      const normalized = normalizeVector(v)
      expect(l2Norm(normalized)).toBeCloseTo(1)
    })

    test('dotProduct - 計算が正しい', () => {
      expect(dotProduct([1, 2, 3], [4, 5, 6])).toBe(32)
    })

    test('cosineSim - 同一ベクトルは1.0', () => {
      const v = [1, 2, 3]
      expect(cosineSim(v, v)).toBeCloseTo(1)
    })

    test('cosineSim - 直交ベクトルは0', () => {
      expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0)
    })

    test('euclideanDistance - 同一点は0', () => {
      const v = [1, 2, 3]
      expect(euclideanDistance(v, v)).toBe(0)
    })

    test('euclideanDistance - 計算が正しい', () => {
      expect(euclideanDistance([0, 0], [3, 4])).toBe(5)
    })

    test('manhattanDistance - 計算が正しい', () => {
      expect(manhattanDistance([0, 0], [3, 4])).toBe(7)
    })

    test('meanVector - 平均を計算する', () => {
      const vectors = [[1, 2], [3, 4], [5, 6]]
      const mean = meanVector(vectors)
      expect(mean).toEqual([3, 4])
    })
  })

  describe('batch similarity', () => {
    const items: EmbeddedItem[] = [
      { id: 'a', embedding: [1, 0, 0] },
      { id: 'b', embedding: [0, 1, 0] },
      { id: 'c', embedding: [0.9, 0.1, 0] }
    ]

    test('最も類似したアイテムが最初に来る', () => {
      const query = [1, 0, 0]
      const results = batchSimilarity(query, items)

      expect(results[0].id).toBe('a')
      expect(results[0].similarity).toBeCloseTo(1)
    })

    test('全てのアイテムを返す', () => {
      const query = [0.5, 0.5, 0]
      const results = batchSimilarity(query, items)

      expect(results.length).toBe(3)
    })
  })

  describe('similarity matrix', () => {
    test('対角要素は1.0', () => {
      const items: EmbeddedItem[] = [
        { id: 'a', embedding: [1, 0] },
        { id: 'b', embedding: [0, 1] }
      ]

      const matrix = similarityMatrix(items)
      expect(matrix[0][0]).toBe(1)
      expect(matrix[1][1]).toBe(1)
    })

    test('対称行列である', () => {
      const items: EmbeddedItem[] = [
        { id: 'a', embedding: [1, 0.5] },
        { id: 'b', embedding: [0.5, 1] }
      ]

      const matrix = similarityMatrix(items)
      expect(matrix[0][1]).toBeCloseTo(matrix[1][0])
    })
  })

  describe('LSH', () => {
    test('インデックスを作成できる', () => {
      const index = createLSHIndex({
        numTables: 5,
        numHashPerTable: 4,
        dimension: 8
      })

      expect(index.config.numTables).toBe(5)
      expect(index.hashTables.length).toBe(5)
    })

    test('超平面の値は有限値に収まる', () => {
      const index = createLSHIndex({
        numTables: 2,
        numHashPerTable: 3,
        dimension: 4,
        seed: 1
      })

      const values = index.hyperplanes.flatMap(table =>
        table.flatMap(plane => plane)
      )
      expect(values.every(Number.isFinite)).toBe(true)
    })

    test('アイテムを追加して検索できる', () => {
      const index = createLSHIndex({
        numTables: 10,
        numHashPerTable: 8,
        dimension: 4
      })

      addToLSHIndex(index, { id: 'a', embedding: [1, 0, 0, 0] })
      addToLSHIndex(index, { id: 'b', embedding: [0, 1, 0, 0] })
      addToLSHIndex(index, { id: 'c', embedding: [0.9, 0.1, 0, 0] })

      const result = queryLSH(index, [1, 0, 0, 0], 2)
      expect(result.neighbors.length).toBeLessThanOrEqual(2)
    })
  })

  describe('PCA', () => {
    test('主成分を抽出できる', () => {
      const data = [
        [1, 2, 3],
        [2, 4, 6],
        [3, 6, 9],
        [4, 8, 12]
      ]

      const model = fitPCA(data, 2)
      expect(model.components.length).toBe(2)
      expect(model.mean.length).toBe(3)
    })

    test('次元削減できる', () => {
      const data = [
        [1, 2, 3, 4],
        [2, 4, 6, 8]
      ]

      const model = fitPCA(data, 2)
      const transformed = transformPCA(data, model)

      expect(transformed[0].length).toBe(2)
    })
  })

  describe('K-means', () => {
    test('クラスタを形成できる', () => {
      const data = [
        [0, 0], [1, 0], [0, 1],  // クラスタ1
        [10, 10], [11, 10], [10, 11]  // クラスタ2
      ]

      const result = kmeans(data, 2)
      expect(result.centroids.length).toBe(2)
      expect(result.assignments.length).toBe(6)
    })

    test('kがデータ数を超える場合はデータ数にクランプする', () => {
      const data = [
        [0, 0],
        [1, 1]
      ]

      const result = kmeans(data, 5)
      expect(result.centroids.length).toBe(2)
      expect(result.assignments.every(a => a >= 0 && a < 2)).toBe(true)
    })

    test('全データが割り当てられる', () => {
      const data = Array(10).fill(null).map(() => [Math.random(), Math.random()])
      const result = kmeans(data, 3)

      expect(result.assignments.length).toBe(10)
      expect(result.assignments.every(a => a >= 0 && a < 3)).toBe(true)
    })

    test('handles duplicate data points without infinite loop', () => {
      // All duplicate points - K-means++ should handle this gracefully
      const data = [
        [1, 1],
        [1, 1],
        [1, 1],
        [1, 1]
      ]

      const result = kmeans(data, 3)
      // With all duplicates, can't have 3 unique centroids
      // Should return at least 1 centroid without hanging
      expect(result.centroids.length).toBeGreaterThanOrEqual(1)
      expect(result.centroids.length).toBeLessThanOrEqual(4)
      expect(result.assignments.length).toBe(4)
    })

    test('handles mixed duplicate and unique points', () => {
      const data = [
        [0, 0],
        [0, 0], // duplicate
        [0, 0], // duplicate
        [10, 10] // unique
      ]

      const result = kmeans(data, 2)
      expect(result.centroids.length).toBe(2)
      expect(result.assignments.length).toBe(4)
    })

    test('handles empty data', () => {
      const result = kmeans([], 3)
      expect(result.centroids.length).toBe(0)
      expect(result.assignments.length).toBe(0)
      expect(result.inertia).toBe(0)
    })

    test('handles k=0', () => {
      const result = kmeans([[1, 2], [3, 4]], 0)
      expect(result.centroids.length).toBe(0)
    })
  })

  describe('EmbeddingCache', () => {
    test('キャッシュに保存・取得できる', () => {
      const cache = new EmbeddingCache(100)

      cache.set('key1', [1, 2, 3])
      expect(cache.get('key1')).toEqual([1, 2, 3])
      expect(cache.has('key1')).toBe(true)
    })

    test('最大サイズを超えると古いエントリが削除される', () => {
      const cache = new EmbeddingCache(2)

      cache.set('key1', [1])
      cache.set('key2', [2])
      cache.set('key3', [3])

      expect(cache.size).toBe(2)
      expect(cache.has('key1')).toBe(false)
      expect(cache.has('key3')).toBe(true)
    })
  })

  describe('simpleTextHash', () => {
    test('テキストから埋め込みを生成できる', () => {
      const embedding = simpleTextHash('hello world', 64)
      expect(embedding.length).toBe(64)
    })

    test('同じテキストは同じ埋め込みを返す', () => {
      const e1 = simpleTextHash('test', 32)
      const e2 = simpleTextHash('test', 32)
      expect(e1).toEqual(e2)
    })

    test('正規化されている', () => {
      const embedding = simpleTextHash('some text', 128)
      const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0))
      expect(norm).toBeCloseTo(1)
    })
  })
})
