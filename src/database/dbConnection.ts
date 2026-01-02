import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Establish a connection pool to PostgreSQL as a Singleton
console.log('🔄 Connecting to PostgreSQL:', {
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'contentlytics',
    user: process.env.DB_USER || 'postgres',
    hasPassword: !!process.env.DB_PASSWORD
});

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: String(process.env.DB_PASSWORD || ''), // Ensure it is a string
    database: process.env.DB_NAME || 'contentlytics',
    // Industry standard pool settings
    max: 20, // max number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    process.exit(-1);
});

export const getPool = () => pool;

// Helper to run queries with single client from the pool
export const query = (text: string, params?: any[]) => pool.query(text, params);
