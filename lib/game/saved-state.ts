import { SCRIPTS, type Game } from './types.ts';

// Old tables without a script identifier also used the retired rules.
// Keep them intact in storage; changing a live table's rules would be unsafe.
const GAME_KEYS = new Set<string>([
  'ranked',
  'progression',
  'deferredNightTasks',
  'sandbox',
  'gameStartedAt',
  'gameEndedAt',
  'sessionNumber',
  'notebooks',
  'mvpVotes',
  'decisions',
  'recaps',
  'nightIntroductions',
  'nightChoiceDeadlines',
  'nightChoiceDeadline',
  'nightChoiceRound',
  'nightChoiceTasks',
  'script',
  'nightChoices',
  'hms',
  'dawnAnnouncement',
  'assignmentSeed',
  'code',
  'hostName',
  'phase',
  'day',
  'night',
  'players',
  'timers',
  'deadline',
  'remaining',
  'nominationRemaining',
  'nominees',
  'nominators',
  'ballots',
  'active',
  'done',
  'bluffs',
  'redHerring',
  'execution',
  'winner',
  'messages',
  'log',
  'history',
] satisfies (keyof Game)[]);

export function savedGame(state: string): Game {
  const game = JSON.parse(state) as Game;
  if (!game.script || !Object.hasOwn(SCRIPTS, game.script))
    throw Error(
      'This saved table uses a retired script. Create a new table with Horrors of Fearville or Holy Moon and Stars.',
    );
  return Object.fromEntries(
    Object.entries(game).filter(([key]) => GAME_KEYS.has(key)),
  ) as Game;
}
