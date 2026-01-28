/**
 * Vector Calculator
 * Converts normalized content into semantic vectors using TF-IDF
 * This lightweight approach doesn't require external ML models
 */

import { SemanticVector } from './types.js';

/**
 * Build vocabulary from all documents
 */
function buildVocabulary(documents: string[]): Map<string, number> {
  const vocab = new Map<string, number>();
  let index = 0;

  documents.forEach(doc => {
    const words = doc.split(/\s+/).filter(w => w.length > 0);
    const uniqueWords = new Set(words);

    uniqueWords.forEach(word => {
      if (!vocab.has(word)) {
        vocab.set(word, index++);
      }
    });
  });

  return vocab;
}

/**
 * Calculate term frequency (TF)
 */
function calculateTF(document: string, vocab: Map<string, number>): number[] {
  const vector = new Array(vocab.size).fill(0);
  const words = document.split(/\s+/).filter(w => w.length > 0);
  const docLength = words.length;

  if (docLength === 0) return vector;

  words.forEach(word => {
    const idx = vocab.get(word);
    if (idx !== undefined) {
      vector[idx]++;
    }
  });

  // Normalize by document length
  return vector.map(count => count / docLength);
}

/**
 * Calculate inverse document frequency (IDF)
 */
function calculateIDF(documents: string[], vocab: Map<string, number>): number[] {
  const idf = new Array(vocab.size).fill(0);
  const docCount = documents.length;

  if (docCount === 0) return idf;

  // Count document frequency for each term
  const docFreq = new Array(vocab.size).fill(0);

  documents.forEach(doc => {
    const uniqueWords = new Set(doc.split(/\s+/).filter(w => w.length > 0));
    uniqueWords.forEach(word => {
      const idx = vocab.get(word);
      if (idx !== undefined) {
        docFreq[idx]++;
      }
    });
  });

  // Calculate IDF: log(N / df)
  docFreq.forEach((df, idx) => {
    idf[idx] = Math.log((docCount + 1) / (df + 1));
  });

  return idf;
}

/**
 * Calculate TF-IDF vector for a document
 */
function calculateTFIDF(tf: number[], idf: number[]): number[] {
  return tf.map((tval, idx) => tval * idf[idx]);
}

/**
 * Normalize vector to unit length
 */
function normalizeVector(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

/**
 * Convert documents to semantic vectors using TF-IDF
 */
export function vectorizeDocuments(
  urls: string[],
  contents: string[]
): SemanticVector[] {
  if (urls.length === 0 || urls.length !== contents.length) {
    return [];
  }

  // Build vocabulary from all documents
  const vocab = buildVocabulary(contents);

  // Calculate IDF
  const idf = calculateIDF(contents, vocab);

  // Convert each document to TF-IDF vector
  return urls.map((url, idx) => {
    const tf = calculateTF(contents[idx], vocab);
    const tfidf = calculateTFIDF(tf, idf);
    const normalized = normalizeVector(tfidf);

    return {
      url,
      vector: normalized,
      normalizedContent: contents[idx]
    };
  });
}

/**
 * Vectorize a single document given vocabulary and IDF
 * Useful for new documents after vocabulary is built
 */
export function vectorizeSingleDocument(
  url: string,
  content: string,
  vocab: Map<string, number>,
  idf: number[]
): SemanticVector {
  const tf = calculateTF(content, vocab);
  const tfidf = calculateTFIDF(tf, idf);
  const normalized = normalizeVector(tfidf);

  return {
    url,
    vector: normalized,
    normalizedContent: content
  };
}

/**
 * Build vocabulary data structure from documents
 * Returns vocab and IDF for later vectorization
 */
export function buildVocabularyData(contents: string[]): {
  vocab: Map<string, number>;
  idf: number[];
} {
  const vocab = buildVocabulary(contents);
  const idf = calculateIDF(contents, vocab);
  return { vocab, idf };
}
