from typing import List, Dict, Any

class TaskRegistry:
    """
    Central registry for all allowed tasks. 
    Defines which providers are valid for which task to prevent misuse.
    """
    
    # Map of task_name -> List of allowed providers
    # This prevents sending a 'serp_fetch' task to 'openai'
    _allowed_tasks: Dict[str, List[str]] = {
        "test_echo": ["openai", "gemini", "claude"], # For testing
        "text_generation": ["openai", "gemini", "claude"],
        "chat_completion": ["openai", "gemini", "claude"],
        "dataforseo_generic": ["dataforseo"],
        
        # Module C Tasks
        "aeo_ai_presence_check": ["openai", "gemini", "claude"],
        "aeo_answerability_audit": ["openai", "gemini", "claude"],
        "aeo_knowledge_base_audit": ["openai", "gemini", "claude"],
        "aeo_competitor_analysis": ["dataforseo"],
        "aeo_content_metrics": ["openai", "gemini", "claude"],
        "aeo_entity_relevance": ["openai", "gemini", "claude"],
        "aeo_content_understanding": ["openai", "gemini", "claude"], # Multi-AI check
        
        # LLM Simulator Tasks
        "aeo_simulate_answer_generation": ["openai", "gemini", "claude"],
        "aeo_evaluate_answer_quality": ["openai", "gemini", "claude"],
        "aeo_calculate_answer_consistency": ["openai", "gemini", "claude"],
    }

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
