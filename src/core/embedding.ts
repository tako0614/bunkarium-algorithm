/**
 * 埋め込みベースの類似度計算
 *
 * - ベクトル正規化
 * - バッチ類似度計算
 * - 近似最近傍探索 (ANN)
 * - 次元削減 (PCA)
 * - クラスタリング (K-means)
 */

// ============================================
// 基本型定義
// ============================================

/** 埋め込みベクトル */
export type Embedding = number[]

/** 埋め込み付きアイテム */
export interface EmbeddedItem {
  id: string
  embedding: Embedding
  metadata?: Record<string, unknown>
}

/** 類似度結果 */
export interface SimilarityResult {
  id: string
  similarity: number
  distance: number
}

/** 近傍探索結果 */
export interface NearestNeighborResult {
  neighbors: SimilarityResult[]
  queryId: string
  searchTime: number
}

// ============================================
// ベクトル演算
// ============================================

/**
 * L2ノルム (ユークリッド長さ) を計算
 */
export function l2Norm(v: Embedding): number {
  let sum = 0
  for (const x of v) {
    sum += x * x
  }
  return Math.sqrt(sum)
}

/**
 * ベクトルを正規化 (単位ベクトルに変換)
 */
export function normalizeVector(v: Embedding): Embedding {
  const norm = l2Norm(v)
  if (norm === 0) return v.map(() => 0)
  return v.map(x => x / norm)
}

/**
 * ドット積を計算
 */
export function dotProduct(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match')
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i]
  }
  return sum
}

/**
 * コサイン類似度を計算
 */
export function cosineSim(a: Embedding, b: Embedding): number {
  const dot = dotProduct(a, b)
  const normA = l2Norm(a)
  const normB = l2Norm(b)
  if (normA === 0 || normB === 0) return 0
  return dot / (normA * normB)
}

/**
 * ユークリッド距離を計算
 */
export function euclideanDistance(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match')
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i]
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * マンハッタン距離 (L1距離) を計算
 */
export function manhattanDistance(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match')
  }
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    sum += Math.abs(a[i] - b[i])
  }
  return sum
}

/**
 * ベクトルの加算
 */
export function addVectors(a: Embedding, b: Embedding): Embedding {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match')
  }
  return a.map((x, i) => x + b[i])
}

/**
 * ベクトルの減算
 */
export function subtractVectors(a: Embedding, b: Embedding): Embedding {
  if (a.length !== b.length) {
    throw new Error('Vector dimensions must match')
  }
  return a.map((x, i) => x - b[i])
}

/**
 * スカラー倍
 */
export function scaleVector(v: Embedding, scalar: number): Embedding {
  return v.map(x => x * scalar)
}

/**
 * 平均ベクトルを計算
 */
export function meanVector(vectors: Embedding[]): Embedding {
  if (vectors.length === 0) return []
  const dim = vectors[0].length
  const sum = Array(dim).fill(0)

  for (const v of vectors) {
    for (let i = 0; i < dim; i++) {
      sum[i] += v[i]
    }
  }

  return sum.map(x => x / vectors.length)
}

// ============================================
// バッチ類似度計算
// ============================================

/**
 * クエリと全アイテムの類似度をバッチ計算
 *
 * @param query - クエリ埋め込み
 * @param items - アイテムリスト
 * @param metric - 距離メトリック
 * @returns 類似度順にソートされた結果
 */
export function batchSimilarity(
  query: Embedding,
  items: EmbeddedItem[],
  metric: 'cosine' | 'euclidean' | 'manhattan' = 'cosine'
): SimilarityResult[] {
  const results: SimilarityResult[] = []

  for (const item of items) {
    let similarity: number
    let distance: number

    switch (metric) {
      case 'cosine':
        similarity = cosineSim(query, item.embedding)
        distance = 1 - similarity
        break
      case 'euclidean':
        distance = euclideanDistance(query, item.embedding)
        similarity = 1 / (1 + distance)
        break
      case 'manhattan':
        distance = manhattanDistance(query, item.embedding)
        similarity = 1 / (1 + distance)
        break
    }

    results.push({
      id: item.id,
      similarity,
      distance
    })
  }

  // 類似度降順でソート
  return results.sort((a, b) => b.similarity - a.similarity)
}

/**
 * 類似度行列を計算
 *
 * @param items - アイテムリスト
 * @param metric - 距離メトリック
 * @returns 類似度行列 [i][j] = items[i]とitems[j]の類似度
 */
