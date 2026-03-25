"""Quick diagnostic: test volume API with all keywords from a job."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import asyncio

async def test():
    from utils.mongo import get_db
    from modules.module_A.ContentAudit.KeywordMetrics import _fetch_search_volume

    db = get_db()
    job_id = "779e0a24-78b4-42b8-b442-22638995b3cf"

    docs = list(db["fields"].find({"jobId": job_id}, {"main_keyword": 1}))
    keywords = list(set(
        (d.get("main_keyword") or "").strip().lower()
        for d in docs if (d.get("main_keyword") or "").strip()
    ))
    print(f"Keywords count: {len(keywords)}")

    cache = await _fetch_search_volume(keywords)

    with_vol = {k: v for k, v in cache.items() if v.get("volume_us") is not None}
    without_vol = {k: v for k, v in cache.items() if v.get("volume_us") is None}

    print(f"Total in cache: {len(cache)}")
    print(f"Keywords WITH volume: {len(with_vol)}")
    for k, v in sorted(with_vol.items(), key=lambda x: -(x[1].get("volume_us") or 0)):
        vol = v["volume_us"]
        cpc = v.get("cpc_usd")
        print(f"  {k[:55]:55s} vol={vol:>8}  cpc={cpc}")
    print(f"Keywords without volume: {len(without_vol)}")

asyncio.run(test())
