import sys
import time
import uuid
import os

# Ensure project root is in path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from utils.event_publisher import publisher

def simulate_job():
    job_id = str(uuid.uuid4())
    print(f"🚀 Starting simulated job: {job_id}")

    # 1. Job Started
    print(f"Emit JOB_STARTED")
    publisher.emit_event(job_id, "JOB_STARTED", {"status": "running"})
    time.sleep(2)

    # 2. Progress loop
    total_steps = 5
    for i in range(1, total_steps + 1):
        progress = int((i / total_steps) * 100)
        print(f"Emit PROGRESS_UPDATE: {progress}%")
        publisher.emit_event(job_id, "PROGRESS_UPDATE", {"progress": progress, "message": f"Processing step {i}..."})
        
        # 3. Simulate Link Found randomly
        if i % 2 == 0:
            url = f"http://example.com/page-{i}"
            print(f"Emit LINK_FOUND: {url}")
            publisher.emit_event(job_id, "LINK_FOUND", {"url": url, "status": 200})
        
        time.sleep(1.5)

    # 4. Job Completed
    print(f"Emit JOB_COMPLETED")
    publisher.emit_event(job_id, "JOB_COMPLETED", {"status": "completed", "total_links": 2})
    print(f"✅ Job {job_id} simulation finished.")

if __name__ == "__main__":
    simulate_job()
