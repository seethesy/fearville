import {
  role,
  scriptRoles,
  FIRST,
  OTHER,
  COUNTS,
  uuid,
  phaseName,
  type Game,
  type Actor,
  type Command,
  type Player,
  type Phase,
} from './types.ts';
import { startNightPoll, closeNightPoll } from './polls.ts';
import { assignRandomRoles } from './assignment.ts';
import {
  isHms,
  hms,
  hmsTasks,
  choiceTasks,
  choiceSpec,
  validateChoice,
  hmsSetupIssues,
  hmsBeginNight,
  hmsResolve,
  hmsDawn,
  hmsWinHints,
  hmsAction,
  applyStartState,
  actorOf,
  requireNoPendingDeath,
  ST,
} from './hms.ts';
export function requireThat(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export function person(g: Game, id: unknown) {
  const p = g.players.find((p) => p.id === id);
  requireThat(p, 'Player not found.');
  return p;
}
export const nameOf = (g: Game, id: string) =>
  id === 'storyteller'
    ? 'the Storyteller'
    : g.players.find((p) => p.id === id)?.name || 'Nobody';
export const healthy = (p: Player) =>
  !p.poisoned && p.role !== 'drunk' && !p.drunk;
export const evil = (p: Player) =>
  ['minion', 'demon'].includes(role(p.role)?.team || '');
export function log(g: Game, text: string, at: number, visible = false) {
  g.log.push({ id: uuid(), text, at, public: visible });
}
export function message(
  g: Game,
  to: string,
  text: string,
  at: number,
  kind: 'chat' | 'info' | 'correction' = 'info',
  from = 'host',
) {
  requireThat(text.length <= 12000, 'Message is too long.');
  g.messages.push({ id: uuid(), from, to, text, at, kind });
}
export function snapshot(g: Game, text: string, at: number) {
  const { history: _history, messages: _messages, log: _log, ...state } = g;
  g.history.push({ id: uuid(), text, at, before: JSON.stringify(state) });
}
export function setPhase(g: Game, phase: Phase, at: number, seconds?: number) {
  if (g.phase === 'night' && phase !== 'night') closeNightPoll(g);
  g.phase = phase;
  if (phase === 'ended') g.players.forEach((p) => (p.publicAlive = p.alive));
  g.remaining = seconds ?? g.timers[phase] ?? 0;
  g.deadline = g.remaining ? at + g.remaining * 1000 : null;
  log(g, phaseName[phase] + (g.day ? ' · Day ' + g.day : ''), at, true);
}
export function beginNight(g: Game, at: number) {
  g.night++;
  g.nightChoices = {};
  startNightPoll(g);
  g.done = [];
  g.active = null;
  g.players.forEach((p) => {
    p.poisoned = false;
    p.protected = false;
    p.master = '';
  });
  setPhase(g, 'night', at);
  g.nightChoiceDeadline = at + (g.timers.nightChoice ?? 60) * 1000;
  if (isHms(g)) {
    hmsBeginNight(g);
    g.nightChoiceTasks = choiceTasks(g);
    return;
  }
  g.nightChoiceTasks = tasks(g);
  // Preselect conditional Ravenkeeper targets without revealing night deaths.
  if (g.night > 1)
    for (const p of g.players.filter(
      (p) =>
        p.alive && (p.role === 'drunk' ? p.shown : p.role) === 'ravenkeeper',
    )) {
      g.nightChoiceTasks.push({
        key: 'ravenkeeper:' + p.id,
        role: 'ravenkeeper',
        player: p.id,
        name: 'Ravenkeeper · ' + p.name,
        done: false,
      });
    }
}
export function tasks(g: Game) {
  if (isHms(g)) return hmsTasks(g);
  const order = g.night === 1 ? FIRST : OTHER;
  return order.flatMap((r) => {
    if (r === 'minioninfo' || r === 'demoninfo') {
      if (g.players.length < 7) return [];
      return [
        {
          key: r,
          role: r,
          player: '',
          name:
            r === 'minioninfo' ? 'Haunt introductions' : 'Horror introductions',
          done: g.done.includes(r),
        },
      ];
    }
    return g.players
      .filter((p) => {
        const shown = p.role === 'drunk' ? p.shown : p.role;
        return (
          shown === r &&
          (r === 'ravenkeeper' ? p.nightDeath === g.night : p.alive) &&
          (r !== 'undertaker' || !!g.execution)
        );
      })
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        key: r + ':' + p.id,
        role: r,
        player: p.id,
        name: role(r)!.name + ' · ' + p.name,
        done: g.done.includes(r + ':' + p.id),
      }));
  });
}
export function nightChoiceTask(g: Game, player?: string) {
  if (g.phase !== 'night') return null;
  if (isHms(g)) {
    if (!player) return null;
    const task = (g.nightChoiceTasks ?? []).find(
      (t) => t.player === player && !g.done.includes(t.key) && choiceSpec(g, t),
    );
    if (!task) return null;
    const spec = choiceSpec(g, task)!;
    return {
      ...task,
      round: g.nightPoll?.id ?? String(g.night),
      count: spec.count,
      text: spec.text,
      guesses: spec.guesses,
      members: spec.members,
      optional: spec.optional,
      label: spec.label,
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
  const task = player
    ? (g.nightChoiceTasks ?? tasks(g)).find(
        (t) => t.player === player && !g.done.includes(t.key),
      )
    : tasks(g).find((t) => !t.done);
  if (
    !task ||
    ![
      'poisoner',
      'monk',
      'imp',
      'butler',
      'fortuneteller',
      'ravenkeeper',
    ].includes(task.role)
  )
    return null;
  return {
    ...task,
    round: g.nightPoll?.id ?? String(g.night),
    count: task.role === 'fortuneteller' ? 2 : 1,
    options: g.players
      .filter(
        (p) =>
          !p.departed &&
          (!['imp', 'poisoner'].includes(task.role) || p.publicAlive) &&
          (!['monk', 'butler'].includes(task.role) || p.id !== task.player),
      )
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        eligible:
          !['monk', 'butler'].includes(task.role) || p.id !== task.player,
      })),
  };
}
export function setupIssues(g: Game) {
  if (isHms(g)) return hmsSetupIssues(g);
  const issues: string[] = [];
  const expected = COUNTS[g.players.length]?.slice();
  if (!expected) return ['Fearville Classic requires 5–15 players.'];
  if (g.players.some((p) => p.role === 'baron')) {
    expected[0] -= 2;
    expected[1] += 2;
  }
  const actual = ['townsfolk', 'outsider', 'minion', 'demon'].map(
    (t) => g.players.filter((p) => role(p.role)?.team === t).length,
  );
  if (actual.some((v, i) => v !== expected[i]))
    issues.push(
      `Expected ${expected[0]} Villagers, ${expected[1]} Fools, ${expected[2]} Haunts and 1 Horror.`,
    );
  if (g.players.some((p) => !role(p.role)))
    issues.push('Assign a character to every seat.');
  if (new Set(g.players.map((p) => p.role)).size !== g.players.length)
    issues.push('Characters must be unique at setup.');
  const drunk = g.players.find((p) => p.role === 'drunk');
  if (
    drunk &&
    (!role(drunk.shown) ||
      role(drunk.shown)?.team !== 'townsfolk' ||
      g.players.some((p) => p.role === drunk.shown))
  )
    issues.push('Give the Drunk a Villager character that is not in play.');
  if (
    g.players.some(
      (p) => p.role === 'fortuneteller' || p.shown === 'fortuneteller',
    ) &&
    !g.players.some((p) => p.id === g.redHerring && !evil(p))
  )
    issues.push('Choose a good player as the Fortune Teller’s red herring.');
  if (
    g.players.length >= 7 &&
    (g.bluffs.length !== 3 ||
      new Set(g.bluffs).size !== 3 ||
      g.bluffs.some(
        (r) =>
          !role(r) ||
          ['minion', 'demon'].includes(role(r)!.team) ||
          g.players.some((p) => p.role === r || p.shown === r),
      ))
  )
    issues.push(
      'Choose three distinct, out-of-play good characters as Horror bluffs.',
    );
  return issues;
}
export function candidate(g: Game) {
  const eligible = g.ballots.filter(
    (b) => b.count !== undefined && b.count >= b.threshold,
  );
  const max = Math.max(0, ...eligible.map((b) => b.count!));
  const top = eligible.filter((b) => b.count === max);
  return {
    target: top.length === 1 ? top[0].target : '',
    count: max,
    tied: top.length > 1,
  };
}
export function winHints(g: Game) {
  if (isHms(g)) return hmsWinHints(g);
  const alive = g.players.filter((p) => p.alive);
  const hints: string[] = [];
  if (!alive.some((p) => p.role === 'imp'))
    hints.push(
      'No living Horror: good wins unless a succession must be resolved.',
    );
  if (alive.length <= 2 && alive.some((p) => p.role === 'imp'))
    hints.push('Two or fewer living players with a living Horror: evil wins.');
  if (
    g.phase === 'dayReview' &&
    !candidate(g).target &&
    alive.length === 3 &&
    alive.some((p) => p.role === 'mayor' && healthy(p))
  )
    hints.push(
      'Three living players, a healthy Mayor, and no execution: good wins at the end of today.',
    );
  return hints;
}
export function death(
  g: Game,
  p: Player,
  at: number,
  reason: string,
  successor?: string,
) {
  if (!p.alive) return;
  const aliveBefore = g.players.filter((q) => q.alive).length;
  p.alive = false;
  p.nightDeath = g.phase === 'night' ? g.night : 0;
  if (g.phase !== 'night') p.publicAlive = false;
  log(g, `${p.name} died (${reason}).`, at, g.phase !== 'night');
  if (p.role === 'imp') {
    const scarlet = g.players.find(
      (q) => q.alive && q.role === 'scarletwoman' && healthy(q),
    );
    const next =
      aliveBefore >= 5 && scarlet
        ? scarlet
        : successor
          ? person(g, successor)
          : null;
    if (next) {
      requireThat(
        next.alive && role(next.role)?.team === 'minion',
        'The successor must be a living Haunt.',
      );
      next.role = 'imp';
      next.shown = 'imp';
      message(
        g,
        next.id,
        'Your character is now Imp. Your alignment is evil.',
        at,
      );
      log(g, `${next.name} became the Imp.`, at); // A new Imp from a self-kill does not attack again this night.
      if (g.phase === 'night') g.done.push('imp:' + next.id);
    }
  }
}
export function eligibleVoters(g: Game) {
  return g.players.filter(
    (p) => p.id !== g.active?.target && !p.departed && (p.alive || p.ghost),
  );
}
export function finishVotingIfReady(g: Game, at: number) {
  if (g.phase !== 'voting' || !g.active) return false;
  if (!eligibleVoters(g).every((p) => Object.hasOwn(g.active!.votes, p.id)))
    return false;
  snapshot(g, 'All eligible votes received', at);
  tally(g, at);
  return true;
}
export function tally(g: Game, at: number) {
  const b = g.active;
  requireThat(b, 'No active ballot.');
  b.voterState = g.players.map(
    ({ id, alive, ghost, departed, role, poisoned, master }) => ({
      id,
      alive,
      ghost,
      departed,
      role,
      poisoned,
      master,
    }),
  );
  for (const p of eligibleVoters(g))
    if (!Object.hasOwn(b.votes, p.id)) b.votes[p.id] = null;
  b.invalid = [];
  b.spentGhosts = [];
  b.threshold = Math.ceil(g.players.filter((p) => p.alive).length / 2);
  const valid = new Set(
    g.players
      .filter(
        (p) =>
          p.id !== b.target &&
          !p.departed &&
          b.votes[p.id] === true &&
          (p.alive || p.ghost),
      )
      .map((p) => p.id),
  );
  for (const p of g.players) {
    if (
      valid.has(p.id) &&
      p.alive &&
      p.role === 'butler' &&
      healthy(p) &&
      !valid.has(p.master)
    ) {
      valid.delete(p.id);
      b.invalid.push(p.id);
    }
  }
  b.count = valid.size;
  for (const p of g.players) {
    if (!p.alive && valid.has(p.id)) {
      p.ghost = false;
      b.spentGhosts.push(p.id);
    }
  }
  g.ballots.push(b);
  g.active = null;
  log(
    g,
    `${nameOf(g, b.target)} received ${b.count} yes votes (threshold ${b.threshold}).`,
    at,
    true,
  );
  g.nominationRemaining += 30;
  setPhase(g, 'nomination', at, g.nominationRemaining);
  if (g.nominationRemaining <= 0) setPhase(g, 'dayReview', at);
}
export function tick(g: Game, now: number) {
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
  return changed;
}
function clean(x: unknown, max = 500) {
  return (
    typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean'
      ? String(x)
      : ''
  )
    .trim()
    .slice(0, max);
}
function override(c: Command) {
  return !!c.override && clean(c.reason).length >= 5;
}
function enforce(condition: unknown, message: string, c: Command) {
  requireThat(
    condition || override(c),
    message + ' Use a Storyteller override with a reason if needed.',
  );
}
function infoResult(g: Game, r: string, p: Player, c: Command) {
  const a = c.target ? person(g, c.target) : null,
    b = c.target2 ? person(g, c.target2) : null;
  let info = clean(c.info, 12000);
  if (['washerwoman', 'librarian', 'investigator'].includes(r)) {
    if (r === 'librarian' && c.zero) {
      enforce(
        !g.players.some((q) => role(q.role)?.team === 'outsider') ||
          !healthy(p),
        'Fools are in play.',
        c,
      );
      return 'You learn that there are no Fools in play.';
    }
    requireThat(a && b && a.id !== b.id, 'Choose two different players.');
    const t =
      r === 'washerwoman'
        ? 'townsfolk'
        : r === 'librarian'
          ? 'outsider'
          : 'minion';
    requireThat(
      role(clean(c.reveal))?.team === t,
      'Choose a character of the correct type.',
    );
    enforce(
      !healthy(p) || a.role === c.reveal || b.role === c.reveal,
      'Neither selected player has that character. Consider Spy or Recluse registration.',
      c,
    );
    return `One of ${a.name} and ${b.name} is the ${role(clean(c.reveal))!.name}.`;
  }
  if (r === 'chef') {
    const seats = [...g.players].sort((a, b) => a.seat - b.seat);
    const count = seats.reduce(
      (n, q, i) => n + Number(evil(q) && evil(seats[(i + 1) % seats.length])),
      0,
    );
    if (!info) info = String(count);
    enforce(
      !healthy(p) || info === String(count),
      'This differs from actual alignment. Review Spy/Recluse registration.',
      c,
    );
    return `You learn ${info} adjacent evil pairs.`;
  }
  if (r === 'empath') {
    const seats = [...g.players].sort((a, b) => a.seat - b.seat);
    const at = seats.findIndex((q) => q.id === p.id);
    const neighbors = [1, -1].map((dir) => {
      for (let i = 1; i < seats.length; i++) {
        const q = seats[(at + dir * i + seats.length) % seats.length];
        if (q.alive) return q;
      }
      return null;
    });
    const count = neighbors.reduce((n, q) => n + Number(q && evil(q)), 0);
    if (!info) info = String(count);
    enforce(
      !healthy(p) || info === String(count),
      'This differs from actual living neighbors. Review registration.',
      c,
    );
    return `You learn ${info} evil living neighbors.`;
  }
  if (r === 'fortuneteller') {
    requireThat(a && b && a.id !== b.id, 'Choose two different players.');
    const actual = [a, b].some((q) => q.role === 'imp' || q.id === g.redHerring)
      ? 'Yes'
      : 'No';
    if (!info) info = actual;
    requireThat(['Yes', 'No'].includes(info), 'Answer Yes or No.');
    enforce(
      !healthy(p) || info === actual,
      'This differs from the Horror/red herring check. Review Recluse registration.',
      c,
    );
    return `${a.name} and ${b.name}: ${info}.`;
  }
  if (r === 'undertaker') {
    const dead = person(g, g.execution);
    const revealed = clean(c.reveal) || dead.role;
    requireThat(role(revealed), 'Choose a character.');
    enforce(
      !healthy(p) || revealed === dead.role,
      'This differs from the executed character. Review registration.',
      c,
    );
    return `The executed player was the ${role(revealed)!.name}.`;
  }
  if (r === 'ravenkeeper') {
    requireThat(a, 'Choose the player checked by the Ravenkeeper.');
    const revealed = clean(c.reveal) || a.role;
    requireThat(role(revealed), 'Choose a character.');
    enforce(
      !healthy(p) || revealed === a.role,
      'This differs from the chosen player’s character. Review registration.',
      c,
    );
    return `${a.name} is the ${role(revealed)!.name}.`;
  }
  if (r === 'spy') {
    const grim = g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map(
        (q) =>
          `${q.seat}. ${q.name}: ${role(q.role)?.name} ${q.role === 'drunk' ? '(shown ' + role(q.shown)?.name + ')' : ''}; ${q.alive ? 'alive' : 'dead'}${q.poisoned ? '; poisoned' : ''}${q.protected ? '; Monk protection' : ''}${q.id === g.redHerring ? '; red herring' : ''}${q.master ? '; master: ' + nameOf(g, q.master) : ''}${q.used ? '; ability spent' : ''}${q.notes ? '; ' + q.notes : ''}`,
      )
      .join('\n');
    if (!healthy(p)) {
      requireThat(info, 'Supply a fabricated Grimoire for the poisoned Spy.');
      return info;
    }
    return (
      grim + '\nDemon bluffs: ' + g.bluffs.map((r) => role(r)?.name).join(', ')
    );
  }
  return info;
}
export function execute(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string {
  requireThat(
    actor.host || g.players.some((p) => p.id === actor.id && !p.departed),
    'This seat is no longer available.',
  );
  const hostActions = [
    'setScript',
    'correctVote',
    'moveSeat',
    'randomAssign',
    'configure',
    'edit',
    'start',
    'pause',
    'resume',
    'extend',
    'advance',
    'dawn',
    'night',
    'nightSkip',
    'finishDay',
    'undo',
    'rewind',
    'end',
    'slayer',
    'virgin',
    'overridePhase',
    'revoke',
    'resolveDeath',
    'prophetReveal',
    'soberFools',
    'execute',
  ];
  if (hostActions.includes(c.action))
    requireThat(actor.host, 'Only the Storyteller can do that.');
  if (c.action === 'nightChoice') {
    requireThat(
      g.nightChoiceDeadline === undefined || now < g.nightChoiceDeadline,
      'The night choice timer has ended. The Storyteller will decide.',
    );
    const task = nightChoiceTask(g, actor.id);
    requireThat(
      !actor.host &&
        task &&
        task.player === actor.id &&
        task.key === c.task &&
        task.round === c.round,
      'This night choice is no longer available.',
    );
    if (isHms(g)) {
      g.nightChoices ??= {};
      g.nightChoices[task.key] = validateChoice(g, task, c);
      return g.nightChoices[task.key].pass
        ? 'Pass sent. The Storyteller will confirm.'
        : 'Choice sent. Waiting for the Storyteller to confirm.';
    }
    requireThat(
      task.options.some((p) => p.eligible && p.id === c.target),
      'Choose an eligible player.',
    );
    if (task.count === 2)
      requireThat(
        c.target !== c.target2 &&
          task.options.some((p) => p.eligible && p.id === c.target2),
        'Choose two different eligible players.',
      );
    g.nightChoices ??= {};
    g.nightChoices[task.key] = {
      id: uuid(),
      target: String(c.target),
      target2: task.count === 2 ? String(c.target2) : '',
    };
    return 'Choice sent. Waiting for the Storyteller to confirm.';
  }
  if (c.action === 'nightPoll') {
    requireThat(!actor.host, 'Only seated players can answer the poll.');
    person(g, actor.id);
    const poll = g.nightPoll;
    requireThat(
      g.phase === 'night' && poll && poll.night === g.night,
      'This night poll is closed.',
    );
    requireThat(
      c.poll === poll.id,
      'The night poll changed. Review the new question.',
    );
    const target = person(g, c.target);
    poll.answers[actor.id] = target.id;
    return (
      'Save your private poll answer: ' +
      target.name +
      '. You can change it until dawn.'
    );
  }
  if (c.action === 'chat') {
    const channel = g.hms?.channel;
    const to =
      c.to === 'channel' &&
      channel &&
      g.phase === 'night' &&
      (actor.id === channel.a || actor.id === channel.b)
        ? 'channel:' + channel.id
        : actor.host
          ? clean(c.to)
          : 'host';
    requireThat(
      to.startsWith('channel:') ||
        to === 'host' ||
        to === 'all' ||
        g.players.some((p) => p.id === to && !p.departed),
      'Choose a recipient.',
    );
    const text = clean(c.text, 4000);
    requireThat(text, 'Write a message.');
    if (c.messageId !== undefined) {
      requireThat(
        typeof c.messageId === 'string' && /^[a-f0-9-]{36}$/i.test(c.messageId),
        'Invalid message identifier.',
      );
      const previous = g.messages.find((m) => m.id === c.messageId);
      if (previous) {
        requireThat(
          previous.from === actor.id &&
            previous.to === to &&
            previous.text === text,
          'Message identifier already used.',
        );
        return 'Message sent.';
      }
    }
    message(g, to, text, now, 'chat', actor.id);
    if (to.startsWith('channel:'))
      return 'Message sent through the Medium’s channel.';
    if (typeof c.messageId === 'string')
      g.messages[g.messages.length - 1].id = c.messageId;
    return (
      'Send this message ' +
      (to === 'all'
        ? 'to everyone'
        : `to ${to === 'host' ? 'the Storyteller' : nameOf(g, to)}`) +
      ':\n' +
      text
    );
  }
  if (c.action === 'undo' || c.action === 'rewind') {
    const index =
      c.action === 'undo'
        ? g.history.length - 1
        : g.history.findIndex((h) => h.id === c.history);
    requireThat(index >= 0, 'No saved decision to restore.');
    const entry = g.history[index];
    const state = JSON.parse(entry.before);
    requireThat(
      g.players.every((p) => state.players.some((q: Player) => q.id === p.id)),
      'Cannot rewind before a player joined. Correct seats manually.',
    );
    delete g.nightPoll;
    delete g.nightChoices;
    delete g.nightChoiceDeadline;
    delete g.nightChoiceTasks;
    delete g.script;
    delete g.dawnAnnouncement;
    delete g.previousNightPoll;
    delete g.hms;
    Object.assign(g, state);
    g.history = g.history.slice(0, index);
    if (g.deadline !== null) {
      g.remaining = Math.max(1, Math.ceil((g.deadline - entry.at) / 1000));
      g.deadline = null;
    }
    message(
      g,
      'all',
      'The Storyteller corrected an earlier decision. Check the current phase and your character. Previously delivered information cannot be unseen.',
      now,
      'correction',
    );
    log(g, `Restored state before: ${entry.text}`, now, true);
    return (
      'Restore the entire game state before “' +
      entry.text +
      '”. Later game decisions will be reverted; messages remain, and any active timer will be paused.'
    );
  }
  if (!['vote', 'chat'].includes(c.action))
    snapshot(
      g,
      c.action === 'night'
        ? 'Resolve night task'
        : c.action === 'edit'
          ? 'Edit ' + nameOf(g, clean(c.player))
          : c.action,
      now,
    );
  if (
    g.phase === 'night' &&
    ['night', 'nightSkip', 'dawn'].includes(c.action)
  ) {
    requireThat(
      g.nightChoiceDeadline === undefined || now >= g.nightChoiceDeadline,
      'Wait for the night choice timer to finish.',
    );
  }
  if (isHms(g)) {
    const result = hmsAction(g, actor, c, now);
    if (result === 'END_GAME') {
      setPhase(g, 'ended', now);
      return 'The Storyteller is executed with the Atheist in play: good wins.';
    }
    if (result === 'END_DAY') {
      beginNight(g, now);
      return 'The day ends early. Night begins.';
    }
    if (result !== null) return result;
  }
  switch (c.action) {
    case 'setScript': {
      requireThat(
        g.phase === 'lobby',
        'Change the role script before starting the game.',
      );
      requireThat(
        c.script === 'classic' || c.script === 'holyMoonStars',
        'Choose a valid role script.',
      );
      g.script = c.script as 'classic' | 'holyMoonStars';
      log(g, 'Updated role script.', now, true);
      return 'Role script updated.';
    }
    case 'moveSeat': {
      const p = person(g, c.player);
      const seat = Number(c.seat);
      requireThat(
        Number.isInteger(seat) && seat >= 1 && seat <= g.players.length,
        'Choose a valid seat.',
      );
      const ordered = g.players
        .slice()
        .sort((a, b) => a.seat - b.seat)
        .filter((q) => q.id !== p.id);
      ordered.splice(seat - 1, 0, p);
      ordered.forEach((q, i) => {
        q.seat = i + 1;
      });
      log(g, `${p.name} moved to seat ${seat}.`, now, true);
      return `Moved ${p.name} to seat ${seat}.`;
    }
    case 'randomAssign': {
      requireThat(
        g.phase === 'lobby',
        'Random assignment is only available in the lobby.',
      );
      const summary = assignRandomRoles(g, c.roles);
      g.assignmentSeed = uuid();
      log(g, 'Randomly assigned characters and setup reminders.', now);
      return summary;
    }
    case 'configure': {
      for (const key of Object.keys({ nightChoice: 60, ...g.timers })) {
        const n = Number(
          c[key] ??
            (key === 'nightChoice' ? (g.timers.nightChoice ?? 60) : undefined),
        );
        requireThat(
          Number.isInteger(n) && n >= 5 && n <= 3600,
          'Each timer must be 5–3600 seconds.',
        );
        g.timers[key] = n;
      }
      g.bluffs = [c.bluff1, c.bluff2, c.bluff3]
        .map((v) => clean(v))
        .filter(Boolean);
      g.redHerring = clean(c.redHerring);
      log(g, 'Updated timers and setup reminders.', now);
      return 'Save timers, Horror bluffs, and red herring. Active timers keep their current time.';
    }
    case 'edit': {
      const p = person(g, c.player);
      const name = clean(c.name, 32);
      requireThat(name, 'Enter a seat name.');
      requireThat(
        !g.players.some(
          (q) => q.id !== p.id && q.name.toLowerCase() === name.toLowerCase(),
        ),
        'Seat names must be unique.',
      );
      const seat = Number(c.seat);
      requireThat(
        Number.isInteger(seat) && seat >= 1 && seat <= g.players.length,
        'Choose a valid seat number.',
      );
      const other = g.players.find((q) => q.seat === seat);
      if (other) other.seat = p.seat;
      p.seat = seat;
      p.name = name;
      requireThat(role(clean(c.role)), 'Choose a character.');
      p.role = clean(c.role);
      if (isHms(g)) {
        const shown = clean(c.shown);
        p.shown =
          p.role === 'lostsoul'
            ? shown || 'lostsoul'
            : shown && role(shown)?.team === 'townsfolk'
              ? shown
              : p.role;
        if (p.role === 'lostsoul') p.acts = clean(c.acts);
        else delete p.acts;
        p.drunk = !!c.drunk;
        p.marked = !!c.marked;
        const lives = Number(c.extraLife ?? 0);
        requireThat(
          Number.isInteger(lives) && lives >= 0 && lives <= 3,
          'Extra lives must be 0–3.',
        );
        p.extraLife = lives;
      } else p.shown = p.role === 'drunk' ? clean(c.shown) : p.role;
      requireThat(
        p.role !== 'drunk' || role(p.shown)?.team === 'townsfolk',
        'The Drunk must be shown a Villager.',
      );
      p.poisoned = !!c.poisoned;
      p.protected = !!c.protected;
      p.ghost = c.ghost !== false;
      p.used = !!c.used;
      p.notes = clean(c.notes, 1000);
      if (c.alive === false && p.alive)
        death(g, p, now, 'Storyteller correction');
      if (c.alive === true) {
        p.alive = true;
        p.nightDeath = 0;
      }
      if (g.phase !== 'night') p.publicAlive = p.alive;
      if (g.phase !== 'lobby')
        message(
          g,
          p.id,
          `Your character is ${role(p.shown)?.name}. Your alignment is ${evil(p) ? 'evil' : 'good'}.`,
          now,
        );
      log(
        g,
        `Updated seat ${p.seat}: ${p.name}, actual character ${role(p.role)?.name}.`,
        now,
      );
      return `Update ${p.name} at seat ${p.seat}. Actual: ${role(p.role)?.name}; shown: ${role(p.shown)?.name}. ${g.phase !== 'lobby' ? 'Send their current character privately.' : ''}`;
    }
    case 'start': {
      requireThat(g.phase === 'lobby', 'The game has already started.');
      requireThat(
        g.players.length >= 5 && g.players.length <= 15,
        'Join 5–15 players before starting.',
      );
      requireThat(
        g.players.every((p) => role(p.role)),
        'Assign all characters first.',
      );
      requireThat(
        g.players.every((p) =>
          scriptRoles(g.script).some((r) => r.id === p.role),
        ),
        'Assign characters from this script.',
      );
      requireThat(
        !g.players.some(
          (p) => p.role === 'drunk' && role(p.shown)?.team !== 'townsfolk',
        ),
        'Choose the Drunk’s shown Villager.',
      );
      enforce(setupIssues(g).length === 0, setupIssues(g).join(' '), c);
      if (isHms(g)) applyStartState(g);
      g.players.forEach((p) =>
        message(
          g,
          p.id,
          `Your character is ${role(p.shown || p.role)?.name}. Your alignment is ${evil(p) ? 'evil' : 'good'}.\n${role(p.shown || p.role)?.description}`,
          now,
        ),
      );
      beginNight(g, now);
      return 'Deal every player their private character and begin the first night.';
    }
    case 'pause':
      requireThat(g.deadline !== null, 'No running timer.');
      g.remaining = Math.max(0, Math.ceil((g.deadline - now) / 1000));
      g.deadline = null;
      return 'Pause the shared timer for everyone.';
    case 'resume':
      requireThat(g.deadline === null && g.remaining > 0, 'No paused timer.');
      g.deadline = now + g.remaining * 1000;
      return 'Resume the shared timer.';
    case 'extend':
      requireThat(g.timers[g.phase], 'This phase has no timer.');
      {
        const seconds = Number(c.seconds);
        requireThat(
          Number.isInteger(seconds) && seconds >= 1 && seconds <= 3600,
          'Add 1–3600 seconds.',
        );
        if (g.deadline !== null) g.deadline += seconds * 1000;
        else g.remaining += seconds;
        return `Add ${seconds} seconds.`;
      }
    case 'advance': {
      requireThat(
        ['discovery', 'discussion', 'nomination', 'defense', 'voting'].includes(
          g.phase,
        ),
        'No timed phase to advance.',
      );
      if (g.phase === 'voting') tally(g, now);
      else
        setPhase(
          g,
          (
            {
              discovery: 'discussion',
              discussion: 'nomination',
              nomination: 'dayReview',
              defense: 'voting',
            } as Record<string, Phase>
          )[g.phase],
          now,
        );
      return 'End the current timer and advance to ' + phaseName[g.phase] + '.';
    }
    case 'dawn':
      requireThat(g.phase === 'night', 'It is not night.');
      enforce(
        tasks(g).every((t) => t.done),
        'Night tasks remain.',
        c,
      );
      if (isHms(g)) hmsDawn(g, now);
      g.dawnAnnouncement = {
        id: uuid(),
        night: g.night,
        names: g.players
          .filter((p) => !p.alive && p.nightDeath === g.night)
          .map((p) => p.name),
      };
      g.players.forEach((p) => {
        p.publicAlive = p.alive;
        p.protected = false;
      });
      g.day = g.night;
      g.nominees = [];
      g.nominators = [];
      g.ballots = [];
      g.execution = '';
      setPhase(g, 'discovery', now);
      return (
        'Announce night deaths and begin Discovery. ' + winHints(g).join(' ')
      );
    case 'nightSkip': {
      requireThat(g.phase === 'night', 'It is not night.');
      const task = tasks(g).find((t) => !t.done);
      requireThat(task, 'All night tasks are complete.');
      requireThat(clean(c.reason).length >= 5, 'Give a reason for skipping.');
      if (isHms(g)) {
        requireNoPendingDeath(g);
        if (task.key === 'deaths')
          hms(g).deathQueue = hms(g).deathQueue.filter((d) => !d.night);
        if (task.key === 'plague') delete hms(g).infected;
      }
      g.done.push(task.key);
      log(g, 'Skipped ' + task.name + ': ' + clean(c.reason), now);
      return (
        'Skip ' +
        task.name +
        ' without applying an effect or sending information.'
      );
    }
    case 'night': {
      requireThat(g.phase === 'night', 'It is not night.');
      const t = tasks(g).find((t) => !t.done);
      requireThat(t && t.key === c.task, 'The active night task changed.');
      const r = t.role;
      if (isHms(g)) {
        const choice = g.nightChoices?.[t.key];
        requireThat(
          (c.choiceId || '') === (choice?.id || ''),
          'The player changed their choice. Review it before confirming.',
        );
        const acting = t.player ? actorOf(g, t.player) : null;
        requireThat(
          !acting?.poisoned || c.poisonAcknowledged === true,
          'This player is poisoned. Acknowledge the warning before confirming.',
        );
        return hmsResolve(g, t, c, now);
      }
      if (r === 'minioninfo') {
        const text =
          'The Horror is ' +
          g.players
            .filter((p) => p.role === 'imp')
            .map((p) => p.name)
            .join(', ') +
          '. Haunts: ' +
          g.players
            .filter((p) => role(p.role)?.team === 'minion')
            .map((p) => p.name)
            .join(', ') +
          '.';
        g.players
          .filter((p) => role(p.role)?.team === 'minion')
          .forEach((p) => message(g, p.id, text, now));
        g.done.push(t.key);
        return text + ' Send privately to Haunts.';
      }
      if (r === 'demoninfo') {
        const text =
          'Your Haunts: ' +
          g.players
            .filter((p) => role(p.role)?.team === 'minion')
            .map((p) => p.name)
            .join(', ') +
          '. Out-of-play bluffs: ' +
          g.bluffs.map((r) => role(r)?.name).join(', ') +
          '.';
        g.players
          .filter((p) => p.role === 'imp')
          .forEach((p) => message(g, p.id, text, now));
        g.done.push(t.key);
        return text + ' Send privately to the Horror.';
      }
      const p = person(g, t.player);
      const choice = g.nightChoices?.[t.key];
      requireThat(
        (c.choiceId || '') === (choice?.id || ''),
        'The player changed their choice. Review it before confirming.',
      );
      requireThat(
        !p.poisoned || c.poisonAcknowledged === true,
        'This player is poisoned. Acknowledge the warning before confirming.',
      );
      let result = '';
      if (['poisoner', 'monk', 'imp', 'butler'].includes(r)) {
        const target = person(g, c.target);
        if (r === 'monk' || r === 'butler')
          enforce(
            target.id !== p.id,
            'Choose someone other than the acting player.',
            c,
          );
        if (r === 'poisoner') {
          if (healthy(p)) target.poisoned = true;
          result = `Record ${target.name} as the Poisoner’s choice. ${healthy(p) || target.id === p.id ? 'Poison is applied until dusk.' : 'The acting player is impaired; no poison is applied.'}`;
        }
        if (r === 'monk') {
          if (healthy(p)) target.protected = true;
          result = `Record ${target.name} as the Monk’s choice. ${healthy(p) ? 'Horror protection is applied for tonight.' : 'The acting player is impaired; no protection is applied.'}`;
        }
        if (r === 'butler') {
          p.master = target.id;
          result = `Record ${target.name} as ${p.name}’s master.`;
        }
        if (r === 'imp') {
          let victim = target;
          if (target.role === 'mayor' && healthy(target) && c.redirect)
            victim = person(g, c.redirect);
          const blocked =
            !healthy(p) ||
            victim.protected ||
            (victim.role === 'soldier' && healthy(victim));
          const kill =
            c.outcome === 'kill'
              ? true
              : c.outcome === 'spare'
                ? false
                : !blocked;
          if (kill === blocked)
            requireThat(
              override(c),
              'Changing the suggested death outcome requires an override reason.',
            );
          if (kill && victim.alive) {
            if (
              victim.id === p.id &&
              !g.players.some(
                (q) =>
                  q.alive &&
                  q.role === 'scarletwoman' &&
                  healthy(q) &&
                  g.players.filter((s) => s.alive).length >= 5,
              ) &&
              g.players.some((q) => q.alive && role(q.role)?.team === 'minion')
            )
              requireThat(
                c.successor,
                'Choose a living Haunt to receive the Imp.',
              );
            death(
              g,
              victim,
              now,
              'Imp attack',
              victim.id === p.id ? clean(c.successor) : undefined,
            );
          }
          result = `Imp chose ${target.name}. ${kill ? victim.name + ' dies.' : 'No death.'} Night deaths stay private until dawn.`;
        }
        message(
          g,
          p.id,
          `Your choice of ${target.name} has been recorded.`,
          now,
        );
      } else {
        result = infoResult(g, r, p, c);
        requireThat(result, 'Enter information to deliver.');
        message(g, p.id, result, now);
        result = 'Send privately to ' + p.name + ':\n' + result;
      }
      g.done.push(t.key);
      log(
        g,
        t.name +
          ': ' +
          result +
          (override(c) ? ' Override: ' + clean(c.reason) : ''),
        now,
      );
      return result;
    }
    case 'correctVote': {
      const b = g.ballots.at(-1);
      requireThat(
        !g.active &&
          ['nomination', 'dayReview'].includes(g.phase) &&
          b &&
          b.id === c.ballot &&
          b.voterState &&
          b.spentGhosts,
        'Only the latest completed ballot can be corrected before the next nomination or execution.',
      );
      const p = b.voterState.find((p) => p.id === c.player);
      requireThat(
        p && p.id !== b.target && !p.departed && (p.alive || p.ghost),
        'This player was not eligible for that ballot.',
      );
      requireThat(
        typeof c.yes === 'boolean' || c.yes === null,
        'Choose yes, no, or abstain.',
      );
      b.votes[p.id] = c.yes;
      for (const id of b.spentGhosts) person(g, id).ghost = true;
      const valid = new Set(
        b.voterState
          .filter(
            (p) =>
              p.id !== b.target &&
              !p.departed &&
              (p.alive || p.ghost) &&
              b.votes[p.id] === true,
          )
          .map((p) => p.id),
      );
      b.invalid = [];
      for (const p of b.voterState)
        if (
          valid.has(p.id) &&
          p.alive &&
          p.role === 'butler' &&
          !p.poisoned &&
          !valid.has(p.master)
        ) {
          valid.delete(p.id);
          b.invalid.push(p.id);
        }
      b.count = valid.size;
      b.spentGhosts = b.voterState
        .filter((p) => !p.alive && valid.has(p.id))
        .map((p) => p.id);
      for (const id of b.spentGhosts) person(g, id).ghost = false;
      log(
        g,
        `Storyteller changed ${nameOf(g, p.id)}'s vote to ${c.yes === null ? 'abstain' : c.yes ? 'yes' : 'no'}. ${nameOf(g, b.target)} now has ${b.count} yes votes.`,
        now,
        true,
      );
      return 'Vote corrected and ballot total updated.';
    }
    case 'nominate': {
      requireThat(g.phase === 'nomination', 'Nominations are not open.');
      const by = person(g, actor.host ? c.by : actor.id);
      if (isHms(g) && c.target === ST) {
        enforce(
          by.alive,
          'Dead players cannot nominate.',
          actor.host ? c : ({} as Command),
        );
        enforce(
          !g.nominators.includes(by.id) && !g.nominees.includes(ST),
          'This nomination has already been made today.',
          actor.host ? c : ({} as Command),
        );
        g.nominators.push(by.id);
        g.nominees.push(ST);
        g.nominationRemaining = g.deadline
          ? Math.max(0, (g.deadline - now) / 1000)
          : g.remaining;
        g.active = {
          id: uuid(),
          by: by.id,
          target: ST,
          votes: {},
          threshold: Math.ceil(g.players.filter((p) => p.alive).length / 2),
        };
        setPhase(g, 'defense', now);
        return `${by.name} nominates the Storyteller. Start Defense.`;
      }
      const target = person(g, c.target);
      requireThat(
        target.alive && !target.departed,
        'Only living players at the table can be nominated.',
      );
      enforce(
        by.alive,
        'Dead players cannot nominate.',
        actor.host ? c : ({} as Command),
      );
      enforce(
        !g.nominators.includes(by.id),
        'This player has already nominated today.',
        actor.host ? c : ({} as Command),
      );
      enforce(
        !g.nominees.includes(target.id),
        'This player has already been nominated today.',
        actor.host ? c : ({} as Command),
      );
      g.nominators.push(by.id);
      g.nominees.push(target.id);
      g.nominationRemaining = g.deadline
        ? Math.max(0, (g.deadline - now) / 1000)
        : g.remaining;
      g.active = {
        id: uuid(),
        by: by.id,
        target: target.id,
        votes: {},
        threshold: Math.ceil(g.players.filter((p) => p.alive).length / 2),
      };
      if (target.role === 'virgin' && target.alive && !target.used) {
        target.used = true;
        g.active.virginFirst = true;
        log(
          g,
          `Virgin review: ${by.name} nominated ${target.name}. Healthy: ${healthy(target)}. Nominator type: ${{ townsfolk: 'Villager', outsider: 'Fool', minion: 'Haunt', demon: 'Horror' }[role(by.role)?.team ?? 'townsfolk']}. Confirm Virgin ruling before voting.`,
          now,
        );
      }
      setPhase(g, 'defense', now);
      return `${by.name} nominates ${target.name}. Start Defense. ${actor.host && target.role === 'virgin' ? 'Review the first-nomination Virgin effect.' : ''}`;
    }
    case 'vote': {
      requireThat(g.phase === 'voting' && g.active, 'Voting is not open.');
      if (c.ballot !== undefined)
        requireThat(
          c.ballot === g.active.id,
          'The ballot changed. Reopen voting.',
        );
      const p = person(g, actor.host ? c.player : actor.id);
      requireThat(p.alive || p.ghost, 'Your dead vote has already been spent.');
      requireThat(
        p.id !== g.active.target && !p.departed,
        'This player is not eligible to vote on this nomination.',
      );
      requireThat(
        typeof c.yes === 'boolean' || c.yes === null,
        'Choose yes, no, or abstain.',
      );
      g.active.votes[p.id] = c.yes;
      if (finishVotingIfReady(g, now))
        return 'Vote recorded. Everyone eligible has answered; voting is complete.';
      return c.yes
        ? 'Record a yes vote. If dead, this spends your remaining vote when the ballot closes.'
        : 'Record no. A no vote does not spend a dead vote.';
    }
    case 'virgin': {
      requireThat(
        g.active && ['defense', 'voting'].includes(g.phase),
        'No active nomination.',
      );
      const v = person(g, g.active.target),
        p = person(g, g.active.by);
      const applies =
        g.active.virginFirst &&
        v.role === 'virgin' &&
        v.alive &&
        healthy(v) &&
        role(p.role)?.team === 'townsfolk';
      enforce(
        applies,
        'Virgin execution does not apply by actual roles/status. Review Spy registration.',
        c,
      );
      g.execution = p.alive ? p.id : '';
      death(g, p, now, 'Virgin execution');
      g.active = null;
      setPhase(g, 'dayReview', now);
      log(g, 'Virgin execution ends the day; no further execution.', now);
      return `${p.name} is executed immediately. Close nominations and review the end of the day.`;
    }
    case 'slayer': {
      requireThat(
        !['night', 'lobby', 'ended'].includes(g.phase),
        'Slayer claims happen during the day.',
      );
      const p = person(g, c.player),
        target = person(g, c.target);
      if (p.role === 'slayer')
        enforce(!p.used, 'The Slayer ability has already been used.', c);
      const applies =
        p.alive &&
        p.role === 'slayer' &&
        healthy(p) &&
        !p.used &&
        target.role === 'imp';
      p.used = true;
      const kill =
        c.outcome === 'kill' ? true : c.outcome === 'spare' ? false : applies;
      enforce(
        kill === applies,
        'Review Recluse registration or a failed ability.',
        c,
      );
      if (kill) death(g, target, now, 'Slayer claim');
      log(
        g,
        `${p.name} claims Slayer and chooses ${target.name}. ${kill ? 'Death.' : 'No effect.'}`,
        now,
        true,
      );
      return (
        'Resolve public Slayer claim: ' +
        (kill ? target.name + ' dies.' : 'No effect.') +
        ' ' +
        winHints(g).join(' ')
      );
    }
    case 'finishDay': {
      requireThat(g.phase === 'dayReview', 'Wait for the execution review.');
      if (isHms(g)) {
        requireNoPendingDeath(g);
        const leader = candidate(g).target;
        enforce(
          !leader || !!g.execution,
          `Execute ${nameOf(g, leader)} first, or skip the execution.`,
          c,
        );
        const hints = winHints(g);
        if (hints.length) {
          requireThat(
            ['good', 'evil', 'continue'].includes(clean(c.ruling)),
            'Choose the end-of-day ruling: ' + hints.join(' '),
          );
          if (c.ruling !== 'continue') {
            g.winner = clean(c.ruling) === 'good' ? 'Good' : 'Evil';
            setPhase(g, 'ended', now);
            return 'Confirm ' + g.winner + ' victory. ' + hints.join(' ');
          }
          requireThat(
            override(c),
            'Continuing despite a win condition requires an override reason.',
          );
        }
        beginNight(g, now);
        return (
          (g.execution ? '' : 'No execution today. ') + 'Begin the next night.'
        );
      }
      const result = candidate(g);
      const target = c.target ? clean(c.target) : result.target;
      enforce(
        !c.target || target === result.target,
        'The selected execution differs from the ballot leader.',
        c,
      );
      const previousExecution = !!g.execution;
      requireThat(
        !previousExecution || !c.target,
        'The Virgin already caused an execution today.',
      );
      if (target && !previousExecution) {
        const p = person(g, target);
        const saint = p.alive && p.role === 'saint' && healthy(p);
        g.execution = p.alive ? p.id : '';
        death(g, p, now, 'execution');
        if (saint) {
          g.winner = 'Evil · Saint execution';
          setPhase(g, 'ended', now);
          return (
            'Execute ' +
            p.name +
            '. The healthy Saint dies by execution: evil wins.'
          );
        }
      }
      const hints = winHints(g);
      if (hints.length) {
        requireThat(
          ['good', 'evil', 'continue'].includes(clean(c.ruling)),
          'Choose the end-of-day ruling: ' + hints.join(' '),
        );
        if (c.ruling !== 'continue') {
          g.winner = clean(c.ruling) === 'good' ? 'Good' : 'Evil';
          setPhase(g, 'ended', now);
          return 'Confirm ' + g.winner + ' victory. ' + hints.join(' ');
        }
        requireThat(
          override(c),
          'Continuing despite a win condition requires an override reason.',
        );
      }
      beginNight(g, now);
      return (
        (previousExecution
          ? 'Keep the Virgin execution.'
          : target
            ? 'Execute ' + nameOf(g, target) + '.'
            : result.tied
              ? 'Votes tied: no execution.'
              : 'No qualifying nominee: no execution.') +
        ' Begin the next night.'
      );
    }
    case 'end': {
      requireThat(
        ['good', 'evil'].includes(clean(c.winner)),
        'Choose a winning team.',
      );
      g.winner = c.winner === 'good' ? 'Good' : 'Evil';
      setPhase(g, 'ended', now);
      return 'End the game. ' + g.winner + ' wins.';
    }
    case 'overridePhase': {
      requireThat(clean(c.reason).length >= 5, 'Explain the phase override.');
      const phases: Phase[] = [
        'night',
        'discovery',
        'discussion',
        'nomination',
        'dayReview',
      ];
      requireThat(
        phases.includes(c.phase as Phase),
        'Choose a supported phase.',
      );
      if (g.active) g.active = null;
      setPhase(g, c.phase as Phase, now);
      log(g, 'Phase override: ' + clean(c.reason), now);
      return (
        'Jump to ' +
        phaseName[g.phase] +
        '. Active ballots are discarded. Existing daily nomination history and night tasks are preserved.'
      );
    }
    default:
      throw Error('Unknown action.');
  }
}
