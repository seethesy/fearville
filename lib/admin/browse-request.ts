// FEAR-158: validates admin browse requests. Pure, so it is unit tested.
import {
  MAX_SEATS,
  MIN_SEATS,
  fixture,
  fixtureScripts,
  type FixtureScript,
} from '../staging/fixtures.ts';

export const ADMIN_VIEWERS = ['guest', 'player', 'storyteller'] as const;
export type AdminViewer = (typeof ADMIN_VIEWERS)[number] | 'observer';

export type BrowseRequest =
  | { op: 'view'; viewer: (typeof ADMIN_VIEWERS)[number] }
  | { op: 'sandbox'; fixture: string; script: FixtureScript; seats: number }
  | { op: 'observe'; code: string }
  | { op: 'exit' };

export function browseRequest(body: unknown): BrowseRequest {
  const b = (body && typeof body === 'object' ? body : {}) as Record<
    string,
    unknown
  >;
  if (b.op === 'exit') return { op: 'exit' };
  if (b.op === 'view') {
    const viewer = ADMIN_VIEWERS.find((v) => v === b.viewer);
    if (!viewer) throw Error('Choose guest, player or Storyteller.');
    return { op: 'view', viewer };
  }
  if (b.op === 'sandbox') {
    const f = fixture(b.fixture);
    if (!f) throw Error('Unknown table state.');
    const script = fixtureScripts(f.id).find((s) => s === b.script);
    if (!script) throw Error('That state is not available for this script.');
    const seats = Number(b.seats);
    if (!Number.isInteger(seats) || seats < MIN_SEATS || seats > MAX_SEATS)
      throw Error(`Choose ${MIN_SEATS} to ${MAX_SEATS} players.`);
    return { op: 'sandbox', fixture: f.id, script, seats };
  }
  if (b.op === 'observe') {
    const code = (typeof b.code === 'string' ? b.code : '')
      .trim()
      .toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) throw Error('Enter a table code.');
    return { op: 'observe', code };
  }
  throw Error('Unknown browse action.');
}
