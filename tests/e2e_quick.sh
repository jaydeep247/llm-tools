#!/bin/bash
set -e

# Config
API="http://localhost:4000/api/v1"
EMAIL="e2e_test_$(date +%s)@example.com"
PASSWORD="Password123!"

echo "🔹 1. Signup user: $EMAIL"
curl -s -X POST "$API/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\", \"name\": \"E2E Tester\"}" > /dev/null

echo "🔹 2. Login"
curl -s -c cookies.txt -X POST "$API/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}" > /dev/null

echo "🔹 3. Create Project"
PROJECT_ID=$(curl -s -b cookies.txt -X POST "$API/projects" \
  -H "Content-Type: application/json" \
  -d '{"name": "E2E Project"}' | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Project ID: $PROJECT_ID"

echo "🔹 4. Create Session"
SESSION_ID=$(curl -s -b cookies.txt -X POST "$API/projects/$PROJECT_ID/sessions" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Session ID: $SESSION_ID"

echo "🔹 5. Create Job (Crawl example.com)"
JOB_RESPONSE=$(curl -s -b cookies.txt -X POST "$API/sessions/$SESSION_ID/jobs" \
  -H "Content-Type: application/json" \
  -d '{
    "jobType": "CRAWL",
    "priority": 10,
    "config": {
      "url": "https://example.com"
    }
  }')
JOB_ID=$(echo $JOB_RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
echo "   Job ID: $JOB_ID"

echo "✅ Job Submitted! Watching for execution..."
