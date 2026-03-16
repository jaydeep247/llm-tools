import os
import sys
from urllib.parse import urlparse
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
        self.ALLOW_LOCAL_INFRA_IN_PROD = os.getenv('ALLOW_LOCAL_INFRA_IN_PROD', 'false').lower() == 'true'

        # Crawl Limits
        self.MAX_CRAWL_PAGES = int(os.getenv('MAX_CRAWL_PAGES', '3000'))
        
        # S3/DigitalOcean Spaces Configuration (optional - falls back to local storage)
        self.S3_ENABLED = os.getenv('S3_ENABLED', 'false').lower() == 'true'
        self.S3_ENDPOINT_URL = os.getenv('S3_ENDPOINT_URL', '')
        self.S3_ACCESS_KEY_ID = os.getenv('S3_ACCESS_KEY_ID', '')
        self.S3_SECRET_ACCESS_KEY = os.getenv('S3_SECRET_ACCESS_KEY', '')
        self.S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME', '')
        self.S3_REGION = os.getenv('S3_REGION', 'sfo3')

        # DataForSEO credentials (required for SERP Analyzer / Module A)
        self.DATAFORSEO_LOGIN = os.getenv('DATAFORSEO_LOGIN', '')
        self.DATAFORSEO_PASSWORD = os.getenv('DATAFORSEO_PASSWORD', '')

        self._validate_production_infra()

    def _get_required(self, key):
        value = os.getenv(key)
        if value is None:
            logger.error(f"CRITICAL: Environment variable '{key}' is missing!")
            sys.exit(1)
        return value

    def _is_local_infra_url(self, value: str) -> bool:
        raw = value.strip().lower()
        if '@rabbitmq:' in raw or raw.startswith('redis://redis:'):
            return True
        parsed = urlparse(raw)
        host = (parsed.hostname or '').lower()
        return host in {'localhost', '127.0.0.1'}

    def _validate_production_infra(self):
        env_name = os.getenv('NODE_ENV', os.getenv('ENVIRONMENT', 'development')).lower()
        if env_name != 'production' or self.ALLOW_LOCAL_INFRA_IN_PROD:
            return

        if self._is_local_infra_url(self.RABBITMQ_URL) or self._is_local_infra_url(self.REDIS_URL):
            logger.error('CRITICAL: Unsafe production infra configuration detected.')
            logger.error('RABBITMQ_URL/REDIS_URL point to local/container endpoints.')
            logger.error('Set external service URLs or ALLOW_LOCAL_INFRA_IN_PROD=true if intentional.')
            sys.exit(1)

# Singleton instance
config = Config()
