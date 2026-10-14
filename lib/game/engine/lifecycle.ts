import {
  role,
  uuid,
  phaseName,
  type Game,
  type Player,
  type Phase,
} from '../types.ts';
import {
  hmsTasks,
  choiceTasks,
  choiceSpec,
  nightChoiceDeadlineFor,
  hmsSetupIssues,
  hmsBeginNight,
  hmsWinHints,
} from '../hms.ts';
import { isHof, hofFinish } from '../hof.ts';
import { beginRiteNight, tickRite, riteDeadlines } from '../../rite/engine.ts';
import { log, nameOf } from './shared.ts';
import { finishVotingIfReady, tally } from './voting.ts';
export function snapshot(g: Game, text: string, at: number) {
  const {
    history: _history,
    messages: _messages,
    log: _log,
    notebooks: _notebooks,
    recaps: _recaps,
    ...state
  } = g;
  g.history.push({ id: uuid(), text, at, before: JSON.stringify(state) });
}
export function setPhase(g: Game, phase: Phase, at: number, seconds?: number) {
  if (g.phase === 'ended' && phase !== 'ended') {
    delete g.gameEndedAt;
    delete g.mvpVotes;
  }
  g.phase = phase;
  if (phase === 'ended') {
    g.gameEndedAt ??= at;
    g.players.forEach((p) => (p.publicAlive = p.alive));
    if (isHof(g)) hofFinish(g, at);
  }
  g.remaining = g.sandbox ? 0 : (seconds ?? g.timers[phase] ?? 0);
  g.deadline = g.sandbox ? null : g.remaining ? at + g.remaining * 1000 : null;
  log(g, phaseName[phase] + (g.day ? ' · Day ' + g.day : ''), at, true);
}
export function beginNight(g: Game, at: number) {
  g.night++;
  g.nightChoices = {};
  g.nightChoiceDeadlines = {};
  g.nightIntroductions = {};
  g.nightChoiceRound = uuid();
  g.done = [];
  g.deferredNightTasks = [];
  g.active = null;
  g.players.forEach((p) => {
    p.poisoned = false;
    p.protected = false;
    p.master = '';
  });
  setPhase(g, 'night', at);
  g.nightChoiceDeadline = g.sandbox
    ? Number.MAX_SAFE_INTEGER
    : at + (g.timers.nightChoice ?? 60) * 1000;
  hmsBeginNight(g);
  g.nightChoiceTasks = choiceTasks(g);
  beginRiteNight(g, at);
  if (g.rite?.infoNight === g.night) {
    for (const p of g.players.filter((p) => p.alive && !p.departed)) {
      const target = g.players.find((q) => q.id === p.charge);
      const text =
        target && (p.role === 'executioner' || p.role === 'guardian')
          ? `Your ${p.role === 'guardian' ? 'ward' : 'execution target'} remains ${target.name}.`
          : g.hms?.constellation?.owner === p.id
            ? `Your Constellation remains ${g.hms.constellation.members.map((id) => nameOf(g, id)).join(', ')}. Its link ${g.hms.constellation.linked ? 'is active' : 'remains broken'}.`
            : '';
      if (text)
        g.messages.push({
          id: uuid(),
          from: 'host',
          to: p.id,
          text,
          at,
          kind: 'info',
        });
    }
  }
}
export function tasks(g: Game) {
  const defer = <T extends { key: string; done: boolean }>(items: T[]) => {
    const later = new Set(g.deferredNightTasks ?? []);
    return items.sort(
      (a, b) => Number(later.has(a.key)) - Number(later.has(b.key)),
    );
  };
  return defer(hmsTasks(g));
}
export function nightChoiceTask(g: Game, player?: string) {
  if (g.phase !== 'night') return null;

  if (!player) return null;
  const task = (g.nightChoiceTasks ?? []).find(
    (t) => t.player === player && !g.done.includes(t.key) && choiceSpec(g, t),
  );
  if (!task) return null;
  const spec = choiceSpec(g, task)!;
  return {
    ...task,
    round: g.nightChoiceRound ?? `${g.gameStartedAt ?? 0}:${g.night}`,
    count: spec.count,
    text: spec.text,
    guesses: spec.guesses,
    members: spec.members,
    optional: spec.optional,
    label: spec.label,
    flag: spec.flag,
    options: g.players
      .filter((p) => !p.departed)
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        eligible: spec.eligible(p),
      })),
  };
}
export function setupIssues(g: Game) {
  const seats = g.players.some((p) => p.seat < 1)
    ? ['Every player must claim a seat before roles are dealt.']
    : [];
  return [...seats, ...hmsSetupIssues(g)];
}
export function winHints(g: Game) {
  return hmsWinHints(g);
}
export function automaticWinner(g: Game) {
  const alive = g.players.filter((p) => p.alive);
  if (g.players.some((p) => p.role === 'atheist'))
    return alive.length <= 2 ? 'Evil' : '';
  if (!alive.some((p) => role(p.role)?.team === 'demon')) return 'Good';
  return alive.length <= 2 ? 'Evil' : '';
}
export function death(g: Game, p: Player, at: number, reason: string) {
  if (!p.alive) return;
  p.alive = false;
  p.nightDeath = g.phase === 'night' ? g.night : 0;
  if (g.phase !== 'night') p.publicAlive = false;
  log(g, `${p.name} died (${reason}).`, at, g.phase !== 'night');
}
export function tick(g: Game, now: number) {
  const riteChanged = tickRite(g, now);
  if (g.sandbox) return riteChanged;
  let changed =
    g.deadline !== null && g.deadline > now && finishVotingIfReady(g, now);
  for (let n = 0; n < 8 && g.deadline !== null && g.deadline <= now; n++) {
    const at = g.deadline;
    snapshot(g, `${phaseName[g.phase]} timer ended`, at);
    changed = true;
    switch (g.phase) {
      case 'discovery':
        setPhase(g, 'discussion', at);
        break;
      case 'discussion':
        setPhase(g, 'nomination', at);
        break;
      case 'nomination':
        setPhase(g, 'dayReview', at);
        break;
      case 'defense':
        setPhase(g, 'voting', at);
        break;
      case 'voting':
        tally(g, at);
        break;
      default:
        g.deadline = null;
    }
  }
  return changed || riteChanged;
}
export function nextDeadline(g: Game, after = 0): number | null {
  if (g.sandbox || g.phase === 'lobby' || g.phase === 'ended') return null;
  const times = [g.deadline ?? 0, ...riteDeadlines(g)];
  if (g.phase === 'night') {
    times.push(g.nightChoiceDeadline ?? 0);
    for (const task of g.nightChoiceTasks ?? [])
      if (!task.done && !g.nightChoices?.[task.key])
        times.push(nightChoiceDeadlineFor(g, task));
  }
  const future = times.filter(
    (time) =>
      Number.isFinite(time) && time > after && time < Number.MAX_SAFE_INTEGER,
  );
  return future.length ? Math.min(...future) : null;
}
