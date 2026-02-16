import hashlib
import json
from typing import Dict, Any

def normalize_input(input_data: Dict[str, Any]) -> str:
    """
    Sorts dictionary keys recursively to ensure consistent JSON string representation
    regardless of key insertion order.
    """
    return json.dumps(input_data, sort_keys=True, default=str)

def generate_task_hash(task_name: str, input_data: Dict[str, Any], provider: str, options: Dict[str, Any] = None) -> str:
    """
    Generates a deterministic SHA256 hash for a task execution request.
    Hash = SHA256(task_name + normalized_input + provider + normalized_options)
    """
    normalized_input = normalize_input(input_data)
    normalized_options = normalize_input(options or {})
    
    raw_string = f"{task_name}|{normalized_input}|{provider}|{normalized_options}"
    return hashlib.sha256(raw_string.encode('utf-8')).hexdigest()
