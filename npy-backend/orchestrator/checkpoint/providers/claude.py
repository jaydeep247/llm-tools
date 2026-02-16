import os
import anthropic
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

class ClaudeProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.getenv("CLAUDE_API_KEY")
        if not self.api_key:
            raise ValueError("CLAUDE_API_KEY environment variable not set")
        self.client = anthropic.AsyncAnthropic(api_key=self.api_key)

    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        options = options or {}
        model = options.get("model", "claude-3-5-sonnet-20240620")

        try:
            messages = input_data.get("messages")
            if not messages and "prompt" in input_data:
                 messages = [{"role": "user", "content": input_data["prompt"]}]
            
            if not messages:
                return TaskResponse(success=False, error="Input must contain 'messages' or 'prompt'", meta={"provider": "claude"})

            response = await self.client.messages.create(
                model=model,
                max_tokens=options.get("max_tokens", 1024),
                messages=messages
            )

            return TaskResponse(
                success=True, 
                data=response.content[0].text,
                meta={
                    "provider": "claude",
                    "model": model,
                    "usage": {
                        "input_tokens": response.usage.input_tokens,
                        "output_tokens": response.usage.output_tokens
                    }
                }
            )

        except Exception as e:
            return TaskResponse(success=False, error=str(e), meta={"provider": "claude"})
