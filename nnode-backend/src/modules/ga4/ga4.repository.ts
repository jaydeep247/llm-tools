import { connectToMongo } from '../../config/mongo';
import { LLMSourceMapEntry, LLMSourceMap, TrackedConversionEvent } from './ga4.types';

// Use Node.js built-in crypto to avoid adding a dependency
const generateId = () => require('crypto').randomUUID() as string;

/**
 * Fetch all active LLM source domain → display name mappings from the DB.
 * Returns a plain Record<source_domain, display_name> for fast lookup.
 *
 * Falls back to an empty map (caller should handle gracefully) if the
 * collection is unreachable.
 */
export async function getLLMSourceMap(): Promise<LLMSourceMap> {
  const db = await connectToMongo();
  const entries = await db
    .collection<LLMSourceMapEntry>('llm_source_map')
    .find({ is_active: true })
    .toArray();

  const map: LLMSourceMap = {};
  for (const entry of entries) {
    map[entry.source_domain] = entry.display_name;
  }
  return map;
}

/**
 * Return all llm_source_map entries (active + inactive) — used by admin APIs.
 */
export async function getAllLLMSourceMapEntries(): Promise<LLMSourceMapEntry[]> {
  const db = await connectToMongo();
  return db
    .collection<LLMSourceMapEntry>('llm_source_map')
    .find({})
    .sort({ display_name: 1, source_domain: 1 })
    .toArray();
}

/**
 * Upsert a single source-domain mapping.
 */
export async function upsertLLMSourceMapEntry(
  entry: Omit<LLMSourceMapEntry, 'added_at'>,
): Promise<void> {
  const db = await connectToMongo();
  await db.collection<LLMSourceMapEntry>('llm_source_map').updateOne(
    { source_domain: entry.source_domain },
    {
      $set: { display_name: entry.display_name, is_active: entry.is_active },
      $setOnInsert: { added_at: new Date() },
    },
    { upsert: true },
  );
}

// ── Tracked Conversion Events ─────────────────────────────────────────────────

/**
 * Fetch active tracked conversion events for a user (scoped by userId as domain_id).
 */
export async function getTrackedConversionEvents(userId: string): Promise<TrackedConversionEvent[]> {
  const db = await connectToMongo();
  return db
    .collection<TrackedConversionEvent>('tracked_conversion_events')
    .find({ domain_id: userId, is_active: true })
    .sort({ added_at: 1 })
    .toArray() as unknown as TrackedConversionEvent[];
}

/**
 * Replace the full set of tracked conversion events for a user.
 * Deactivates existing ones and inserts the new set.
 */
export async function saveTrackedConversionEvents(
  userId: string,
  events: Array<{ ga4_event_name: string; display_label: string }>,
): Promise<void> {
  const db = await connectToMongo();
  const col = db.collection('tracked_conversion_events');

  // Deactivate all existing events for this user
  await col.updateMany({ domain_id: userId }, { $set: { is_active: false } });

  if (events.length === 0) return;

  const now = new Date();
  const docs = events.map((e) => ({
    id: generateId(),
    domain_id: userId,
    ga4_event_name: e.ga4_event_name,
    display_label: e.display_label || e.ga4_event_name,
    is_active: true,
    added_at: now,
  }));

  await col.insertMany(docs);
}