export function similarityMatrix(
  items: EmbeddedItem[],
  metric: 'cosine' | 'euclidean' = 'cosine'
): number[][] {
  const n = items.length
  const matrix: number[][] = Array(n).fill(null).map(() => Array(n).fill(0))

  for (let i = 0; i < n; i++) {
    matrix[i][i] = 1.0 // 自分自身との類似度

    for (let j = i + 1; j < n; j++) {
      let sim: number
      if (metric === 'cosine') {
        sim = cosineSim(items[i].embedding, items[j].embedding)
      } else {
        const dist = euclideanDistance(items[i].embedding, items[j].embedding)
        sim = 1 / (1 + dist)
      }

      matrix[i][j] = sim
      matrix[j][i] = sim
    }
  }

  return matrix
}

// ============================================
// 近似最近傍探索 (Locality Sensitive Hashing)
// ============================================

/** LSHインデックス設定 */
export interface LSHConfig {
  /** ハッシュテーブル数 */
  numTables: number
  /** 各テーブルのハッシュ関数数 */
  numHashPerTable: number
  /** 埋め込み次元 */
  dimension: number
  /** ランダムシード */
  seed?: number
}

export const DEFAULT_LSH_CONFIG: LSHConfig = {
  numTables: 10,
  numHashPerTable: 8,
  dimension: 128,
  seed: 42
}

/** LSHインデックス */
export interface LSHIndex {
  config: LSHConfig
  hashTables: Map<string, string[]>[]
  hyperplanes: number[][][]
  items: Map<string, EmbeddedItem>
}

/**
 * 簡易乱数生成器 (シード付き)
 */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff
    return s / 0x7fffffff
  }
}

/**
 * LSHインデックスを作成
 *
 * @param config - LSH設定
 * @returns 空のLSHインデックス
 */
export function createLSHIndex(config: LSHConfig = DEFAULT_LSH_CONFIG): LSHIndex {
  const random = seededRandom(config.seed || 42)

  // ランダム超平面を生成
  const hyperplanes: number[][][] = []
  for (let t = 0; t < config.numTables; t++) {
    const tableHyperplanes: number[][] = []
    for (let h = 0; h < config.numHashPerTable; h++) {
      const plane: number[] = []
      for (let d = 0; d < config.dimension; d++) {
        // 正規分布からサンプリング (Box-Muller)
        const u1 = Math.max(random(), 1e-12)
        const u2 = random()
        const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
        plane.push(normal)
      }
      tableHyperplanes.push(plane)
    }
    hyperplanes.push(tableHyperplanes)
  }

  return {
    config,
    hashTables: Array(config.numTables).fill(null).map(() => new Map()),
    hyperplanes,
    items: new Map()
  }
}

/**
 * ベクトルのLSHハッシュを計算
 */
function computeLSHHash(
  embedding: Embedding,
  hyperplanes: number[][]
): string {
  let hash = ''
  for (const plane of hyperplanes) {
    const dot = dotProduct(embedding, plane)
    hash += dot >= 0 ? '1' : '0'
  }
  return hash
}

/**
 * アイテムをLSHインデックスに追加
 *
 * @param index - LSHインデックス
 * @param item - 追加するアイテム
 */
export function addToLSHIndex(index: LSHIndex, item: EmbeddedItem): void {
  // 次元チェック
  if (item.embedding.length !== index.config.dimension) {
    throw new Error(`Embedding dimension mismatch: expected ${index.config.dimension}, got ${item.embedding.length}`)
  }

  // アイテムを保存
  index.items.set(item.id, item)

  // 各テーブルにハッシュを追加
  for (let t = 0; t < index.config.numTables; t++) {
    const hash = computeLSHHash(item.embedding, index.hyperplanes[t])
    const bucket = index.hashTables[t].get(hash) || []
    bucket.push(item.id)
    index.hashTables[t].set(hash, bucket)
  }
}

/**
 * LSHで近似最近傍を探索
 *
 * @param index - LSHインデックス
 * @param query - クエリ埋め込み
 * @param k - 返す近傍数
 * @returns 近傍探索結果
 */
