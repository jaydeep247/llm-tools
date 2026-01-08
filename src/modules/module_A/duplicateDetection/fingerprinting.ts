import crypto from 'crypto';

/**
 * Content Fingerprinting using SimHash algorithm
 * 
 * SimHash is used by Google and other search engines for near-duplicate detection.
 * It creates a fixed-size hash where similar content has similar hashes.
 */

/**
 * Generate MD5 hash of content (for exact duplicate detection)
 */
export function generateContentHash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Generate SimHash signature for similarity comparison
 * 
 * SimHash algorithm:
 * 1. Break content into tokens (words/shingles)
 * 2. Hash each token
 * 3. Create weighted bit vector
 * 4. Generate final hash
 * 
 * Similar content → similar SimHash → easy comparison
 */
export function generateSimHash(content: string, hashSize: number = 64): string {
    if (!content || content.length === 0) {
        return '0'.repeat(hashSize);
    }
    
    // Initialize bit vector
    const vector = new Array(hashSize).fill(0);
    
    // Tokenize content into words
    const tokens = content.split(/\s+/).filter(t => t.length > 0);
    
    if (tokens.length === 0) {
        return '0'.repeat(hashSize);
    }
    
    // Process each token
    for (const token of tokens) {
        // Hash the token
        const hash = hashToken(token, hashSize);
        
        // Update vector based on hash bits
        for (let i = 0; i < hashSize; i++) {
            const bit = (hash >> BigInt(i)) & 1n;
            if (bit === 1n) {
                vector[i]++;
            } else {
                vector[i]--;
            }
        }
    }
    
    // Generate final SimHash
    let simhash = 0n;
    for (let i = 0; i < hashSize; i++) {
        if (vector[i] > 0) {
            simhash |= (1n << BigInt(i));
        }
    }
    
    // Convert to hex string
    return simhash.toString(16).padStart(Math.ceil(hashSize / 4), '0');
}

/**
 * Hash a token to a BigInt
 */
function hashToken(token: string, bits: number): bigint {
    const hash = crypto.createHash('sha256').update(token).digest();
    
    // Convert first 8 bytes to BigInt
    let result = 0n;
    const bytesToUse = Math.min(8, Math.ceil(bits / 8));
    
    for (let i = 0; i < bytesToUse; i++) {
        result = (result << 8n) | BigInt(hash[i]);
    }
    
    return result;
}

/**
 * Calculate Hamming distance between two SimHash values
 * Returns number of differing bits (0 = identical, 64 = completely different)
 */
export function hammingDistance(hash1: string, hash2: string): number {
    const int1 = BigInt('0x' + hash1);
    const int2 = BigInt('0x' + hash2);
    
    let xor = int1 ^ int2;
    let distance = 0;
    
    while (xor > 0n) {
        distance += Number(xor & 1n);
        xor >>= 1n;
    }
    
    return distance;
}

/**
 * Calculate similarity score between two SimHash values
 * Returns 0.0 (completely different) to 1.0 (identical)
 */
export function calculateSimilarity(hash1: string, hash2: string, hashSize: number = 64): number {
    const distance = hammingDistance(hash1, hash2);
    return 1 - (distance / hashSize);
}

/**
 * Generate shingles (n-grams) from text
 * Used for more accurate similarity detection
 */
export function generateShingles(text: string, shingleSize: number = 5): Set<string> {
    const words = text.split(/\s+/).filter(w => w.length > 0);
    const shingles = new Set<string>();
    
    for (let i = 0; i <= words.length - shingleSize; i++) {
        const shingle = words.slice(i, i + shingleSize).join(' ');
        shingles.add(shingle);
    }
    
    return shingles;
}

/**
 * Calculate Jaccard similarity between two shingle sets
 * Returns 0.0 (no overlap) to 1.0 (identical)
 */
export function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    if (union.size === 0) return 0;
    
    return intersection.size / union.size;
}
