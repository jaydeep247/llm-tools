/**
 * Embedding Service
 * Provides cosine similarity calculation and vector operations
 */

/**
 * Calculate cosine similarity between two vectors
 * Formula: dot_product(a, b) / (magnitude(a) * magnitude(b))
 * Result range: -1 to 1 (typically 0 to 1 for normalized vectors)
 */
export function cosineSimilarity(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length === 0 || vectorB.length === 0) {
    return 0;
  }

  if (vectorA.length !== vectorB.length) {
    // Pad vectors to same length with zeros
    const maxLen = Math.max(vectorA.length, vectorB.length);
    const a = new Array(maxLen).fill(0);
    const b = new Array(maxLen).fill(0);
    
    for (let i = 0; i < vectorA.length; i++) a[i] = vectorA[i];
    for (let i = 0; i < vectorB.length; i++) b[i] = vectorB[i];

    return cosineSimilarity(a, b);
  }

  // Calculate dot product
  let dotProduct = 0;
  for (let i = 0; i < vectorA.length; i++) {
    dotProduct += vectorA[i] * vectorB[i];
  }

  // Calculate magnitudes
  let magnitudeA = 0;
  let magnitudeB = 0;
  for (let i = 0; i < vectorA.length; i++) {
    magnitudeA += vectorA[i] * vectorA[i];
    magnitudeB += vectorB[i] * vectorB[i];
  }

  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);

  // Avoid division by zero
  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Calculate Euclidean distance between two vectors
 */
export function euclideanDistance(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    const diff = vectorA[i] - vectorB[i];
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate dot product of two vectors
 */
export function dotProduct(vectorA: number[], vectorB: number[]): number {
  if (vectorA.length !== vectorB.length) {
    throw new Error('Vectors must have same length');
  }

  let sum = 0;
  for (let i = 0; i < vectorA.length; i++) {
    sum += vectorA[i] * vectorB[i];
  }

  return sum;
}

/**
 * Calculate magnitude (length) of a vector
 */
export function magnitude(vector: number[]): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    sum += vector[i] * vector[i];
  }
  return Math.sqrt(sum);
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(vector: number[]): number[] {
  const mag = magnitude(vector);
  if (mag === 0) return vector;
  return vector.map(val => val / mag);
}

/**
 * Calculate average vector from multiple vectors
 * Useful for finding centroid of vector cluster
 */
export function averageVector(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  if (vectors.length === 1) return [...vectors[0]];

  const result = new Array(vectors[0].length).fill(0);
  
  vectors.forEach(vec => {
    for (let i = 0; i < vec.length; i++) {
      result[i] += vec[i];
    }
  });

  for (let i = 0; i < result.length; i++) {
    result[i] /= vectors.length;
  }

  return result;
}
