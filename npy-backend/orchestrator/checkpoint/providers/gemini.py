import os
import logging
import time
import google.generativeai as genai
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

logger = logging.getLogger("orchestrator_gemini")

MAX_RETRIES = 3
INITIAL_BACKOFF = 2  # seconds


class GeminiProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")
        genai.configure(api_key=self.api_key)

    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        options = options or {}
        model_name = options.get("model", "gemini-2.0-flash")
        
        prompt = input_data.get("prompt")
        if not prompt and "messages" in input_data:
            prompt = "\n".join([m["content"] for m in input_data["messages"]])

        if not prompt:
            logger.warning("GeminiProvider called without prompt", extra={"task_name": task_name})
            return TaskResponse(success=False, error="Input must contain 'prompt' or 'messages'", meta={"provider": "gemini"})

        import asyncio
        import functools
        
        def _run_sync_gemini(api_key: str, model: str, text: str):
            genai.configure(api_key=api_key)
            model_instance = genai.GenerativeModel(model)
            result = model_instance.generate_content(text)
            return result.text

        logger.info("GeminiProvider executing task", extra={
            "task_name": task_name,
            "model": model_name,
            "prompt_length": len(prompt or "")
        })

        last_error = None
        for attempt in range(MAX_RETRIES):
            try:
                loop = asyncio.get_running_loop()
                response_text = await loop.run_in_executor(
                    None, 
                    functools.partial(_run_sync_gemini, self.api_key, model_name, prompt)
                )

                logger.info("GeminiProvider call succeeded", extra={
                    "task_name": task_name,
                    "model": model_name,
                    "response_length": len(response_text or ""),
                    "attempt": attempt + 1
                })

                return TaskResponse(
                    success=True, 
                    data=response_text,
                    meta={
                        "provider": "gemini",
                        "model": model_name
                    }
                )

            except Exception as e:
                last_error = e
                error_str = str(e).lower()
                
                # Check if it's a rate limit error (429)
                if "429" in str(e) or "resource exhausted" in error_str or "quota" in error_str:
                    if attempt < MAX_RETRIES - 1:
                        backoff = INITIAL_BACKOFF * (2 ** attempt)
                        logger.warning(f"GeminiProvider rate limited, retrying in {backoff}s", extra={
                            "task_name": task_name,
                            "attempt": attempt + 1,
                            "backoff": backoff
                        })
                        await asyncio.sleep(backoff)
                        continue
                
                # Non-retryable error or max retries reached
                logger.error("GeminiProvider call failed", extra={
                    "task_name": task_name,
                    "model": model_name,
                    "error": str(e),
                    "attempt": attempt + 1
                })
                break
        
        return TaskResponse(success=False, error=str(last_error), meta={"provider": "gemini"})
