import { prisma } from '../src/config/prismaClient.js';

async function initializeAeoDatabase() {
    console.log('🚀 Starting AEO Database Initialization...');

    try {
        // AEO tables are managed via Prisma schema & migrations
        console.log('🔧 Checking database connection via Prisma...');
        await prisma.$executeRawUnsafe('SELECT 1');
        console.log('✅ Database connection successful. AEO tables are managed via Prisma migrations.');
        console.log('✨ AEO Database Initialization Complete (Prisma-based)! ✨');
        process.exit(0);
    } catch (err) {
        console.error('❌ AEO Database Initialization Failed!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the initialization
initializeAeoDatabase();
