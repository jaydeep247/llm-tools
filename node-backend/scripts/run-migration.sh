#!/bin/bash
# Script to run the migration for new fields
# Usage: ./scripts/run-migration.sh

cd "$(dirname "$0")/.."

echo "🔄 Running Prisma migration for new fields..."
npx prisma migrate deploy

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully!"
else
    echo "❌ Migration failed. Please check your database connection."
    echo ""
    echo "Make sure:"
    echo "1. Your database is running"
    echo "2. DATABASE_URL is set correctly in your .env file"
    echo "3. You have proper database permissions"
    exit 1
fi
