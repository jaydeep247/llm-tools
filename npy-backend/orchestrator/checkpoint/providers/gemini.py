import os
import logging
import google.generativeai as genai
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

logger = logging.getLogger("orchestrator_gemini")


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

        try:
            loop = asyncio.get_running_loop()
            response_text = await loop.run_in_executor(
                None, 
                functools.partial(_run_sync_gemini, self.api_key, model_name, prompt)
            )

            logger.info("GeminiProvider call succeeded", extra={
                "task_name": task_name,
                "model": model_name,
                "response_length": len(response_text or "")
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
            logger.error("GeminiProvider call failed", extra={
                "task_name": task_name,
                "model": model_name,
                "error": str(e)
            })
            return TaskResponse(success=False, error=str(e), meta={"provider": "gemini"})
