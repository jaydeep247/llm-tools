import os
import json
import logging
from typing import Optional, Dict, Any
from datetime import datetime

class CacheManager:
    """
    Manages API response caching. 
    Currently implements a simple persistent file-based cache for the prototype.
    Can be easily swapped for Redis/Mongo.
    """
    def __init__(self, cache_file_name: str = "orchestrator_cache.jsonl"):
        current_dir = os.path.dirname(os.path.abspath(__file__))
        project_root = os.path.dirname(os.path.dirname(current_dir)) 
        
        self.cache_file = os.path.join(project_root, "data", "cache", cache_file_name)
        os.makedirs(os.path.dirname(self.cache_file), exist_ok=True)
        self.memory_cache = {} # Simple in-memory LRU could go here
        self._load_cache()

    def _load_cache(self):
        """Loads valid cache entries into memory (for MVP performance)"""
        if not os.path.exists(self.cache_file):
            return

        try:
            with open(self.cache_file, 'r') as f:
                for line in f:
                    try:
                        entry = json.loads(line)
                        if entry and "hash" in entry:
                            self.memory_cache[entry["hash"]] = entry
                    except json.JSONDecodeError:
                        continue
        except Exception as e:
            logging.error(f"Failed to load cache: {e}")

    def get(self, task_hash: str) -> Optional[Dict[str, Any]]:
        return self.memory_cache.get(task_hash)

    def set(self, task_hash: str, data: Any, meta: Dict[str, Any] = None):
        entry = {
            "hash": task_hash,
            "data": data,
            "meta": meta or {},
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Update memory
        self.memory_cache[task_hash] = entry
        
        # Persist (Append only for speed)
        try:
            with open(self.cache_file, 'a') as f:
                f.write(json.dumps(entry) + "\n")
        except Exception as e:
            logging.error(f"Failed to write to cache: {e}")
