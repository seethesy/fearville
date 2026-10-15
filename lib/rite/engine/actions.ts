import { uuid, type Actor, type Command, type Game } from '../../game/types.ts';
import { slide, boardSolved, solveBoard } from '../board.ts';
import { pour, labSolved, solveLab } from '../lab.ts';
import { validTriples, validPlacements } from '../grid.ts';
import { validAltar } from '../ritual.ts';
import { check, configureRite } from './setup.ts';
import { finishVote, nextTurn, deal, turnPlayer, recordMove } from './night.ts';
export const REFRESH_INFO = {
  horrors: ['sheriff', 'hoflibrarian', 'teacher'],
  holyMoonStars: ['stargazer', 'astrologist', 'mystic', 'astronaut', 'prophet'],
};
export function refreshedInfoRoles(g: Game) {
  return g.rite?.infoNight === g.night
    ? REFRESH_INFO[g.script === 'holyMoonStars' ? 'holyMoonStars' : 'horrors']
    : [];
}
export function riteAction(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | null {
  if (!c.action.startsWith('rite') && c.action !== 'configureRite') return null;
  if (c.action === 'configureRite') {
    check(actor.host, 'Only the Storyteller can configure the Rite.');
    return configureRite(g, c);
  }
  const r = g.rite;
  check(r?.config.enabled, 'The Night Rite is disabled.');
  if (
    c.action === 'riteRedeal' ||
    c.action === 'riteForce' ||
    c.action === 'ritePassTurn'
  ) {
    check(actor.host, 'Only the Storyteller can do that.');
    if (c.action === 'ritePassTurn') {
      check(
        g.phase === 'night' &&
          r.status === 'open' &&
          (r.windowEnd === undefined || now < r.windowEnd) &&
          (r.lockUntil === undefined || now >= r.lockUntil),
        'No active Rite turn to pass.',
      );
      const squad = r.squads.find((item) => item.id === c.squad);
      check(
        squad &&
          !squad.completeNight &&
          !r.pendingRedeal?.includes(squad.id) &&
          (squad.state.type === 'board' || squad.state.type === 'lab') &&
          squad.state.turn &&
          !squad.state.solved,
        'Choose an active vigil.',
      );
      if (squad.state.turn.vote) finishVote(squad, now);
      else nextTurn(squad, now, 'hostPass');
      return 'The Storyteller passed this vigil’s turn.';
    }
    if (c.action === 'riteForce') {
      check(
        g.phase === 'night' && r.status === 'open',
        'No Rite window to resolve.',
      );
      r.windowEnd = now;
      r.pendingRedeal = [];
      for (const s of r.squads)
        if (s.state.type === 'board' || s.state.type === 'lab') {
          if (s.state.turn) {
            delete s.state.turn.vote;
            s.state.turn.token = uuid();
          }
        }
      return 'Rite closed. Current results will resolve at dawn.';
    }
    check(
      r.status !== 'complete',
      'A rewarded Rite cannot be redealt. Rewind first.',
    );
    const s = r.squads.find((s) => s.id === c.squad);
    check(s, 'Choose a vigil.');
    r.seed = uuid();
    r.epoch = uuid();
    if (s.kind === 'board' || s.kind === 'lab') {
      const key = `${s.id}:${s.kind}:${s.members.length}`;
      delete r.prepared?.[key];
      delete r.preparing?.[key];
      r.pendingRedeal = [...new Set([...(r.pendingRedeal ?? []), s.id])];
      return 'A fresh vigil puzzle is preparing.';
    }
    Object.assign(s, deal(g, s));
    delete s.completeNight;
    return 'Vigil puzzle redealt.';
  }
  check(
    !actor.host && g.players.some((p) => p.id === actor.id && !p.departed),
    'Use your own player seat.',
  );
  const s = r.squads.find((s) => s.members.includes(actor.id));
  check(s, 'Your vigil has not opened.');
  check(
    c.epoch === r.epoch && c.night === g.night,
    'This Rite action belongs to an earlier window.',
  );
  if (c.action === 'riteNotes') {
    check(
      s.state.type === 'grid' && validPlacements(c.placements),
      'Choose five different characters, places, and activities.',
    );
    s.state.placements[actor.id] = structuredClone(c.placements);
    return 'Working board saved.';
  }
  const failure = 'That action could not be completed.';
  check(
    g.phase === 'night' &&
      r.status === 'open' &&
      !s.completeNight &&
      !r.pendingRedeal?.includes(s.id) &&
      (r.lockUntil === undefined || now >= r.lockUntil) &&
      (r.windowEnd === undefined || now < r.windowEnd),
    failure,
  );
  if (c.action === 'riteGridSubmit') {
    check(s.state.type === 'grid' && validTriples(c.solution), failure);
    s.state.submissions[actor.id] = structuredClone(c.solution);
    return 'Your submission was recorded.';
  }
  if (c.action === 'riteRitualPerform' || c.action === 'riteRitualPick') {
    check(s.state.type === 'ritual', failure);
    const ritual = s.state.rituals[actor.id];
    check(
      g.night >= r.config.ritualFirstNight &&
        !ritual.doneNight &&
        !ritual.attempts.some((a) => a.night === g.night) &&
        validAltar(c.altar, ritual.controls),
      failure,
    );
    ritual.altar = structuredClone(c.altar);
    if (c.action === 'riteRitualPick') return 'Your altar was saved.';
    const ok = ritual.target.every((t) =>
      ritual.altar.some((a) => a.control === t.control && a.value === t.value),
    );
    ritual.attempts.push({ night: g.night, ok });
    if (ok) ritual.doneNight = g.night;
    return ok ? 'The ritual is performed.' : 'The ritual falters';
  }
  check(s.state.type === 'board' || s.state.type === 'lab', failure);
  const state = s.state,
    t = state.turn;
  check(t, failure);
  if (c.action === 'riteLabBallot') {
    check(
      state.type === 'lab' &&
        t.vote &&
        c.vote === t.vote.id &&
        actor.id !== t.vote.caller &&
        typeof c.yes === 'boolean' &&
        !Object.hasOwn(t.vote.ballots, actor.id),
      failure,
    );
    t.vote.ballots[actor.id] = c.yes;
    if (
      s.members
        .filter((id) => id !== t.vote!.caller)
        .every((id) => Object.hasOwn(t.vote!.ballots, id))
    )
      finishVote(s, now);
    return 'Your vote was recorded.';
  }
  check(
    !t.vote &&
      turnPlayer(t) === actor.id &&
      c.turn === t.token &&
      !state.solved,
    failure,
  );
  if (c.action === 'ritePass') {
    nextTurn(s, now, 'pass');
    return 'Your turn is over.';
  }
  if (c.action === 'riteBoardMove') {
    check(state.type === 'board', failure);
    const next = slide(state.blocks, {
      block: String(c.block),
      x: Number(c.x),
      y: Number(c.y),
    });
    check(next, failure);
    state.blocks = next;
    state.solved = boardSolved(next);
    state.distance =
      solveBoard(next, 1500, performance.now() + 4)?.length ?? null;
    nextTurn(
      s,
      now,
      'move',
      `${String(c.block)}: ${Number(c.x)},${Number(c.y)}`,
    );
    return 'Your move was recorded.';
  }
  if (c.action === 'riteLabPour') {
    check(state.type === 'lab', failure);
    const next = pour(state.vials, { from: String(c.from), to: String(c.to) });
    check(next, failure);
    state.history.push({
      night: g.night,
      before: structuredClone(state.vials),
      from: String(c.from),
      to: String(c.to),
    });
    state.vials = next;
    const solution = solveLab(next, 1500, performance.now() + 4);
    if (solution === null) {
      state.vials = structuredClone(state.nightStart);
      state.history = state.history.filter((h) => h.night !== g.night);
      t.ruined = uuid();
    }
    state.solved = labSolved(state.vials);
    state.distance = solution === null ? null : (solution?.length ?? null);
    recordMove(s, now, 'pour', `${String(c.from)} → ${String(c.to)}`);
    return solution === null
      ? 'The brew is ruined. The laboratory resets to the start of tonight.'
      : 'Your pour was recorded.';
  }
  if (c.action === 'riteLabCall') {
    check(
      state.type === 'lab' &&
        ['undo', 'reset'].includes(String(c.kind)) &&
        (c.kind !== 'undo' || state.history.at(-1)?.night === g.night),
      failure,
    );
    t.vote = {
      id: uuid(),
      kind: c.kind as 'undo' | 'reset',
      caller: actor.id,
      deadline: r.timerless || g.sandbox ? 0 : now + 15000,
      ballots: {},
    };
    return 'A vote has been called.';
  }
  throw Error(failure);
}
