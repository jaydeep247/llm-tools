#!/usr/bin/env tsx
/**
 * scripts/seed-admin.ts
 *
 * Creates the system admin account.
 * Run once (idempotent — exits cleanly if admin already exists):
 *
 *   npx tsx scripts/seed-admin.ts
 *
 * The admin password intentionally bypasses the signup-time strength
 * validator so the credentials can be exactly as specified.  Change the
 * password via the admin UI or re-run this script after removing the
 * existing account if you want to rotate credentials.
 */

import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { connectToMongo } from '../src/config/mongo';
import type { AdminEntity } from '../src/modules/admin/admin.types';

const ADMIN_EMAIL = 'admin@llm.com';
const ADMIN_PASSWORD = 'admin@llm';
const ADMIN_NAME = 'System Admin';

async function seedAdmin(): Promise<void> {
  console.log('Connecting to MongoDB…');
  const db = await connectToMongo();
  const collection = db.collection<AdminEntity>('admins');

  const existing = await collection.findOne({ email: ADMIN_EMAIL });
  if (existing) {
    console.log(`ℹ️  Admin user already exists: ${ADMIN_EMAIL}`);
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const now = new Date();

  const admin: AdminEntity = {
    id: randomUUID(),
    email: ADMIN_EMAIL,
    password: hashedPassword,
    name: ADMIN_NAME,
    role: 'ADMIN',
    createdAt: now,
    updatedAt: now,
  };

  await collection.insertOne(admin);
  await collection.createIndex({ email: 1 }, { unique: true });

  console.log(`✅  Admin user created successfully`);
  console.log(`    Email   : ${ADMIN_EMAIL}`);
  console.log(`    Password: ${ADMIN_PASSWORD}`);
  process.exit(0);
}

seedAdmin().catch((err) => {
  console.error('❌  Seed admin failed:', err);
  process.exit(1);
});
