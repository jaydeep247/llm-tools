"""
Similarity Metrics
Includes SimHash (for near-duplicates) and Semantic Vector calculations.
Ported from node-backend/src/helpers/module_A/duplicateDetection/fingerprinting.ts
and semanticAnalysis/vectorCalculator.ts
"""

import hashlib
import re
import math
from typing import List, Dict, Set, Tuple

# ==========================================
# SimHash (Near-Duplicate Detection)
# ==========================================

def generate_content_hash(content: str) -> str:
    """Generate MD5 hash of content."""
    return hashlib.md5(content.encode('utf-8')).hexdigest()

def _hash_token(token: str, bits: int) -> int:
    """Hash a token to an integer of 'bits' size."""
    hash_obj = hashlib.sha256(token.encode('utf-8'))
    digest = hash_obj.digest()
    
    # Convert first 8 bytes (or less) to int
    bytes_needed = (bits + 7) // 8
    used_bytes = digest[:min(bytes_needed, 32)] # sha256 is 32 bytes
    
    result = int.from_bytes(used_bytes, byteorder='big')
    # Mask to keep only 'bits'
    mask = (1 << bits) - 1
    return result & mask

def generate_simhash(content: str, hash_size: int = 64) -> str:
    """
    Generate SimHash signature.
    """
    if not content:
        return '0' * (hash_size // 4) # Hex string
        
    # Initialize bit vector
    vector = [0] * hash_size
    
    # Tokenize
    tokens = re.split(r'\s+', content)
    tokens = [t for t in tokens if t]
    
    if not tokens:
        return '0' * (hash_size // 4)
        
    for token in tokens:
        token_hash = _hash_token(token, hash_size)
        
        for i in range(hash_size):
            bit = (token_hash >> i) & 1
            if bit:
                vector[i] += 1
            else:
                vector[i] -= 1
                
    # Generate final fingerprint
    fingerprint = 0
    for i in range(hash_size):
        if vector[i] > 0:
            fingerprint |= (1 << i)
            
    # Convert to hex
    hex_len = (hash_size + 3) // 4
    return f"{fingerprint:0{hex_len}x}"

def hamming_distance(hash1: str, hash2: str) -> int:
    """Calculate Hamming distance between two hex strings."""
    try:
        int1 = int(hash1, 16)
        int2 = int(hash2, 16)
    except ValueError:
        return 64 # Max distance
        
    xor_val = int1 ^ int2
    distance = bin(xor_val).count('1')
    return distance

def calculate_similarity_score(hash1: str, hash2: str, hash_size: int = 64) -> float:
    """Calculate similarity score (0.0 to 1.0) from SimHash."""
    distance = hamming_distance(hash1, hash2)
    return 1.0 - (distance / hash_size)

# ==========================================
# Semantic Similarity (TF-IDF)
# ==========================================

def tokenize(text: str) -> List[str]:
    """Simple tokenizer."""
    return [t for t in re.split(r'\s+', text.lower()) if t]

def calculate_tf(content: str) -> Dict[str, float]:
    """Calculate Term Frequency (TF)."""
    tokens = tokenize(content)
    if not tokens:
        return {}
        
    term_counts = {}
    for token in tokens:
        term_counts[token] = term_counts.get(token, 0) + 1
        
    total_tokens = len(tokens)
    tf = {term: count / total_tokens for term, count in term_counts.items()}
    return tf

# Note: Full TF-IDF requires global IDF which isn't available during single-page crawl.
# We will provide the TF vector or raw content token count for now.
