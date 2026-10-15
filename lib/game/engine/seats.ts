import {
  validAvatar,
  isPresetAvatar,
  resolvedAvatars,
  assignAvatars,
} from '../avatars.ts';
import { validDeathEffect } from '../cosmetics.ts';
import {
  role,
  MAX_PLAYERS,
  type Game,
  type Actor,
  type Command,
  type Player,
} from '../types.ts';
import { recapOf, returnToLobby } from '../lobby.ts';
import {
  afterNightChoice,
  nightChoiceDeadlineFor,
  validateChoice,
} from '../hms.ts';
import { savedGame } from '../saved-state.ts';
import { requireThat, person, clean, message, nameOf, log } from './shared.ts';
import { tasks, nightChoiceTask } from './lifecycle.ts';
export function executeSeatCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | undefined {
  if (c.action === 'claimSeat' || c.action === 'leaveSeat') {
    requireThat(g.phase === 'lobby', 'Seats can only be changed in the lobby.');
    requireThat(!actor.host, 'Players choose their own seats.');
    const player = person(g, actor.id);
    if (c.action === 'leaveSeat') player.seat = 0;
    else {
      const seat = Number(c.seat);
      requireThat(
        Number.isInteger(seat) && seat >= 1 && seat <= MAX_PLAYERS,
        'Choose a valid seat.',
      );
      requireThat(
        player.seat === 0,
        'Leave your current seat before claiming another.',
      );
      requireThat(
        !g.players.some((p) => p.seat === seat),
        'That seat was just claimed. Choose another.',
      );
      player.seat = seat;
    }
    g.history = [];
    return c.action === 'leaveSeat' ? 'Seat released.' : 'Seat claimed.';
  }
  if (c.action === 'mvpVote') {
    const current = g.phase === 'ended' ? recapOf(g, now) : null;
    const recap =
      current?.id === c.recap
        ? current
        : g.recaps?.find((r) => r.id === c.recap);
    requireThat(recap, 'Choose a completed session.');
    requireThat(
      actor.host || recap.players.some((p) => p.id === actor.id),
      'Only participants can vote.',
    );
    const target = clean(c.player);
    requireThat(
      recap.players.some((p) => p.id === target),
      'Choose a player from this session.',
    );
    requireThat(
      actor.host || target !== actor.id,
      'You cannot vote for yourself.',
    );
    const votes =
      current === recap ? (g.mvpVotes ??= {}) : (recap.votes ??= {});
    const key = actor.host ? 'host' : actor.id;
    const picks = votes[key] ?? [];
    requireThat(!picks.includes(target), 'You already voted for this player.');
    requireThat(
      picks.length < (actor.host ? 3 : 1),
      'You have used all your MVP votes.',
    );
    votes[key] = [...picks, target];
    return 'MVP vote saved.';
  }
  if (c.action === 'saveNotebook') {
    requireThat(!actor.host, 'Only players have notebooks.');
    const book = c.notebook as import('../types.ts').Notebook;
    requireThat(
      book && typeof book.text === 'string' && book.text.length <= 12000,
      'Notes are too long.',
    );
    requireThat(
      book.roles && book.players && JSON.stringify(book).length <= 16000,
      'Invalid notebook.',
    );
    requireThat(
      Object.entries(book.roles).every(
        ([id, v]) => role(id) && [0, 1, 2].includes(v),
      ),
      'Invalid role notes.',
    );
    requireThat(
      Object.values(book.players).every(
        (v) =>
          v &&
          typeof v.role === 'string' &&
          typeof v.confidence === 'string' &&
          ['', 'confirmed', 'suspected'].includes(v.confidence) &&
          (!v.role || role(v.role)),
      ),
      'Invalid player notes.',
    );
    if (c.started === g.gameStartedAt && g.gameStartedAt !== undefined)
      (g.notebooks ??= {})[actor.id] = structuredClone(book);
    else {
      const archived = g.recaps
        ?.find((r) => r.started !== undefined && r.started === c.started)
        ?.players.find((p) => p.id === actor.id);
      requireThat(archived, 'This notebook belongs to a different game.');
      archived.notebook = structuredClone(book);
    }
    return 'Notes saved.';
  }
  if (c.action === 'setAvatar') {
    requireThat(
      g.phase === 'lobby',
      'Appearance can only be changed in the pregame lobby.',
    );
    const player = g.players.find((p) => p.id === actor.id && !p.departed);
    requireThat(
      !actor.host && player,
      'Choose your own player seat to change its avatar.',
    );
    requireThat(
      validAvatar(c.avatar),
      'Choose a preset or a small JPEG portrait.',
    );
    requireThat(
      c.deathEffect === undefined || validDeathEffect(c.deathEffect),
      'Choose a death effect.',
    );
    const avatars = resolvedAvatars(g.players);
    requireThat(
      !isPresetAvatar(c.avatar) ||
        !g.players.some(
          (p) => p.id !== player.id && avatars.get(p.id) === c.avatar,
        ),
      'That preset avatar is already taken. Choose an available preset or upload a photo.',
    );
    assignAvatars(g.players);
    player.avatar = c.avatar;
    if (validDeathEffect(c.deathEffect)) player.deathEffect = c.deathEffect;
    return 'Avatar updated.';
  }
  if (c.action === 'returnLobby') {
    if (g.phase === 'lobby') return 'Already in the lobby.';
    requireThat(
      c.recap === undefined || c.recap === recapOf(g, now).id,
      'This is a different game. Review its recap first.',
    );
    requireThat(
      g.phase === 'ended',
      'The game must end before returning to the lobby.',
    );
    return returnToLobby(g, now);
  }
  if (c.action === 'nightDefer') {
    requireThat(g.phase === 'night', 'It is not night.');
    if (c.night !== undefined)
      requireThat(
        c.night === g.night,
        'The night changed. Review this task again.',
      );
    const task = tasks(g).find((t) => !t.done);
    requireThat(task, 'No night task remains.');
    if (c.task !== undefined)
      requireThat(
        c.task === task.key,
        'The active night task changed. Review it again.',
      );
    g.deferredNightTasks ??= [];
    requireThat(
      !g.deferredNightTasks.includes(task.key),
      'This is the last deferred task. Resolve or skip it before dawn.',
    );
    g.deferredNightTasks.push(task.key);
    return `Set ${task.name} aside. It will return after the other night tasks.`;
  }
  if (c.action === 'nightChoice') {
    const task = nightChoiceTask(g, actor.id);
    requireThat(
      !task || now < nightChoiceDeadlineFor(g, task),
      'The night choice timer has ended. The Storyteller will decide.',
    );
    requireThat(
      !actor.host &&
        task &&
        task.player === actor.id &&
        task.key === c.task &&
        task.round === c.round,
      'This night choice is no longer available.',
    );

    g.nightChoices ??= {};
    g.nightChoices[task.key] = validateChoice(g, task, c);
    afterNightChoice(g, task, now);
    return g.nightChoices[task.key].pass
      ? 'Pass sent. The Storyteller will confirm.'
      : 'Choice sent. Waiting for the Storyteller to confirm.';
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
    if (c.action === 'undo' && c.history !== undefined)
      requireThat(
        c.history === g.history.at(-1)?.id,
        'A newer decision was made. Choose the decision to restore.',
      );
    const index =
      c.action === 'undo'
        ? g.history.length - 1
        : g.history.findIndex((h) => h.id === c.history);
    requireThat(index >= 0, 'No saved decision to restore.');
    const entry = g.history[index];
    const state = savedGame(entry.before);
    // Names belong to the current membership, including snapshots stored
    // separately from the live table before a member was renamed.
    state.hostName = g.hostName;
    for (const player of state.players) {
      const current = g.players.find((p) => p.id === player.id);
      if (current) player.name = current.name;
    }
    requireThat(
      g.players.every((p) => state.players.some((q: Player) => q.id === p.id)),
      'Cannot rewind before a player joined. Correct seats manually.',
    );
    delete g.nightChoiceRound;
    delete g.nightChoices;
    delete g.nightChoiceDeadlines;
    delete g.nightIntroductions;
    delete g.nightChoiceDeadline;
    delete g.nightChoiceTasks;
    delete g.script;
    delete g.dawnAnnouncement;
    delete g.hms;
    delete g.gameEndedAt;
    delete g.mvpVotes;
    delete g.rite;
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
}