export function queryLSH(
  index: LSHIndex,
  query: Embedding,
  k: number = 10
): NearestNeighborResult {
  const startTime = Date.now()

  // 候補を収集
  const candidateIds = new Set<string>()

  for (let t = 0; t < index.config.numTables; t++) {
    const hash = computeLSHHash(query, index.hyperplanes[t])
    const bucket = index.hashTables[t].get(hash) || []
    for (const id of bucket) {
      candidateIds.add(id)
    }
  }

  // 候補の類似度を計算
  const results: SimilarityResult[] = []
  for (const id of candidateIds) {
    const item = index.items.get(id)
    if (item) {
      const similarity = cosineSim(query, item.embedding)
      results.push({
        id,
        similarity,
        distance: 1 - similarity
      })
    }
  }

  // ソートしてトップkを返す
  results.sort((a, b) => b.similarity - a.similarity)

  return {
    neighbors: results.slice(0, k),
    queryId: '',
    searchTime: Date.now() - startTime
  }
}

// ============================================
// 次元削減 (PCA)
// ============================================

/** PCAモデル */
export interface PCAModel {
  components: number[][]  // 主成分 (numComponents x originalDim)
  mean: number[]          // 平均ベクトル
  explainedVariance: number[]
}

/**
 * 簡易PCA (Power Iteration法)
 *
 * @param data - データ行列 (n x dim)
 * @param numComponents - 抽出する主成分数
 * @param maxIterations - 最大反復回数
 * @returns PCAモデル
 */
export function fitPCA(
  data: Embedding[],
  numComponents: number,
  maxIterations: number = 100
): PCAModel {
  if (data.length === 0) {
    return { components: [], mean: [], explainedVariance: [] }
  }

  const n = data.length
  const dim = data[0].length

  // 平均を計算
  const mean = meanVector(data)

  // 中心化
  const centered = data.map(v => subtractVectors(v, mean))

  // 共分散行列を計算 (X^T X / n)
  const cov: number[][] = Array(dim).fill(null).map(() => Array(dim).fill(0))
  for (const v of centered) {
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        cov[i][j] += v[i] * v[j]
      }
    }
  }
  for (let i = 0; i < dim; i++) {
    for (let j = 0; j < dim; j++) {
      cov[i][j] /= n
    }
  }

  // Power Iterationで固有ベクトルを抽出
  const components: number[][] = []
  const explainedVariance: number[] = []
  const deflatedCov = cov.map(row => [...row])

  for (let c = 0; c < numComponents; c++) {
    // ランダム初期化
    let vec = Array(dim).fill(0).map(() => Math.random() - 0.5)
    vec = normalizeVector(vec)

    // Power Iteration
    for (let iter = 0; iter < maxIterations; iter++) {
      // Av
      const newVec = Array(dim).fill(0)
      for (let i = 0; i < dim; i++) {
        for (let j = 0; j < dim; j++) {
          newVec[i] += deflatedCov[i][j] * vec[j]
        }
      }

      // 正規化
      const newNorm = l2Norm(newVec)
      if (newNorm < 1e-10) break
      vec = newVec.map(x => x / newNorm)
    }

    components.push(vec)

    // 固有値 (分散) を計算
    let variance = 0
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        variance += deflatedCov[i][j] * vec[i] * vec[j]
      }
    }
    explainedVariance.push(variance)

    // Deflation: A = A - λvv^T
    for (let i = 0; i < dim; i++) {
      for (let j = 0; j < dim; j++) {
        deflatedCov[i][j] -= variance * vec[i] * vec[j]
      }
    }
  }

  return { components, mean, explainedVariance }
}

/**
 * PCAで次元削減
 *
 * @param data - 入力データ
 * @param model - PCAモデル
 * @returns 低次元表現
 */
export function transformPCA(data: Embedding[], model: PCAModel): Embedding[] {
  return data.map(v => {
    const centered = subtractVectors(v, model.mean)
    return model.components.map(component => dotProduct(centered, component))
  })
}

// ============================================
// K-meansクラスタリング
// ============================================

/** K-meansクラスタリング結果 */
export interface KMeansResult {
  centroids: Embedding[]
  assignments: number[]
  iterations: number
  inertia: number
}

/**
 * K-meansクラスタリング
 *
 * @param data - データ
 * @param k - クラスタ数
 * @param maxIterations - 最大反復回数
 * @returns クラスタリング結果
 */
