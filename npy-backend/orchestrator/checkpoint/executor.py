import logging
from typing import Dict, Any, Optional
from .schemas import TaskRequest, TaskResponse
from .utils import generate_task_hash
from .router import ProviderRouter
from .cache import CacheManager

# Singleton instances
router = ProviderRouter()
cache_manager = CacheManager()

logger = logging.getLogger("orchestrator")

async def execute_task(
    task_name: str,
    input_data: Dict[str, Any],
    provider: str,
    options: Optional[Dict[str, Any]] = None
) -> TaskResponse:
    """
    THE SINGLE ENTRY POINT for all paid API calls.
    
    Flow:
    1. Normalize & Hash Request
    2. Check Cache
    3. Route to Provider
    4. Execute & Catch Errors
    5. Cache & Return Result
    """
    options = options or {}
    
    # 0. Validate Request basics (Pydantic does this if we used it as input, but explicit here)
    if not task_name or not provider:
         return TaskResponse(success=False, error="task_name and provider are required")

    # 1. Generate Deterministic Hash
    task_hash = generate_task_hash(task_name, input_data, provider, options)

    # 2. Check Cache (unless skip_cache is requested)
    skip_cache = options.get("skip_cache", False)
    if not skip_cache:
        cached_entry = cache_manager.get(task_hash)
        if cached_entry:
            return TaskResponse(
                success=True,
                data=cached_entry["data"],
                meta=cached_entry["meta"],
                cached=True
            )

    # 3. Execution (Cache Miss or Skip)
    
    try:
        # Get Provider Adapter
        provider_instance = router.get_provider(task_name, provider)
        
        # Execute
        response = await provider_instance.execute(task_name, input_data, options)
        
        # 4. Store in Cache if successful
        if response.success:
            cache_manager.set(task_hash, response.data, response.meta)
            
        return response

    except ValueError as ve:
        return TaskResponse(success=False, error=str(ve))
    except Exception as e:
        logger.error(f"Execution failed: {e}")
        return TaskResponse(success=False, error=f"Internal Orchestrator Error: {str(e)}")
