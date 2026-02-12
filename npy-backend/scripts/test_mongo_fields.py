import sys
import os
from datetime import datetime
from scrapy.item import Item, Field

# Add parent dir to path
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workers.crawl_worker.spiders.items import PageItem, LinkItem, SitemapUrlItem
from workers.crawl_worker.pipelines.mongo_pipeline import MongoPipeline
from utils.mongo import mongo_manager

class MockSpider:
    job_id = 'test_job_fields'
    project_id = 'test_project'
    session_id = 'test_session'

def test_pipeline():
    print("🧪 Testing MongoPipeline fields storage...")
    
    # Setup
    spider = MockSpider()
    # Mock settings
    class MockCrawler:
        settings = {}
    
    pipeline = MongoPipeline(mongo_uri=mongo_manager.mongo_uri, mongo_db=mongo_manager.db_name)
    pipeline.open_spider(spider)
    
    # Create test item
    item = PageItem()
    item['url'] = 'http://example.com/test-fields'
    item['fields'] = {
        'status': 'OK',
        'carbon_rating': 'A+',
        'test_metric': 123
    }
    
    # Process item
    print("Processing item...")
    pipeline.process_item(item, spider)
    
    # Flush
    print("Flushing buffers...")
    pipeline.close_spider(spider)
    
    # Re-connect for verification
    from pymongo import MongoClient
    client = MongoClient(mongo_manager.mongo_uri)
    db = client[mongo_manager.db_name]
    
    # Verify in Mongo
    print("Verifying MongoDB storage...")
    
    # Check Pages
    page = db.pages.find_one({'jobId': spider.job_id})
    if page:
        print("✅ Page document found.")
        if 'fields' not in page:
             print("✅ 'fields' correctly removed from Page document.")
        else:
             print("❌ 'fields' still present in Page document!")
    else:
        print("❌ Page document not found!")

    # Check Fields
    field_doc = db.fields.find_one({'jobId': spider.job_id})
    if field_doc:
        print("✅ Fields document found in 'fields' collection.")
        print(f"   Data: {field_doc.get('data')}")
    else:
        print("❌ Fields document NOT found in 'fields' collection!")

    # Cleanup
    db.pages.delete_many({'jobId': spider.job_id})
    db.fields.delete_many({'jobId': spider.job_id})
    db.job_summaries.delete_many({'jobId': spider.job_id})
    print("🧹 Test data cleaned up.")
    client.close()

if __name__ == "__main__":
    test_pipeline()
