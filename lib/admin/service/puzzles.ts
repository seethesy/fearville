import {
  generationSettings,
  DEFAULT_GENERATION,
  TUNING_FIELDS,
  DIFFICULTIES,
} from '../../rite/generation-settings';
import { readGeneration } from '../../rite/generation-store';
import { createPuzzle, puzzleRequest } from '../../rite/puzzle';
import { assertSQL } from '../lobbies';
import { commit, db, type Admin } from './audit';

export async function puzzleTuningOverview() {
  return {
    ...(await readGeneration()),
    defaults: DEFAULT_GENERATION,
    fields: TUNING_FIELDS,
  };
}
export async function tunePuzzles(admin: Admin, body: Record<string, unknown>) {
  const settings = generationSettings(body.settings);
  if (body.action === 'preview') {
    const input = puzzleRequest(body);
    return { puzzle: createPuzzle(input, { revision: 0, settings }) };
  }
  if (body.action !== 'save') throw Error('Choose preview or save.');
  const before = await readGeneration();
  if (!Number.isSafeInteger(body.revision) || body.revision !== before.revision)
    throw Error('Puzzle tuning changed. Reload before saving.');
  // Check the whole profile against certified movement-bank coverage before
  // publishing. Unsupported combinations can never strand live tables.
  for (const difficulty of DIFFICULTIES)
    for (const pattern of ['board', 'lab'] as const)
      createPuzzle(
        { pattern, difficulty, seed: 'validate-profile' },
        { revision: 0, settings },
      );
  const revision = before.revision + 1;
  await commit(
    admin,
    'puzzles tune',
    { revision },
    {
      target: 'puzzle-generation',
      before: before.settings,
      after: settings,
      output: { revision },
      statements: [
        assertSQL(
          'COALESCE((SELECT MAX(revision) FROM puzzle_generation_versions),0)=?',
          before.revision,
        ),
        db()
          .prepare(
            'INSERT INTO puzzle_generation_versions(revision,settings,created) VALUES (?,?,?)',
          )
          .bind(revision, JSON.stringify(settings), Date.now()),
      ],
    },
  );
  return { revision, settings };
}
