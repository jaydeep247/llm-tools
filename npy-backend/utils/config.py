import os
import sys
from dotenv import load_dotenv
from utils.logger import logger

class Config:
    def __init__(self):
        env_path = os.path.join(os.getcwd(), '.env')
        if not os.path.exists(env_path):
            logger.error("CRITICAL: .env file is missing! Application cannot start without configuration.")
            sys.exit(1)
            
        load_dotenv(env_path)
        
        self.MONGO_URI = self._get_required('MONGO_URI')
        self.MONGO_DB_NAME = self._get_required('MONGO_DB_NAME')
        self.RABBITMQ_URL = self._get_required('RABBITMQ_URL')
        self.REDIS_URL = self._get_required('REDIS_URL')
        self.LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO') 

    def _get_required(self, key):
        value = os.getenv(key)
        if value is None:
            logger.error(f"CRITICAL: Environment variable '{key}' is missing in .env!")
            sys.exit(1)
        return value

# Singleton instance
config = Config()
