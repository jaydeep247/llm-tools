import os
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse
import openai

class OpenAIProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")
        if not self.api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        self.client = openai.AsyncOpenAI(api_key=self.api_key)

    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        options = options or {}
        model = options.get("model", "gpt-4o-mini")  # Default to efficient model

        try:
            # Standardize input for chat tasks
            messages = input_data.get("messages")
            if not messages and "prompt" in input_data:
                 messages = [{"role": "user", "content": input_data["prompt"]}]
            
            if not messages:
                return TaskResponse(success=False, error="Input must contain 'messages' or 'prompt'", meta={"provider": "openai"})

            request_args = {
                "model": model,
                "messages": messages,
                "temperature": options.get("temperature", 0.7),
                "max_tokens": options.get("max_tokens", 1000),
            }

            response_format = options.get("response_format")
            if response_format:
                request_args["response_format"] = response_format

            response = await self.client.chat.completions.create(**request_args)

            return TaskResponse(
                success=True, 
                data=response.choices[0].message.content,
                meta={
                    "provider": "openai",
                    "model": response.model,
                    "usage": response.usage.model_dump() if response.usage else {}
                }
            )

        except Exception as e:
            return TaskResponse(success=False, error=str(e), meta={"provider": "openai"})
