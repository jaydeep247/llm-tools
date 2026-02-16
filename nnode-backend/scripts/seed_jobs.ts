/**
 * Script to seed 100 crawl jobs for testing.
 */

const API_URL = "http://localhost:4000/api/v1/sessions/7b22f953-bbbb-41cb-9cd1-ee7d5e4c3934/jobs";
const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIzMjk4ZGY2ZC02OGFkLTQ5NmEtOTkzYi1lYmNjMWYzNWMwOTgiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoiVVNFUiIsImlhdCI6MTc3MDc5OTMwNywiZXhwIjoxNzcxNDA0MTA3fQ.REFfR5AAAxtzailpPpEPsuq_u4PxPUdKdzDiuENHavY";

const JOB_PAYLOAD = {
    "jobType": "CRAWL",
    "priority": 10,
    "config": {
      "url": "https://yogreet.com"
    }
};

async function seedJobs() {
    console.log(`🚀 Starting to seed 100 jobs to ${API_URL}...`);
    
    let successCount = 0;
    let failCount = 0;

    for (let i = 1; i <= 100; i++) {
        try {
            const response = await fetch(API_URL, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${ACCESS_TOKEN}`
                },
                body: JSON.stringify(JOB_PAYLOAD)
            });

            if (response.ok) {
                const data = await response.json();
                successCount++;
                console.log(`✅ [${i}/100] Job created: ${data.id || "OK"}`);
            } else {
                failCount++;
                const errorText = await response.text();
                console.error(`❌ [${i}/100] Failed: ${response.status} ${response.statusText}`, errorText);
            }
        } catch (error) {
            failCount++;
            console.error(`❌ [${i}/100] Error:`, (error as Error).message);
        }

        // Small delay to prevent overwhelming the server
        if (i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    console.log("\n--- Seeding Complete ---");
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);
}

seedJobs();
