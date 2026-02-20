import os
import google.generativeai as genai
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

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
            return TaskResponse(success=False, error="Input must contain 'prompt' or 'messages'", meta={"provider": "gemini"})

        import asyncio
        import functools
        
        def _run_sync_gemini(api_key: str, model: str, text: str):
            # Configure and run entirely within the thread to avoid loop conflicts
            genai.configure(api_key=api_key)
            model_instance = genai.GenerativeModel(model)
            result = model_instance.generate_content(text)
            return result.text

        try:
            loop = asyncio.get_running_loop()
            response_text = await loop.run_in_executor(
                None, 
                functools.partial(_run_sync_gemini, self.api_key, model_name, prompt)
            )

            return TaskResponse(
                success=True, 
                data=response_text,
                meta={
                    "provider": "gemini",
                    "model": model_name
                }
            )

        except Exception as e:
            return TaskResponse(success=False, error=str(e), meta={"provider": "gemini"})
