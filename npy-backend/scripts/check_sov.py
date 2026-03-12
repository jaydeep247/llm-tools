"""Check and fix sov_recommendations for a specific job."""
import sys
import os
sys.path.insert(0, "/app")

from utils.mongo import mongo_manager
from datetime import datetime

mongo_manager.connect()

JOB_ID = "edba4a8d-807c-4d14-b9d4-c531f724ebf9"
doc = mongo_manager.module_e.find_one({"jobId": JOB_ID})

sov_rec = doc.get("sov_recommendations") if doc else None
print("TYPE:", type(sov_rec).__name__)

if sov_rec:
    print("HEALTH:", sov_rec.get("health_score"))
    print("NUM_RECS:", len(sov_rec.get("recommendations", [])))
else:
    print("MISSING - writing now...")
    from modules.module_E.recommendations import generate_sov_recommendations
    ai_sov = doc.get("ai_share_of_voice") or {}
    comp = doc.get("competitor_mentions") or {}
    hist = doc.get("ai_sov_history") or []
    rec = generate_sov_recommendations(ai_sov, comp, hist)
    mongo_manager.module_e.update_one(
        {"jobId": JOB_ID},
        {"$set": {"sov_recommendations": rec, "updatedAt": datetime.utcnow()}}
    )
    print("Written. Health:", rec.get("health_score"), "Recs:", len(rec.get("recommendations", [])))
