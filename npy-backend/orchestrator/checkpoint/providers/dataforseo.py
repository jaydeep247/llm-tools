import os
import json
import logging
import base64
import aiohttp
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

logger = logging.getLogger("dataforseo")

def _truncate(value: Any, limit: int = 1000) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    else:
        try:
            text = json.dumps(value, ensure_ascii=True)
        except Exception:
            text = str(value)
    if len(text) <= limit:
        return text
    return text[:limit] + "...<truncated>"

def _summarize_payload(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, list):
        return {
            "count": len(payload),
            "sample": payload[0] if payload else None
        }
    return {"sample": payload}

class DataForSEOProvider(BaseProvider):
    def __init__(self):
        self.username = os.getenv("DATAFORSEO_LOGIN")
        self.password = os.getenv("DATAFORSEO_PASSWORD")
        self.base_url = "https://api.dataforseo.com/v3"
        
        if not self.username or not self.password:
             # Try fallback to encrypted if needed, but for now enforcing standard env vars for simplicity in npy
             pass 

    async def execute(self, task_name: str, input_data: Dict[str, Any], options: Dict[str, Any] = None) -> TaskResponse:
        if not self.username or not self.password:
             return TaskResponse(success=False, error="DataForSEO credentials missing", meta={"provider": "dataforseo"})

        endpoint = input_data.get("endpoint")
        payload = input_data.get("payload")
        
        if not endpoint:
            return TaskResponse(success=False, error="Input must contain 'endpoint'", meta={"provider": "dataforseo"})

        auth = aiohttp.BasicAuth(self.username, self.password)
        
        try:
            async with aiohttp.ClientSession(auth=auth) as session:
                url = f"{self.base_url}{endpoint}"
                logger.info(
                    "DataForSEO request",
                    extra={
                        "task_name": task_name,
                        "endpoint": endpoint,
                        "payload_summary": _summarize_payload(payload),
                        "payload_preview": _truncate(payload, 1000),
                    }
                )

                async with session.post(url, json=payload) as response:
                    text_body = await response.text()
                    if response.status != 200:
                        logger.error(
                            "DataForSEO response error",
                            extra={
                                "task_name": task_name,
                                "endpoint": endpoint,
                                "status": response.status,
                                "body_preview": _truncate(text_body, 1000),
                            }
                        )
                        return TaskResponse(
                            success=False,
                            error=f"API Error {response.status}",
                            meta={"provider": "dataforseo", "status": response.status}
                        )

                    try:
                        data = json.loads(text_body) if text_body else {}
                    except Exception:
                        logger.error(
                            "DataForSEO response parse error",
                            extra={
                                "task_name": task_name,
                                "endpoint": endpoint,
                                "status": response.status,
                                "body_preview": _truncate(text_body, 1000),
                            }
                        )
                        return TaskResponse(
                            success=False,
                            error="Invalid JSON response",
                            meta={"provider": "dataforseo", "status": response.status}
                        )

                    logger.info(
                        "DataForSEO response",
                        extra={
                            "task_name": task_name,
                            "endpoint": endpoint,
                            "status": response.status,
                            "tasks_count": len(data.get("tasks", []) or []),
                            "body_preview": _truncate(data, 1000),
                        }
                    )

                    return TaskResponse(
                        success=True,
                        data=data,
                        meta={"provider": "dataforseo"}
                    )

        except Exception as e:
            return TaskResponse(success=False, error=str(e), meta={"provider": "dataforseo"})
