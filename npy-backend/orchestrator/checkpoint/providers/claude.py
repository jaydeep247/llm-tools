import os
import logging
import anthropic
from typing import Dict, Any, List, Tuple, Optional
from . import BaseProvider
from ..schemas import TaskResponse

logger = logging.getLogger("orchestrator.claude")

class ClaudeProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.getenv("ANTHROPIC_API_KEY") or os.getenv("CLAUDE_API_KEY")
        if not self.api_key:
            raise ValueError("CLAUDE_API_KEY environment variable not set")
        self.client = anthropic.AsyncAnthropic(api_key=self.api_key)

    def _normalize_content(self, content: Any) -> Any:
        # Anthropic supports string content or structured content blocks.
        if isinstance(content, (str, list)):
            return content
        if content is None:
            return ""
        return str(content)

    def _prepare_claude_messages(
        self,
        raw_messages: List[Dict[str, Any]],
        explicit_system: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], Optional[str]]:
        system_parts: List[str] = []
        if explicit_system:
            system_parts.append(str(explicit_system))

        prepared_messages: List[Dict[str, Any]] = []
        for msg in raw_messages:
            role = msg.get("role")
            content = self._normalize_content(msg.get("content"))

            if role == "system":
                if isinstance(content, str) and content.strip():
                    system_parts.append(content.strip())
                continue

            # Anthropic Messages API only accepts user/assistant roles.
            if role in {"user", "assistant"}:
                prepared_messages.append({"role": role, "content": content})

        system_text = "\n\n".join(part for part in system_parts if part).strip() or None
        return prepared_messages, system_text

    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        options = options or {}
        model = options.get("model", "claude-haiku-4-5-20251001")

        try:
            raw_messages = input_data.get("messages")
            if not raw_messages and "prompt" in input_data:
                 raw_messages = [{"role": "user", "content": input_data["prompt"]}]
            
            if not raw_messages:
                return TaskResponse(success=False, error="Input must contain 'messages' or 'prompt'", meta={"provider": "claude"})

            messages, system_prompt = self._prepare_claude_messages(
                raw_messages,
                input_data.get("system")
            )

            if not messages:
                return TaskResponse(
                    success=False,
                    error="No valid user/assistant messages found for Claude request",
                    meta={"provider": "claude"}
                )

            request_args: Dict[str, Any] = {
                "model": model,
                "max_tokens": options.get("max_tokens", 1024),
                "messages": messages,
            }

            if system_prompt:
                request_args["system"] = system_prompt

            response = await self.client.messages.create(**request_args)

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
            logger.error(f"Claude API Error: {str(e)}", extra={"messages": raw_messages, "model": model})
            return TaskResponse(success=False, error=str(e), meta={"provider": "claude"})
