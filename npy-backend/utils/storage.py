import os
import aiofiles

import json

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "raw_html")
RESPONSE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "responses")

async def save_raw_html(job_id: str, html_content: str) -> str:
    """
    Saves raw HTML content to file system: data/raw_html/{job_id}/source.html
    Returns the absolute path to the saved file.
    """
    if not html_content:
        return ""
        
    job_dir = os.path.join(DATA_DIR, str(job_id))
    os.makedirs(job_dir, exist_ok=True)
    
    file_path = os.path.join(job_dir, "source.html")
    
    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
        await f.write(html_content)
        
    return file_path

async def load_raw_html(job_id: str) -> str:
    """
    Loads raw HTML content from file system: data/raw_html/{job_id}/source.html
    """
    file_path = os.path.join(DATA_DIR, str(job_id), "source.html")
    
    if not os.path.exists(file_path):
        return ""
        
    async with aiofiles.open(file_path, "r", encoding="utf-8") as f:
        return await f.read()

async def save_job_response(job_id: str, data: dict) -> str:
    """
    Saves job results to file system: data/responses/{job_id}/results.json
    """
    job_dir = os.path.join(RESPONSE_DIR, str(job_id))
    os.makedirs(job_dir, exist_ok=True)
    
    file_path = os.path.join(job_dir, "results.json")
    
    async with aiofiles.open(file_path, "w", encoding="utf-8") as f:
        await f.write(json.dumps(data, indent=2))
        
    return file_path

def get_raw_html_path(job_id: str) -> str:
    """Returns the expected path for a job's raw HTML file"""
    return os.path.join(DATA_DIR, str(job_id), "source.html")
def save_raw_html_sync(job_id: str, html_content: str) -> str:
    """
    Synchronous version of save_raw_html for use in non-async contexts (e.g. Scrapy)
    """
    if not html_content:
        return ""
        
    job_dir = os.path.join(DATA_DIR, str(job_id))
    os.makedirs(job_dir, exist_ok=True)
    
    file_path = os.path.join(job_dir, "source.html")
    
    with open(file_path, "w", encoding="utf-8") as f:
        f.write(html_content)
        
    return file_path

def load_raw_html_sync(job_id: str) -> str:
    """
    Synchronous version of load_raw_html
    """
    file_path = os.path.join(DATA_DIR, str(job_id), "source.html")
    
    if not os.path.exists(file_path):
        return ""
        
    with open(file_path, "r", encoding="utf-8") as f:
        return f.read()
