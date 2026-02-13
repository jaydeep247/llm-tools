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
        model_name = options.get("model", "gemini-2.0-flash") # Default to fast model

        try:
            model = genai.GenerativeModel(model_name)
            
            prompt = input_data.get("prompt")
            # Gemini handles chat history differently, simplified for single prompt tasks usually
            # But we can support 'messages' if needed by converting them
            
            if not prompt and "messages" in input_data:
                # Naive conversion for simple tasks
                prompt = "\n".join([m["content"] for m in input_data["messages"]])

            if not prompt:
                return TaskResponse(success=False, error="Input must contain 'prompt' or 'messages'", meta={"provider": "gemini"})

            # Generate content (async not fully standard in all python SDK versions of gemini, checking support)
            # Keeping it sync for now wrapped in executor if needed, or using generate_content_async if available
            response = await model.generate_content_async(prompt)

            return TaskResponse(
                success=True, 
                data=response.text,
                meta={
                    "provider": "gemini",
                    "model": model_name
                }
            )

        except Exception as e:
            return TaskResponse(success=False, error=str(e), meta={"provider": "gemini"})
