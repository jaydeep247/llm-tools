#!/usr/bin/env tsx

import 'dotenv/config';
import { MongoClient, Db } from 'mongodb';

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exit(code?: number): never;
  exitCode?: number;
};

interface CliOptions {
  userId?: string;
  email?: string;
}

interface UserDoc {
  id: string;
  email: string;
  [key: string]: unknown;
}

interface PurgeResult {
  userId: string;
  email: string;
  projectIds: string[];
  sessionIds: string[];
  jobIds: string[];
  deletedCounts: Record<string, number>;
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'seo_crawler';

const uniqueStrings = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const toStringId = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    return String(value);
  }
  return '';
};

const buildOrFilter = (fields: Array<{ field: string; values: string[] }>): Record<string, unknown> | null => {
  const clauses = fields
    .filter(({ values }) => values.length > 0)
    .map(({ field, values }) => ({ [field]: { $in: values } }));

  if (clauses.length === 0) {
    return null;
  }
  if (clauses.length === 1) {
    return clauses[0] as Record<string, unknown>;
  }

  return { $or: clauses };
};

const printUsage = (): void => {
  console.log('Usage:');
  console.log('  npx tsx scripts/purge-user.ts --user-id <uuid>');
  console.log('  npx tsx scripts/purge-user.ts --email <email>');
  console.log('');
  console.log('Examples:');
  console.log('  npm run purge:user -- --user-id 3d6f0d39-7d74-4eab-bdd3-6fd19bd8c6a0');
  console.log('  npm run purge:user -- --email user@example.com');
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    if (arg === '--user-id') {
      options.userId = value;
      index += 1;
      continue;
    }

    if (arg === '--email') {
      options.email = value;
      index += 1;
      continue;
    }

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  return options;
};

const resolveUser = async (db: Db, options: CliOptions): Promise<UserDoc> => {
  const users = db.collection<UserDoc>('users');
  const user = options.userId
    ? await users.findOne({ id: options.userId })
    : await users.findOne({ email: options.email });

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

const collectOwnership = async (db: Db, userId: string): Promise<{ projectIds: string[]; sessionIds: string[]; jobIds: string[] }> => {
  const projects = await db
    .collection('projects')
    .find({ userId }, { projection: { id: 1 } })
    .toArray();
  const projectIds = uniqueStrings(projects.map((p: any) => toStringId(p.id)));

  const sessions = projectIds.length === 0
    ? []
    : await db
        .collection('sessions')
        .find({ projectId: { $in: projectIds } }, { projection: { id: 1 } })
        .toArray();
  const sessionIds = uniqueStrings(sessions.map((s: any) => toStringId(s.id)));

  const jobFilter = buildOrFilter([
    { field: 'sessionId', values: sessionIds },
    { field: 'projectId', values: projectIds },
    { field: 'session_id', values: sessionIds },
    { field: 'project_id', values: projectIds },
  ]);

  const jobs = !jobFilter
    ? []
    : await db
        .collection('jobs')
        .find(jobFilter, { projection: { id: 1 } })
        .toArray();
  const jobIds = uniqueStrings(jobs.map((j: any) => toStringId(j.id)));

  return { projectIds, sessionIds, jobIds };
};

const deleteAndCount = async (
  db: Db,
  collectionName: string,
  filter: Record<string, unknown> | null,
): Promise<[string, number]> => {
  if (!filter) {
    return [collectionName, 0];
  }

  const result = await db.collection(collectionName).deleteMany(filter);
  return [collectionName, result.deletedCount ?? 0];
};

const purgeUser = async (db: Db, user: UserDoc): Promise<PurgeResult> => {
  const userId = String(user.id);
  const { projectIds, sessionIds, jobIds } = await collectOwnership(db, userId);

  const jobFilter = buildOrFilter([
    { field: 'sessionId', values: sessionIds },
    { field: 'projectId', values: projectIds },
    { field: 'session_id', values: sessionIds },
    { field: 'project_id', values: projectIds },
  ]);

  const jobScopedFilter = buildOrFilter([
    { field: 'jobId', values: jobIds },
    { field: 'job_id', values: jobIds },
  ]);

  const sessionProjectJobFilter = buildOrFilter([
    { field: 'jobId', values: jobIds },
    { field: 'sessionId', values: sessionIds },
    { field: 'projectId', values: projectIds },
    { field: 'job_id', values: jobIds },
    { field: 'session_id', values: sessionIds },
    { field: 'project_id', values: projectIds },
  ]);

  const deleteOps: Array<Promise<[string, number]>> = [
    deleteAndCount(db, 'pages', jobScopedFilter),
    deleteAndCount(db, 'links', jobScopedFilter),
    deleteAndCount(db, 'sitemaps', jobScopedFilter),
    deleteAndCount(db, 'fields', jobScopedFilter),
    deleteAndCount(db, 'aeo_analysis', jobScopedFilter),
    deleteAndCount(db, 'module_e', jobScopedFilter),
    deleteAndCount(db, 'content_metrics', jobScopedFilter),
    deleteAndCount(db, 'schemas', jobScopedFilter),
    deleteAndCount(db, 'job_summaries', jobScopedFilter),
    deleteAndCount(db, 'prompt_tracking', sessionProjectJobFilter),
    deleteAndCount(db, 'serp_results', sessionProjectJobFilter),
    deleteAndCount(db, 'module_f', sessionProjectJobFilter),
    deleteAndCount(db, 'performance_audits', sessionProjectJobFilter),
    deleteAndCount(db, 'jobs', jobFilter),
    deleteAndCount(
      db,
      'sessions',
      projectIds.length > 0 ? { projectId: { $in: projectIds } } : null,
    ),
    deleteAndCount(db, 'projects', { userId }),
  ];

  const results = await Promise.all(deleteOps);
  const deletedCounts = Object.fromEntries(results);

  const userDelete = await db.collection('users').deleteOne({ id: userId });
  deletedCounts.users = userDelete.deletedCount ?? 0;

  return {
    userId,
    email: String(user.email),
    projectIds,
    sessionIds,
    jobIds,
    deletedCounts,
  };
};

async function main(): Promise<void> {
  const { userId, email } = parseArgs(process.argv.slice(2));

  if ((!userId && !email) || (userId && email)) {
    printUsage();
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URI);

  try {
    await client.connect();
    const db = client.db(MONGO_DB_NAME);

    const user = await resolveUser(db, { userId, email });
    const result = await purgeUser(db, user);

    console.log('User purge completed successfully.');
    console.log(`User: ${result.email} (${result.userId})`);
    console.log(`Projects deleted: ${result.projectIds.length}`);
    console.log(`Sessions deleted: ${result.sessionIds.length}`);
    console.log(`Jobs deleted: ${result.jobIds.length}`);
    console.log('Collection delete counts:');

    for (const [name, count] of Object.entries(result.deletedCounts)) {
      console.log(`  ${name}: ${count}`);
    }
  } finally {
    await client.close();
  }
}

main()
  .catch((error) => {
    console.error('User purge failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });