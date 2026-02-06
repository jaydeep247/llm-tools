import os
import sys

# Add py-backend to sys.path to import decrypt
sys.path.append(os.path.join(os.getcwd(), 'py-backend'))

from dataforseo_encryption.decrypt import get_dataforseo_auth
from dotenv import load_dotenv

def verify():
    load_dotenv()
    try:
        auth = get_dataforseo_auth()
        print(f"DECRYPTED_USER:{auth['username']}")
    except Exception as e:
        print(f"DECRYPTION_ERROR:{str(e)}")

if __name__ == "__main__":
    verify()
