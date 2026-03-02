import os
import sys
from dotenv import load_dotenv
from utils.logger import logger

class Config:
    def __init__(self):
        # Try to load .env file if it exists (for local development)
        env_path = os.path.join(os.getcwd(), '.env')
        if os.path.exists(env_path):
            load_dotenv(env_path)
        
        self.MONGO_URI = self._get_required('MONGO_URI')
        self.MONGO_DB_NAME = self._get_required('MONGO_DB_NAME')
        self.RABBITMQ_URL = self._get_required('RABBITMQ_URL')
        self.REDIS_URL = self._get_required('REDIS_URL')
        self.LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

        # Crawl Limits
        self.MAX_CRAWL_PAGES = int(os.getenv('MAX_CRAWL_PAGES', '3000'))
        
        # S3/DigitalOcean Spaces Configuration (optional - falls back to local storage)
        self.S3_ENABLED = os.getenv('S3_ENABLED', 'false').lower() == 'true'
        self.S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', '')
        self.S3_ACCESS_KEY_ID = os.getenv('S3_ACCESS_KEY_ID', '')
        self.S3_SECRET_ACCESS_KEY = os.getenv('S3_SECRET_ACCESS_KEY', '')
        self.S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME', '')
        self.S3_REGION = os.getenv('S3_REGION', 'sfo3')

    def _get_required(self, key):
        value = os.getenv(key)
        if value is None:
            logger.error(f"CRITICAL: Environment variable '{key}' is missing!")
            sys.exit(1)
        return value

# Singleton instance
config = Config()
