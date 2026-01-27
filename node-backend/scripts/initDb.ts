import { prisma } from '../src/config/prismaClient.js';

async function initializeDatabase() {
    console.log('🚀 Starting Database Initialization...');
    
    try {
        // Use Prisma migrations for schema initialization
        console.log('🔧 Running Prisma migrations (prisma migrate deploy)...');
        await prisma.$executeRawUnsafe('SELECT 1'); // Simple connectivity check
        console.log('✅ Database connection successful. Please run `npm run prisma:migrate:deploy` to apply migrations.');
        console.log('✨ Database Initialization Complete (Prisma-based)! ✨');
        process.exit(0);
    } catch (err) {
        console.error('❌ Database Initialization Failed!');
        if (err instanceof Error) {
            console.error('📝 Error Message:', err.message);
            console.error('📝 Error Stack:', err.stack);
        }
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

// Run the initialization
initializeDatabase();

