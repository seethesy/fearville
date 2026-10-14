// FEAR-161: named table states for UI review on staging. Each fixture is a
// Sandbox table (dummy seats, no timers) driven through the real engine, so
// what Art sees is a state the game can actually reach. The Sandbox host can
// switch to any seat's point of view from the table screen.
import { eligibleVoters, execute, tasks, tick } from '../game/engine.ts';
import { newSandboxGame } from '../game/sandbox.ts';
import { role, type Command, type Game } from '../game/types.ts';
import { configureRite } from '../rite/engine.ts';
import { DEFAULT_CONFIG, type Pattern } from '../rite/types.ts';

export type FixtureId =
  | 'lobby'
  | 'night-1'
  | 'discovery'
  | 'discussion'
  | 'nomination'
  | 'defense'
  | 'voting'
  | 'day-review'
  | 'rite-board'
  | 'rite-grid'
  | 'rite-ritual'
  | 'rite-lab'
  | 'ended-traveler'
  | 'recap'
  | 'hms-night-1'
  | 'hms-discovery';

export type Fixture = {
  id: FixtureId;
  code: string; // fixed 6-letter code, letters only so it never collides with generated numeric codes
  title: string;
  description: string;
};

export const FIXTURES: Fixture[] = [
  {
    id: 'lobby',
    code: 'QALOBY',
    title: 'Lobby',
    description:
      'Twelve seats, Night Rite configured with all four patterns, roles not yet assigned.',
  },
  {
    id: 'night-1',
    code: 'QANGTA',
    title: 'Night 1 · introductions',
    description:
      'Game just started; the evil introduction task is the active night task.',
  },
  {
    id: 'discovery',
    code: 'QADISC',
    title: 'Day 1 · Discovery',
    description: 'Night 1 resolved; Discovery is open.',
  },
  {
    id: 'discussion',
    code: 'QADISS',
    title: 'Day 1 · Discussion',
    description: 'Discussion phase.',
  },
  {
    id: 'nomination',
    code: 'QANOMI',
    title: 'Day 1 · Nominations',
    description: 'Nominations open, none made yet.',
  },
  {
    id: 'defense',
    code: 'QADEFN',
    title: 'Day 1 · Defense',
    description: 'A nomination was made; the nominee is defending.',
  },
  {
    id: 'voting',
    code: 'QAVOTE',
    title: 'Day 1 · Voting',
    description: 'Voting is open on the nomination; half the table has voted.',
  },
  {
    id: 'day-review',
    code: 'QAREVW',
    title: 'Day 1 · Execution review',
    description: 'Votes tallied; the Storyteller reviews the execution.',
  },
  {
    id: 'rite-board',
    code: 'QARBRD',
    title: 'Night 2 · Escape Fearville',
    description: 'Night Rite open with only Escape Fearville vigils.',
  },
  {
    id: 'rite-grid',
    code: 'QARGRD',
    title: 'Night 2 · The Sphinx’s Riddles',
    description: 'Night Rite open with only Sphinx vigils.',
  },
  {
    id: 'rite-ritual',
    code: 'QARRTL',
    title: 'Night 2 · Ritual of Divination',
    description: 'Night Rite open with only Ritual vigils.',
  },
  {
    id: 'rite-lab',
    code: 'QARLAB',
    title: 'Night 2 · Alchemist’s Laboratory',
    description: 'Night Rite open with only Laboratory vigils.',
  },
  {
    id: 'ended-traveler',
    code: 'QAENDT',
    title: 'Game end · Traveler win',
    description:
      'Good wins and the Guardian (Traveler) also wins because the ward lived.',
  },
  {
    id: 'recap',
    code: 'QARCAP',
    title: 'Session recap',
    description: 'The finished game returned to the lobby with its recap.',
  },
  {
    id: 'hms-night-1',
    code: 'QAHMSN',
    title: 'Holy Moon and Stars · Night 1',
    description: 'Holy Moon and Stars script, first night.',
  },
  {
    id: 'hms-discovery',
    code: 'QAHMSD',
    title: 'Holy Moon and Stars · Discovery',
    description: 'Holy Moon and Stars script, Day 1 Discovery.',
  },
];

export const fixture = (id: unknown) => FIXTURES.find((f) => f.id === id);

