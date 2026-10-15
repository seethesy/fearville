import {
  uuid,
  phaseName,
  type Game,
  type Actor,
  type Command,
  type Phase,
} from '../types.ts';
import { hms, hmsResolve, hmsDawn, requireNoPendingDeath } from '../hms.ts';
import { riteReady, resolveRite } from '../../rite/engine.ts';
import { requireThat, enforce, log, person, nameOf } from './shared.ts';
import { setPhase, tasks, winHints } from './lifecycle.ts';
import { tally } from './voting.ts';
export function phaseCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | undefined {
  switch (c.action) {
    case 'pause':
      if (c.phaseToken !== undefined)
        requireThat(
          c.phaseToken === `${g.day}:${g.night}:${g.phase}`,
          'The phase changed. Review this timer again.',
        );
      requireThat(g.deadline !== null, 'No running timer.');
      g.remaining = Math.max(0, Math.ceil((g.deadline - now) / 1000));
      g.deadline = null;
      return 'Pause the shared timer for everyone.';

    case 'resume':
      if (c.phaseToken !== undefined)
        requireThat(
          c.phaseToken === `${g.day}:${g.night}:${g.phase}`,
          'The phase changed. Review this timer again.',
        );
      requireThat(g.deadline === null && g.remaining > 0, 'No paused timer.');
      g.deadline = now + g.remaining * 1000;
      return 'Resume the shared timer.';

    case 'extend':
      if (c.phaseToken !== undefined)
        requireThat(
          c.phaseToken === `${g.day}:${g.night}:${g.phase}`,
          'The phase changed. Review this timer again.',
        );
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
      requireThat(riteReady(g, now), 'The Night Rite window is still open.');
      enforce(
        tasks(g).every((t) => t.done),
        'Night tasks remain.',
        c,
      );
      hmsDawn(g, now);
      resolveRite(g, now);
      g.dawnAnnouncement = {
        id: uuid(),
        night: g.night,
        playerIds: g.players
          .filter((p) => !p.alive && p.nightDeath === g.night)
          .map((p) => p.id),
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
      if (c.night !== undefined)
        requireThat(
          c.night === g.night,
          'The night changed. Review this task again.',
        );
      const task = tasks(g).find((t) => !t.done);
      requireThat(task, 'All night tasks are complete.');
      if (c.task !== undefined)
        requireThat(
          c.task === task.key,
          'The active night task changed. Review it again.',
        );

      requireNoPendingDeath(g);
      if (task.key === 'deaths')
        hms(g).deathQueue = hms(g).deathQueue.filter((d) => !d.night);
      if (task.key === 'plague') delete hms(g).infected;
      g.done.push(task.key);
      g.deferredNightTasks = (g.deferredNightTasks ?? []).filter(
        (key) => key !== task.key,
      );
      log(g, 'Skipped ' + task.name + '.', now);
      return (
        'Skip ' +
        task.name +
        ' without applying an effect or sending information.'
      );
    }

    case 'night': {
      requireThat(g.phase === 'night', 'It is not night.');
      if (c.night !== undefined)
        requireThat(
          c.night === g.night,
          'The night changed. Review this task again.',
        );
      const t = tasks(g).find((t) => !t.done);
      requireThat(t && t.key === c.task, 'The active night task changed.');
      const choice = g.nightChoices?.[t.key];
      requireThat(
        (c.choiceId || '') === (choice?.id || ''),
        'The player changed their choice. Review it before confirming.',
      );
      return hmsResolve(g, t, c, now);
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
  }
}
