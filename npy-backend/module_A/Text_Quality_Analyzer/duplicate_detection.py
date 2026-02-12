import hashlib
import re
from typing import Dict, Any

def generate_content_hash(text: str) -> str:
    """MD5 hash of normalized content."""
    norm = re.sub(r'\s+', ' ', text.lower()).strip()
    return hashlib.md5(norm.encode('utf-8')).hexdigest()

def generate_simhash(text: str, hash_size: int = 64) -> str:
    """
    Generate SimHash fingerprint for near-duplicate detection.
    Ported from node-backend fingerprinting.ts
    """
    if not text:
        return "0" * (hash_size // 4)
    
    vector = [0] * hash_size
    tokens = re.findall(r'\b\w+\b', text.lower())
    
    for token in tokens:
        # Standard bit-wise hashing
        h = int(hashlib.md5(token.encode('utf-8')).hexdigest(), 16)
        for i in range(hash_size):
            bit = (h >> i) & 1
            if bit:
                vector[i] += 1
            else:
                vector[i] -= 1
                
    fingerprint = 0
    for i in range(hash_size):
        if vector[i] > 0:
            fingerprint |= (1 << i)
            
    return f"{fingerprint:0{hash_size // 4}x}"

def analyze_duplication(text: str) -> Dict[str, Any]:
    """
    Generate hashes for duplicate detection.
    Note: Actual "detection" across pages happens in session context.
    """
    return {
        "contentHash": generate_content_hash(text),
        "simhash": generate_simhash(text),
        "duplicateContent": False, # Placeholder for session-wide check
        "duplicateWithUrls": []
    }