const host = { id: 'host', host: true };
const teamOf = (id: string) => role(id)?.team ?? '';
const SEATS = 12; // divisible by three so a Ritual-only Rite plans cleanly

class Driver {
  g: Game;
  t: number;
  constructor(code: string, now: number) {
    this.g = newSandboxGame(code, 'QA Storyteller');
    // Every action is stamped in the recent past and strictly ordered.
    this.t = now - 120_000;
  }
  run(c: Command) {
    this.t += 1000;
    // The server ticks before every action; it also selects certified Rite puzzles.
    tick(this.g, this.t);
    return execute(this.g, host, c, this.t);
  }
  seat() {
    for (let i = this.g.players.length + 1; i <= SEATS; i++)
      this.run({ action: 'addDummy', name: `Player ${i}` });
  }
  rite(patterns: Pattern[]) {
    configureRite(this.g, {
      action: 'configureRite',
      config: { ...DEFAULT_CONFIG, patterns },
    });
  }
  start(prepare?: () => void) {
    this.run({ action: 'randomAssign' });
    prepare?.();
    const g = this.g;
    this.run({
      action: 'configure',
      bluff1: g.bluffs[0],
      bluff2: g.bluffs[1],
      bluff3: g.bluffs[2],
      redHerring: g.redHerring,
    });
    this.run({ action: 'start' });
  }
  finishNight() {
    for (let guard = 0; guard < 60; guard++) {
      const next = tasks(this.g).find((t) => !t.done);
      if (!next) break;
      this.run({ action: 'nightSkip', task: next.key, night: this.g.night });
    }
    this.run({ action: 'dawn' });
  }
  toNominations() {
    this.run({ action: 'advance' }); // discovery -> discussion
    this.run({ action: 'advance' }); // discussion -> nomination
  }
  nominate() {
    const alive = this.g.players.filter((p) => p.alive);
    this.run({ action: 'nominate', by: alive[0].id, target: alive[1].id });
  }
  vote(count: number) {
    for (const p of eligibleVoters(this.g).slice(0, count))
      this.run({ action: 'vote', player: p.id, yes: true });
  }
  // A quiet day: no nomination, so no execution to resolve.
  finishDay() {
    this.toNominations();
    this.run({ action: 'advance' }); // nomination -> dayReview
    this.run({ action: 'finishDay' });
  }
}

/** Build a fresh game for a fixture. `now` is the server clock. */
export function buildFixture(id: FixtureId, now: number): Game {
  const f = fixture(id);
  if (!f) throw Error('Unknown fixture.');
  const d = new Driver(f.code, now);
  d.seat();
  const hms = id.startsWith('hms-');
  if (hms) d.run({ action: 'setScript', script: 'holyMoonStars' });
  const pattern = id.startsWith('rite-') ? (id.slice(5) as Pattern) : undefined;
  d.rite(pattern ? [pattern] : DEFAULT_CONFIG.patterns);
  if (id === 'lobby') return d.g;
  d.start(
    id === 'ended-traveler' || id === 'recap'
      ? () => {
          // Swap a Traveler seat to Guardian so team counts stay standard.
          const p = d.g.players.find((q) => teamOf(q.role) === 'traveler');
          if (p)
            d.run({ action: 'assignRole', player: p.id, role: 'guardian' });
        }
      : undefined,
  );
  if (id === 'night-1' || id === 'hms-night-1') return d.g;
  d.finishNight();
  if (id === 'discovery' || id === 'hms-discovery') return d.g;
  if (id === 'discussion') {
    d.run({ action: 'advance' });
    return d.g;
  }
  if (id === 'nomination') {
    d.toNominations();
    return d.g;
  }
  if (id === 'defense' || id === 'voting' || id === 'day-review') {
    d.toNominations();
    d.nominate();
    if (id === 'defense') return d.g;
    d.run({ action: 'advance' });
    if (id === 'voting') {
      d.vote(Math.floor(eligibleVoters(d.g).length / 2));
      return d.g;
    }
    d.vote(Infinity);
    d.run({ action: 'advance' });
    return d.g;
  }
  if (pattern) {
    d.finishDay(); // Night 2: the Rite opens
    return d.g;
  }
  // ended-traveler and recap
  d.run({ action: 'end', winner: 'good' });
  if (id === 'recap') d.run({ action: 'returnLobby' });
  return d.g;
}
