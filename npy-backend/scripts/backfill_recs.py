"""One-off script: backfill sov/tracked_prompts/citations recommendations for
existing module_e documents that were created before the recommendations engine
was added."""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.mongo import mongo_manager
from modules.module_E.recommendations import (
    generate_sov_recommendations,
    generate_tracked_prompts_recommendations,
)
from datetime import datetime

mongo_manager.connect()

projection = {
    "jobId": 1,
    "ai_share_of_voice": 1,
    "competitor_mentions": 1,
    "ai_sov_history": 1,
    "ranking_analysis": 1,
    "sov_recommendations": 1,
    "tracked_prompts_recommendations": 1,
}
docs = list(mongo_manager.module_e.find({}, projection))
print(f"Found {len(docs)} module_e documents")

for doc in docs:
    job_id = doc.get("jobId")
    updates = {}

    # SOV recommendations
    if not doc.get("sov_recommendations"):
        ai_sov = doc.get("ai_share_of_voice") or {}
        comp_mentions = doc.get("competitor_mentions") or {}
        sov_history = doc.get("ai_sov_history") or []
        if ai_sov:
            updates["sov_recommendations"] = generate_sov_recommendations(
                ai_sov, comp_mentions, sov_history
            )

    # Tracked prompts
    ranking = doc.get("ranking_analysis") or {}
    if ranking:
        if not doc.get("tracked_prompts_recommendations"):
            updates["tracked_prompts_recommendations"] = (
                generate_tracked_prompts_recommendations(ranking)
            )

    if updates:
        updates["updatedAt"] = datetime.utcnow()
        mongo_manager.module_e.update_one({"jobId": job_id}, {"$set": updates})
        print(f"  Updated {job_id}: {list(updates.keys())}")
    else:
        print(f"  Skipped {job_id}: all recommendations already present")

print("Done")
