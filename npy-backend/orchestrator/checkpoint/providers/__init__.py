from abc import ABC, abstractmethod
from typing import Dict, Any
from ..schemas import TaskResponse

class BaseProvider(ABC):
    """
    Abstract base class that all provider adapters must implement.
    """
    
    @abstractmethod
    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        """
        Execute the task using the specific provider's API.
        Must return a standardized TaskResponse.
        """
        pass
