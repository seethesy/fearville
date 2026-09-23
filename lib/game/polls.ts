import type { Game } from './types.ts';

export const NIGHT_QUESTIONS = [
  'Who is your favorite person at the table?',
  'Who would you trust to plan the best vacation?',
  'Who would befriend a ghost?',
  'Who would bring the best snacks to game night?',
  'Who would win a village talent show?',
  'Who would keep a pet dragon?',
  'Who would make the best detective in a movie?',
  'Who would throw the best surprise party?',
];

export function startNightPoll(g: Game) {
  const choices = NIGHT_QUESTIONS.filter((q) => q !== g.nightPoll?.question);
  g.nightPoll = {
    id: crypto.randomUUID(),
    night: g.night,
    question:
      choices[crypto.getRandomValues(new Uint32Array(1))[0] % choices.length],
    answers: {},
  };
}

export function closeNightPoll(g: Game) {
  const poll = g.nightPoll;
  if (!poll || poll.night !== g.night) return;
  const counts = new Map<string, number>();
  for (const target of Object.values(poll.answers))
    counts.set(target, (counts.get(target) ?? 0) + 1);
  const highest = Math.max(0, ...counts.values());
  g.previousNightPoll = {
    night: poll.night,
    question: poll.question,
    winners: g.players
      .filter((p) => highest > 0 && counts.get(p.id) === highest)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => p.name),
  };
}
