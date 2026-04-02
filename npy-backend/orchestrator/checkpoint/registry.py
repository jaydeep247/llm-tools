from typing import List, Dict, Any

class TaskRegistry:
    """
    Central registry for all allowed tasks. 
    Defines which providers are valid for which task to prevent misuse.
    """
  
    @classmethod
    def validate_task(cls, task_name: str, provider: str) -> bool:
        if task_name not in cls._allowed_tasks:
            return False
        
        if provider not in cls._allowed_tasks[task_name]:
            return False
            
        return True

    @classmethod
    def get_allowed_providers(cls, task_name: str) -> List[str]:
        return cls._allowed_tasks.get(task_name, [])