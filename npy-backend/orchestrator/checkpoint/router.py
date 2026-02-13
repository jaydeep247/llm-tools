from .providers.openai import OpenAIProvider
from .providers.gemini import GeminiProvider
from .providers.claude import ClaudeProvider
from .providers.dataforseo import DataForSEOProvider
from .registry import TaskRegistry
from .providers import BaseProvider

class ProviderRouter:
    """
    Responsible for selecting and initializing the correct provider adapter.
    """
    
    def __init__(self):
        # Lazy initialization or singleton pattern could be used here
        self._providers = {
            "openai": OpenAIProvider,
            "gemini": GeminiProvider,
            "claude": ClaudeProvider,
            "dataforseo": DataForSEOProvider
        }
        self._instances = {}

    def get_provider(self, task_name: str, provider_name: str) -> BaseProvider:
        # 1. Validate against Registry
        if not TaskRegistry.validate_task(task_name, provider_name):
             raise ValueError(f"Provider '{provider_name}' is not allowed for task '{task_name}' (or task does not exist)")

        # 2. Get or Create Instance
        if provider_name not in self._instances:
            provider_class = self._providers.get(provider_name)
            if not provider_class:
                raise ValueError(f"Provider '{provider_name}' implementation not found")
            self._instances[provider_name] = provider_class()
        
        return self._instances[provider_name]
