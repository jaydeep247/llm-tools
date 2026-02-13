import os
import base64
import aiohttp
from typing import Dict, Any
from . import BaseProvider
from ..schemas import TaskResponse

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
                async with session.post(url, json=payload) as response:
                    if response.status != 200:
                         return TaskResponse(
                            success=False, 
                            error=f"API Error {response.status}", 
                            meta={"provider": "dataforseo", "status": response.status}
                        )
                    
                    data = await response.json()
                    return TaskResponse(
                        success=True, 
                        data=data,
                        meta={"provider": "dataforseo"}
                    )

        except Exception as e:
            return TaskResponse(success=False, error=str(e), meta={"provider": "dataforseo"})
