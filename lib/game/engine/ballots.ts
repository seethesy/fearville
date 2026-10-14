import {
  uuid,
  phaseName,
  type Game,
  type Actor,
  type Command,
  type Phase,
} from '../types.ts';
import {
  isMoon,
  hmsAction,
  pendingDeath,
  requireNoPendingDeath,
  ST,
} from '../hms.ts';
import { requireThat, person, enforce, nameOf, clean, log } from './shared.ts';
import { setPhase, automaticWinner, beginNight } from './lifecycle.ts';
import { finishVotingIfReady, candidate } from './voting.ts';
export function voteCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | undefined {
  switch (c.action) {
    case 'nominate': {
      requireThat(g.phase === 'nomination', 'Nominations are not open.');
      const by = person(g, actor.host ? c.by : actor.id);
      if (isMoon(g) && c.target === ST) {
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
      setPhase(g, 'defense', now);
      return `${by.name} nominates ${target.name}. Start Defense.`;
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

    case 'finishDay': {
      requireThat(g.phase === 'dayReview', 'Wait for the execution review.');

      requireNoPendingDeath(g);
      const leader = candidate(g).target;
      if (leader && !g.execution) {
        const result = hmsAction(
          g,
          { id: 'host', host: true },
          {
            action: 'execute',
            target: leader,
            atheistRuling: 'none',
          },
          now,
        );
        if (result === 'END_GAME') {
          setPhase(g, 'ended', now);
          return 'The Storyteller is executed with the Atheist in play: good wins.';
        }
        if (pendingDeath(g))
          return `${result ?? `Execute ${nameOf(g, leader)}.`} Resolve the execution death, then confirm the day outcome again.`;
      }
      const winner = automaticWinner(g);
      if (winner) {
        g.winner = winner;
        setPhase(g, 'ended', now);
        return `${winner} wins. The day outcome and win conditions were calculated automatically.`;
      }
      beginNight(g, now);
      return (
        (g.execution ? '' : 'No execution today. ') + 'Begin the next night.'
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
      log(g, 'Phase changed manually.', now);
      return (
        'Jump to ' +
        phaseName[g.phase] +
        '. Active ballots are discarded. Existing daily nomination history and night tasks are preserved.'
      );
    }
  }
}
