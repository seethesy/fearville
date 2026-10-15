import { assignAvatars } from '../avatars.ts';
import {
  role,
  scriptRoles,
  uuid,
  newPlayer,
  MAX_PLAYERS,
  TEAM_ORDER,
  TEAM_NAMES,
  standardCounts,
  type Team,
  type Game,
  type Actor,
  type Command,
  type Player,
} from '../types.ts';
import { assignRandomRoles } from '../assignment.ts';
import { requireThat, clean, log, person } from './shared.ts';
export function setupCommand(
  g: Game,
  actor: Actor,
  c: Command,
  now: number,
): string | undefined {
  switch (c.action) {
    case 'addDummy': {
      requireThat(g.sandbox, 'Dummy players are only available in Sandbox.');
      requireThat(g.players.length < MAX_PLAYERS, 'This table is full.');
      const name = clean(c.name, 32);
      requireThat(name, 'Enter a dummy player name.');
      assignAvatars(g.players);
      const player = newPlayer(name, g.players.length + 1);
      player.dummy = true;
      g.players.push(player);
      assignAvatars(g.players);
      log(g, `${name} was added as a dummy player.`, now, true);
      return `Add ${name} to the Sandbox.`;
    }

    case 'removeDummy': {
      requireThat(g.sandbox, 'Dummy players are only available in Sandbox.');
      const player = person(g, c.player);
      requireThat(player.dummy, 'Only dummy players can be removed here.');
      requireThat(g.phase === 'lobby', 'Remove dummy players from the lobby.');
      g.players = g.players.filter((p) => p.id !== player.id);
      g.players.forEach((p, index) => (p.seat = index + 1));
      return `Remove ${player.name} from the Sandbox.`;
    }

    case 'setScript': {
      requireThat(
        g.phase === 'lobby',
        'Change the role script before starting the game.',
      );
      requireThat(
        c.script === 'holyMoonStars' || c.script === 'horrors',
        'Choose a valid role script.',
      );
      if (g.script !== c.script) delete g.roleDistribution;
      g.script = c.script;
      log(g, 'Updated role script.', now, true);
      return 'Role script updated.';
    }

    case 'setRoleDistribution': {
      requireThat(
        g.phase === 'lobby',
        'Change the distribution before starting the game.',
      );
      requireThat(
        !!standardCounts(g.script, g.players.length),
        `Join 5–${MAX_PLAYERS} players before setting the distribution.`,
      );
      const distribution = {} as Record<Team, number>;
      for (const team of TEAM_ORDER) {
        const count =
          team === 'traveler' && g.script === 'holyMoonStars'
            ? 0
            : Number(c[team]);
        requireThat(
          Number.isInteger(count) && count >= 0 && count <= g.players.length,
          `Choose a valid ${TEAM_NAMES[team]} count.`,
        );
        const available = scriptRoles(g.script).filter(
          (r) => r.team === team,
        ).length;
        requireThat(
          count <= available,
          `This script has only ${available} ${TEAM_NAMES[team]}.`,
        );
        distribution[team] = count;
      }
      requireThat(
        TEAM_ORDER.reduce((total, team) => total + distribution[team], 0) ===
          g.players.length,
        'Role counts must add up to the number of players.',
      );
      g.roleDistribution = distribution;
      log(g, 'Updated the public role distribution.', now, true);
      return 'Role distribution updated for everyone.';
    }

    case 'resetRoleDistribution': {
      requireThat(
        g.phase === 'lobby',
        'Change the distribution before starting the game.',
      );
      delete g.roleDistribution;
      log(g, 'Restored the standard role distribution.', now, true);
      return 'Standard role distribution restored for everyone.';
    }

    case 'moveSeat':
      throw Error('Players choose their own seats in the lobby.');

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

    case 'assignRole': {
      requireThat(g.phase === 'lobby', 'Assign characters in the lobby.');
      const p = person(g, c.player);
      const nextRole = clean(c.role);
      requireThat(
        scriptRoles(g.script).some((r) => r.id === nextRole),
        'Choose a character from this script.',
      );
      const previousRole = p.role;
      if (previousRole === nextRole)
        return `${p.name} already has that character.`;
      const previousOwner = g.players.find(
        (q) => q.id !== p.id && q.role === nextRole,
      );
      const assign = (target: Player, id: string) => {
        target.role = id;
        target.shown = id;
        delete target.acts;
        delete target.charge;
        target.drunk = false;
        target.feared = false;
      };
      if (previousOwner) assign(previousOwner, previousRole);
      assign(p, nextRole);
      log(g, `Assigned ${role(nextRole)?.name} to ${p.name}.`, now);
      return previousOwner
        ? `Assigned ${role(nextRole)?.name} to ${p.name} and ${previousRole ? 'swapped' : 'cleared'} ${previousOwner.name}'s character.`
        : `Assigned ${role(nextRole)?.name} to ${p.name}.`;
    }

    case 'configure': {
      if (!g.sandbox)
        for (const key of Object.keys({ nightChoice: 60, ...g.timers })) {
          const n = Number(
            c[key] ??
              (key === 'nightChoice'
                ? (g.timers.nightChoice ?? 60)
                : undefined),
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
      return g.sandbox
        ? 'Save Horror bluffs and the red herring. Sandbox timers stay disabled.'
        : 'Save timers, Horror bluffs, and red herring. Active timers keep their current time.';
    }
  }
}
