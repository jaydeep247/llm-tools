import sys
import os
import requests
import re

# 1. Setup path to import your services
sys.path.append(os.getcwd())

try:
    from app.services.knowledge_base import KnowledgeBaseService
except ImportError:
    print("❌ Error: Could not import KnowledgeBaseService.")
    print("Make sure you run this from the 'llm-tools/aeo-api' folder!")
    sys.exit(1)

def test_single_url(url):
    print(f"\n🔍 --- DIAGNOSTIC TEST FOR: {url} ---")
    
    # 1. Simulate a Real Browser (Chrome on Windows)
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0'
    }

    try:
        print("1️⃣ Attempting to fetch URL...")
        response = requests.get(url, headers=headers, timeout=20)
        
        print(f"   👉 Status Code: {response.status_code}")
        print(f"   👉 Content Length: {len(response.text)} characters")
        
        if response.status_code != 200:
            print("❌ FAILURE: Website blocked the request or is down.")
            return

        # 2. Check if we got real content or a "Challenge" page
        if "challenge" in response.text.lower() or "cloudflare" in response.text.lower():
            print("⚠️ WARNING: It looks like Cloudflare/Shopify is blocking the script!")
        
        # 3. Clean Text (Simulate what KnowledgeBaseService does)
        cleaned = re.sub(r'', ' ', response.text, flags=re.DOTALL)
        cleaned = re.sub(r'<script[\s\S]*?</script>', ' ', cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r'<style[\s\S]*?</style>', ' ', cleaned, flags=re.IGNORECASE)
        text_content = re.sub(r'<[^>]+>', ' ', cleaned)
        text_content = re.sub(r'\s+', ' ', text_content).strip()
        
        print(f"\n2️⃣ Extracted Text Preview (First 200 chars):")
        print(f"   '{text_content[:200]}...'")
        
        if len(text_content) < 100:
            print("❌ FAILURE: Extracted text is too short. The site likely returned empty HTML.")
            return

        # 4. Run the Actual Service
        print("\n3️⃣ Running KnowledgeBaseService...")
        kb = KnowledgeBaseService()
        result = kb.analyze_knowledge_base(url, response.text)
        
        print(f"   👉 Final Score: {result.get('score')}")
        print(f"   👉 Readability: {result.get('readability_score')}")
        print(f"   👉 Entities Count: {result.get('entities_count')}")
        print(f"   👉 Entities Found: {list(result.get('entities', {}).keys())}")
        
        if result.get('score') > 0:
            print("\n✅ SUCCESS: The logic works!")
        else:
            print("\n❌ FAILURE: Logic ran, but score is still 0.")

    except Exception as e:
        print(f"❌ CRITICAL ERROR: {str(e)}")

if __name__ == "__main__":
    test_single_url("https://firstbud.in/")