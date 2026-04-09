import { connectToMongo } from '../../config/mongo';
import { LLMSourceMapEntry, LLMSourceMap } from './ga4.types';

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
