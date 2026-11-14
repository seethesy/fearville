import { database } from '@/db';
import {
  DEFAULT_GENERATION,
  generationSettings,
  type GenerationSnapshot,
} from './generation-settings';

export async function readGeneration(
  revision?: number,
): Promise<GenerationSnapshot> {
  if (revision === 0)
    return { revision: 0, settings: structuredClone(DEFAULT_GENERATION) };
  const query =
    revision === undefined
      ? database().prepare(
          'SELECT revision,settings FROM puzzle_generation_versions ORDER BY revision DESC LIMIT 1',
        )
      : database()
          .prepare(
            'SELECT revision,settings FROM puzzle_generation_versions WHERE revision=?',
          )
          .bind(revision);
  const row = await query.first<{ revision: number; settings: string }>();
  if (!row) {
    if (revision !== undefined)
      throw Error('That puzzle tuning revision is unavailable.');
    return { revision: 0, settings: structuredClone(DEFAULT_GENERATION) };
  }
  return {
    revision: row.revision,
    settings: generationSettings(JSON.parse(row.settings)),
  };
}
