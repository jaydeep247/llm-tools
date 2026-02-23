import os
import aiofiles

import json

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "raw_html")

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
    Saves job results to MongoDB fields collection.
    Stores analysis results directly into the fields collection.
    
    Args:
        job_id: Job ID
        data: Job results dictionary with structure:
              { job_id, url, success, modules: { module_c: {...}, ... } }
    
    Returns:
        MongoDB document URI
    """
    from utils.mongo import mongo_manager
    from datetime import datetime
    
    try:
        # Extract URL from data
        url = data.get("url", "")
        
        # Prepare base document
        document = {
            "jobId": job_id,
            "url": url,
            "timestamp": datetime.utcnow()
        }
        
        # Merge all modules into the document at the top level
        # e.g., 'modules': {'module_c': {...}} -> 'module_c': {...}
        modules = data.get("modules", {})
        if modules:
            document.update(modules)
            
        # Connect to MongoDB
        mongo_manager.connect()
        
        # Use upsert to handle updates for the same job_id + url
        result = mongo_manager.fields.update_one(
            {"jobId": job_id, "url": url},
            {"$set": document},
            upsert=True
        )
        
        doc_id = result.upserted_id or "updated"
        from utils.logger import logger
        logger.info(f"Stored results for job {job_id} in MongoDB fields collection")
        
        return f"mongodb://fields/{doc_id}"
        
    except Exception as e:
        from utils.logger import logger
        error_type = type(e).__name__
        logger.error(f"Failed to save to MongoDB ({error_type})")
        raise e

def get_raw_html_path(job_id: str) -> str:
    """Returns the expected path for a job's raw HTML file"""
    return os.path.join(DATA_DIR, str(job_id), "source.html")


async def save_aeo_analysis(job_id: str, url: str, data: dict) -> str:
    """
    Saves Module C (AEO) analysis results to MongoDB aeo_analysis collection.
    
    Args:
        job_id: Job ID
        url: URL being analyzed
        data: Module C analysis results dictionary
    
    Returns:
        MongoDB document URI
    """
    from utils.mongo import mongo_manager
    from datetime import datetime
    
    try:
        # Prepare document
        document = {
            "jobId": job_id,
            "url": url,
            "timestamp": datetime.utcnow(),
            "overall_score": data.get("overall_score", 0),
            "modules": data.get("modules", {})
        }
        
        # Connect to MongoDB
        mongo_manager.connect()
        
        # Use upsert to handle updates for the same job_id + url
        result = mongo_manager.aeo_analysis.update_one(
            {"jobId": job_id, "url": url},
            {"$set": document},
            upsert=True
        )
        
        doc_id = result.upserted_id or "updated"
        from utils.logger import logger
        logger.info(f"Stored AEO analysis for job {job_id} in MongoDB aeo_analysis collection")
        
        return f"mongodb://aeo_analysis/{doc_id}"
        
    except Exception as e:
        from utils.logger import logger
        error_type = type(e).__name__
        logger.error(f"Failed to save AEO analysis to MongoDB ({error_type})")
        raise e


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
