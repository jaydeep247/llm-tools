#!/usr/bin/env node
/**
 * Script to clear all crawl sessions from database and file system
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabase } from '../src/database/DatabaseService.js';
import { Logger } from '../src/logging/Logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const logger = Logger.getInstance();

async function clearAllSessions() {
    try {
        console.log('Starting cleanup of all crawl sessions...\n');

        // 1. Clear database sessions and related data
        console.log('Step 1: Clearing database sessions...');
        const db = getDatabase();
        await db.clearAllData();
        console.log('✓ Database sessions cleared\n');

        // 2. Clear request queue directories
        console.log('Step 2: Clearing request queue directories...');
        const queueDir = path.resolve(projectRoot, 'storage', 'request_queues');
        if (fs.existsSync(queueDir)) {
            const queueDirs = fs.readdirSync(queueDir);
            let clearedCount = 0;
            for (const dir of queueDirs) {
                const dirPath = path.join(queueDir, dir);
                if (fs.statSync(dirPath).isDirectory()) {
                    fs.rmSync(dirPath, { recursive: true, force: true });
                    clearedCount++;
                }
            }
            console.log(`✓ Cleared ${clearedCount} request queue directory(ies)\n`);
        } else {
            console.log('✓ No request queue directory found\n');
        }

        // 3. Clear audit files (optional but good practice)
        console.log('Step 3: Clearing audit files...');
        try {
            const auditDir = path.resolve(projectRoot, 'storage', 'audits');
            if (fs.existsSync(auditDir)) {
                const deviceDirs = fs.readdirSync(auditDir);
                for (const deviceDir of deviceDirs) {
                    const devicePath = path.join(auditDir, deviceDir);
                    if (fs.statSync(devicePath).isDirectory()) {
                        const dateDirs = fs.readdirSync(devicePath);
                        for (const dateDir of dateDirs) {
                            const datePath = path.join(devicePath, dateDir);
                            if (fs.statSync(datePath).isDirectory()) {
                                const files = fs.readdirSync(datePath);
                                for (const file of files) {
                                    fs.unlinkSync(path.join(datePath, file));
                                }
                                fs.rmdirSync(datePath);
                            }
                        }
                        fs.rmdirSync(devicePath);
                    }
                }
                fs.rmdirSync(auditDir);
                console.log('✓ Audit files cleared\n');
            } else {
                console.log('✓ No audit directory found\n');
            }
        } catch (error) {
            console.warn('⚠ Failed to clear audit files:', (error as Error).message);
        }

        console.log('✅ All sessions cleared successfully!');
        logger.info('All sessions cleared by script');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error clearing sessions:', error);
        logger.error('Failed to clear sessions', error as Error);
        process.exit(1);
    }
}

// Run the cleanup
clearAllSessions();


