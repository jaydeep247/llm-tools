"""Backfill keyword metrics for a specific job."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio

async def backfill():
    from utils.mongo import get_db
    from modules.module_A.ContentAudit.KeywordMetrics import extract_keyword_metrics_batch
    from pymongo import UpdateOne

    db = get_db()
    job_id = "779e0a24-78b4-42b8-b442-22638995b3cf"
    fields = db["fields"]

    docs = list(fields.find({"jobId": job_id}, {"url": 1, "main_keyword": 1}))
    print(f"Total docs: {len(docs)}")

    items = []
    for doc in docs:
        url = doc.get("url", "")
        kw = doc.get("main_keyword", "") or ""
        items.append({"url": url, "main_keyword": kw})

    results = await extract_keyword_metrics_batch(items)

    ops = []
    for r in results:
        url = r["url"]
        ops.append(UpdateOne(
            {"jobId": job_id, "url": url},
            {"$set": {
                "volume_global": r.get("volume_global"),
                "volume_us": r.get("volume_us"),
                "kd_us": r.get("kd_us"),
                "cpc_usd": r.get("cpc_usd"),
                "keyword_metrics_audit_log": r.get("audit_log"),
            }},
        ))

    if ops:
        result = fields.bulk_write(ops)
        print(f"Updated {result.modified_count} docs")

    # Verify
    with_vol = fields.count_documents({"jobId": job_id, "volume_us": {"$ne": None}})
    with_kd = fields.count_documents({"jobId": job_id, "kd_us": {"$ne": None}})
    with_cpc = fields.count_documents({"jobId": job_id, "cpc_usd": {"$ne": None}})
    print(f"Docs with volume_us: {with_vol}")
    print(f"Docs with kd_us: {with_kd}")
    print(f"Docs with cpc_usd: {with_cpc}")

    # Show sample
    sample = list(fields.find(
        {"jobId": job_id, "volume_us": {"$ne": None}},
        {"url": 1, "main_keyword": 1, "volume_us": 1, "kd_us": 1, "cpc_usd": 1}
    ))
    print(f"\nSample docs with volume:")
    for d in sample:
        url = d.get("url", "").replace("https://www.attrock.com", "").replace("https://attrock.com", "")[:40] or "/"
        print(f"  {url:40s} kw={d.get('main_keyword','')[:30]:30s} vol={d.get('volume_us')} kd={d.get('kd_us')} cpc={d.get('cpc_usd')}")

asyncio.run(backfill())
