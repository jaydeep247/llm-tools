import os
import asyncio
import logging
import httpx
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

logger = logging.getLogger("orchestrator_gemini")

MAX_RETRIES = 5
INITIAL_BACKOFF = 5  # seconds

_GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiProvider(BaseProvider):
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable not set")

    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        options = options or {}
        model_name = options.get("model", "gemini-2.0-flash")
        temperature = options.get("temperature", 0.3)
        max_tokens = options.get("max_tokens", 2048)

        # Build the user-visible prompt text, merging all message contents.
        # System instructions are passed via the dedicated system_instruction field.
        system_text: str | None = None
        user_parts: list[str] = []

        raw_messages = input_data.get("messages")
        if raw_messages:
            for m in raw_messages:
                role = m.get("role", "user")
                content = str(m.get("content", ""))
                if role == "system":
                    system_text = content
                else:
                    user_parts.append(content)
        elif "prompt" in input_data:
            user_parts.append(str(input_data["prompt"]))

        # Also honour the explicit top-level system key (same as Claude provider)
        if input_data.get("system") and not system_text:
            system_text = str(input_data["system"])

        if not user_parts:
            return TaskResponse(
                success=False,
                error="Input must contain 'prompt' or 'messages'",
                meta={"provider": "gemini"},
            )

        payload: Dict[str, Any] = {
            "contents": [{"role": "user", "parts": [{"text": p}]} for p in user_parts],
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_text:
            payload["system_instruction"] = {"parts": [{"text": system_text}]}

        url = f"{_GEMINI_BASE}/{model_name}:generateContent"
        params = {"key": self.api_key}

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    resp = await client.post(url, params=params, json=payload)

                if resp.status_code == 429:
                    if attempt < MAX_RETRIES - 1:
                        backoff = INITIAL_BACKOFF * (2 ** attempt)
                        logger.warning(
                            f"GeminiProvider rate-limited (429), retrying in {backoff}s "
                            f"(attempt {attempt + 1}/{MAX_RETRIES})"
                        )
                        await asyncio.sleep(backoff)
                        continue
                    return TaskResponse(
                        success=False,
                        error=f"Gemini rate limit exceeded after {MAX_RETRIES} retries",
                        meta={"provider": "gemini"},
                    )

                if resp.status_code != 200:
                    error_body = resp.text[:500]
                    logger.error(
                        f"GeminiProvider HTTP {resp.status_code}: {error_body}",
                        extra={"task_name": task_name, "model": model_name},
                    )
                    return TaskResponse(
                        success=False,
                        error=f"Gemini API error {resp.status_code}: {error_body}",
                        meta={"provider": "gemini"},
                    )

                body = resp.json()
                candidates = body.get("candidates", [])
                if not candidates:
                    # May be blocked by safety filters
                    reason = body.get("promptFeedback", {}).get("blockReason", "unknown")
                    logger.warning(f"GeminiProvider: no candidates returned, blockReason={reason}")
                    return TaskResponse(
                        success=False,
                        error=f"Gemini returned no candidates (blockReason={reason})",
                        meta={"provider": "gemini"},
                    )

                parts = candidates[0].get("content", {}).get("parts", [])
                response_text = "".join(p.get("text", "") for p in parts)

                return TaskResponse(
                    success=True,
                    data=response_text,
                    meta={"provider": "gemini", "model": model_name},
                )

            except Exception as e:
                last_error = e
                logger.error(
                    f"GeminiProvider call failed: {e}",
                    exc_info=True,
                    extra={"task_name": task_name, "model": model_name, "attempt": attempt + 1},
                )
                break

        return TaskResponse(
            success=False,
            error=str(last_error),
            meta={"provider": "gemini"},
        )

