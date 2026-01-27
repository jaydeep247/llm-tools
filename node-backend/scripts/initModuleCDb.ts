import { prisma } from '../src/config/prismaClient.js';

async function initModuleC() {
    console.log('🚀 Initializing Module C Database Tables...');

    try {
        // Module C tables are managed via Prisma schema & migrations
        console.log('🔧 Checking database connection via Prisma...');
        await prisma.$executeRawUnsafe('SELECT 1');
        console.log('✅ Module C database connection verified. Tables are managed via Prisma migrations.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Failed to initialize Module C tables:', err);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

initModuleC();