export function kmeans(
  data: Embedding[],
  k: number,
  maxIterations: number = 100
): KMeansResult {
  // Guard: ensure data array is valid and non-empty
  if (data.length === 0 || k <= 0 || !data[0]) {
    return { centroids: [], assignments: [], iterations: 0, inertia: 0 }
  }

  const n = data.length
  const dim = data[0].length
  const clusterCount = Math.min(k, n)

  // 初期中心をランダムに選択 (K-means++)
  const centroids: Embedding[] = []
  const usedIndices = new Set<number>()

  // 最初の中心をランダムに選択
  let firstIdx = Math.floor(Math.random() * n)
  centroids.push([...data[firstIdx]])
  usedIndices.add(firstIdx)

  // 残りの中心を距離に比例した確率で選択
  while (centroids.length < clusterCount) {
    const distances = data.map((point, idx) => {
      if (usedIndices.has(idx)) return 0
      let minDist = Infinity
      for (const c of centroids) {
        const d = euclideanDistance(point, c)
        if (d < minDist) minDist = d
      }
      return minDist * minDist
    })

    const totalDist = distances.reduce((a, b) => a + b, 0)
    let threshold = Math.random() * totalDist
    for (let i = 0; i < n; i++) {
      threshold -= distances[i]
      if (threshold <= 0 && !usedIndices.has(i)) {
        centroids.push([...data[i]])
        usedIndices.add(i)
        break
      }
    }
  }

  // 反復
  let assignments = Array(n).fill(0)
  let iterations = 0

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations = iter + 1

    // 割り当て更新
    const newAssignments = data.map(point => {
      let bestCluster = 0
      let bestDist = Infinity
      for (let c = 0; c < clusterCount; c++) {
        const d = euclideanDistance(point, centroids[c])
        if (d < bestDist) {
          bestDist = d
          bestCluster = c
        }
      }
      return bestCluster
    })

    // 収束チェック
    let changed = false
    for (let i = 0; i < n; i++) {
      if (newAssignments[i] !== assignments[i]) {
        changed = true
        break
      }
    }
    assignments = newAssignments

    if (!changed) break

    // 中心更新
    for (let c = 0; c < clusterCount; c++) {
      const clusterPoints = data.filter((_, i) => assignments[i] === c)
      if (clusterPoints.length > 0) {
        centroids[c] = meanVector(clusterPoints)
      }
    }
  }

  // Inertia (クラスタ内二乗和) を計算
  let inertia = 0
  for (let i = 0; i < n; i++) {
    const d = euclideanDistance(data[i], centroids[assignments[i]])
    inertia += d * d
  }

  return { centroids, assignments, iterations, inertia }
}

/**
 * 最適なクラスタ数を推定 (Elbow法)
 *
 * @param data - データ
 * @param maxK - 最大クラスタ数
 * @returns 各kに対するInertia
 */
export function elbowMethod(
  data: Embedding[],
  maxK: number = 10
): { k: number; inertia: number }[] {
  const results: { k: number; inertia: number }[] = []

  for (let k = 1; k <= Math.min(maxK, data.length); k++) {
    const result = kmeans(data, k)
    results.push({ k, inertia: result.inertia })
  }

  return results
}

// ============================================
// ユーティリティ
// ============================================

/**
 * 埋め込みをキャッシュするヘルパー
 */
export class EmbeddingCache {
  private cache: Map<string, Embedding> = new Map()
  private maxSize: number

  constructor(maxSize: number = 10000) {
    this.maxSize = maxSize
  }

  get(key: string): Embedding | undefined {
    return this.cache.get(key)
  }

  set(key: string, embedding: Embedding): void {
    if (this.cache.size >= this.maxSize) {
      // LRU: 最初のエントリを削除
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }
    this.cache.set(key, embedding)
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

/**
 * テキストの簡易ハッシュ埋め込み (シミュレーション用)
 *
 * 実際の運用では外部の埋め込みモデルを使用する
 *
 * @param text - テキスト
 * @param dim - 次元数
 * @returns 擬似埋め込み
 */
export function simpleTextHash(text: string, dim: number = 128): Embedding {
  const embedding = Array(dim).fill(0)

  // 文字ごとにハッシュを計算
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i)
    const idx = charCode % dim
    embedding[idx] += Math.sin(charCode * 0.1 + i * 0.01)
  }

  // 正規化
  return normalizeVector(embedding)
}

/**
 * 2つの埋め込みセットの平均類似度を計算
 */
export function averagePairwiseSimilarity(
  setA: Embedding[],
  setB: Embedding[]
): number {
  if (setA.length === 0 || setB.length === 0) return 0

  let totalSim = 0
  let count = 0

  for (const a of setA) {
    for (const b of setB) {
      totalSim += cosineSim(a, b)
      count++
    }
  }

  return count > 0 ? totalSim / count : 0
}
