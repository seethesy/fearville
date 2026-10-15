import { resolvedAvatars } from '../avatars.ts';
import { riteView } from '../../rite/view.ts';
import {
  SCRIPTS,
  standardCounts,
  setupCounts,
  role,
  phaseName,
  type Game,
  type Actor,
} from '../types.ts';
import {
  tasks,
  setupIssues,
  winHints,
  candidate,
  nameOf,
  eligibleVoters,
  nightChoiceTask,
  alignment,
  healthy,
} from '../engine.ts';
import {
  isMoon,
  ST,
  nightChoiceDeadlineFor,
  nightChoiceWindowDeadline,
  pendingDeath,
  livingNeighbors,
} from '../hms.ts';
import { recapOf } from '../lobby.ts';
import { alignmentOf, winnerOf } from '../../social/derive.ts';
import { BASE_XP, mvpShares } from '../../social/progression.ts';
import { isHof, sphinxGlimpse } from '../hof.ts';
import { roleTips } from '../role-tips.ts';
import { feedPage, LIVE_FEED_LIMIT, visibleMessages } from '../feed.ts';
import { controls } from './controls.ts';
export function view(
  g: Game,
  a: Actor,
  version: number,
  now: number,
  sandboxHost = false,
  compactRecaps = false,
) {
  const avatars = resolvedAvatars(g.players);
  const me = g.players.find((p) => p.id === a.id);
  const leader = candidate(g);
  const choiceTask = nightChoiceTask(g, a.id);
  const currentTask =
    g.phase === 'night' ? tasks(g).find((t) => !t.done) : null;
  const actingPlayer = g.players.find((p) => p.id === currentTask?.player);
  return {
    code: g.code,
    rite: riteView(g, a, now),
    sandbox: !!g.sandbox,
    sandboxHost,
    // FEAR-158: an admin watching a live table (read-only).
    observer: !!a.observer,
    script: g.script ?? 'horrors',
    scriptName: SCRIPTS[g.script ?? 'horrors'],
    // Horrors of Fearville: the Sphinx's glimpse of every role, shown until
    // the night-choice timer ends.
    glimpse: a.host ? null : sphinxGlimpse(g, me, now),
    nightIntroduction:
      !a.host && me && !me.departed && g.phase === 'night' && g.night === 1
        ? (g.nightIntroductions?.[a.id] ?? null)
        : null,
    nightChoice:
      !a.host &&
      choiceTask?.player === a.id &&
      now < nightChoiceDeadlineFor(g, choiceTask)
        ? {
            task: choiceTask.key,
            deadline: g.sandbox ? null : nightChoiceDeadlineFor(g, choiceTask),
            conditional: false,
            round: choiceTask.round,
            count: choiceTask.count,
            text: 'text' in choiceTask ? !!choiceTask.text : false,
            guesses:
              'guesses' in choiceTask ? (choiceTask.guesses ?? null) : null,
            members:
              'members' in choiceTask
                ? (choiceTask.members ?? []).map((id) => ({
                    id,
                    name: nameOf(g, id),
                  }))
                : [],
            optional: 'optional' in choiceTask ? !!choiceTask.optional : false,
            flag: 'flag' in choiceTask ? (choiceTask.flag ?? null) : null,
            label: 'label' in choiceTask ? (choiceTask.label ?? '') : '',
            options: choiceTask.options.map((p) => ({
              ...p,
              knownRole:
                role(me?.role ?? '')?.team === 'demon' &&
                role(g.players.find((q) => q.id === p.id)?.role ?? '')?.team ===
                  'minion'
                  ? role(g.players.find((q) => q.id === p.id)!.role)?.name
                  : undefined,
            })),
            choice: g.nightChoices?.[choiceTask.key] ?? null,
            fearOptions:
              choiceTask.role === 'monster'
                ? g.players.map((p) => ({
                    target: p.id,
                    neighbors: livingNeighbors(g, p).map((q) => q.id),
                  }))
                : null,
          }
        : null,
    nightConfirmation:
      a.host && currentTask
        ? {
            task: currentTask.key,
            playerId: actingPlayer?.id ?? '',
            playerName: actingPlayer?.name ?? '',
            impaired:
              !!actingPlayer && (!actingPlayer.alive || !healthy(actingPlayer)),
            ability:
              role(currentTask.role)?.description ??
              (currentTask.role === 'nightmareRuling'
                ? 'Privately resolve the Nightmare’s requested redirect before the haunted ability lands.'
                : ''),
            statuses:
              actingPlayer && actingPlayer.id !== ST
                ? [
                    ...(isHof(g)
                      ? [
                          {
                            key: 'feared',
                            name: 'Feared',
                            active:
                              !!actingPlayer.feared || !!actingPlayer.poisoned,
                          },
                        ]
                      : []),
                    {
                      key: 'drunk',
                      name: 'Drunk',
                      active:
                        !!actingPlayer.drunk || actingPlayer.role === 'drunk',
                      locked: actingPlayer.role === 'drunk',
                    },
                    {
                      key: 'protected',
                      name: 'Protected',
                      active: !!actingPlayer.protected,
                    },
                    ...(isMoon(g)
                      ? [
                          {
                            key: 'marked',
                            name: 'Marked',
                            active: !!actingPlayer.marked,
                          },
                        ]
                      : []),
                    ...(isMoon(g) && g.hms?.nightmare
                      ? [
                          {
                            key: 'haunted',
                            name: 'Haunted',
                            active: g.hms.nightmare.bound === actingPlayer.id,
                          },
                          ...(g.hms.nightmare.bound === actingPlayer.id
                            ? [
                                {
                                  key: 'redirected',
                                  name: 'Redirected',
                                  active: !!g.hms.nightmareRedirectTarget,
                                },
                              ]
                            : []),
                        ]
                      : []),
                  ]
                : [],
            choice: g.nightChoices?.[currentTask.key] ?? null,
          }
        : null,
    standardCounts: standardCounts(g.script, g.players.length),
    roleDistribution: setupCounts(g),
    customRoleDistribution: !!g.roleDistribution,
    channel:
      !a.host &&
      g.phase === 'night' &&
      g.hms?.channel &&
      [g.hms.channel.a, g.hms.channel.b].includes(a.id)
        ? {
            with: nameOf(
              g,
              g.hms.channel.a === a.id ? g.hms.channel.b : g.hms.channel.a,
            ),
            id: g.hms.channel.id,
          }
        : null,
    storytellerAbility:
      a.host && g.hms?.stRole ? (role(g.hms.stRole)?.name ?? null) : null,
    pendingDeaths: a.host ? (g.hms?.deathQueue.length ?? 0) : 0,
    pendingBodyguard:
      a.host &&
      pendingDeath(g)?.bodyguard &&
      pendingDeath(g)!.bodyguard!.decision === undefined
        ? nameOf(g, pendingDeath(g)!.bodyguard!.player)
        : null,
    dawnAnnouncement:
      g.phase !== 'night' && g.phase !== 'lobby'
        ? (g.dawnAnnouncement ?? null)
        : null,
    hostName: g.hostName,
    host: a.host,
    me: a.id,
    phase: g.phase,
    phaseLabel: phaseName[g.phase],
    day: g.day,
    night: g.night,
    version,
    serverNow: now,
    nightChoiceDeadline:
      g.phase === 'night' && !g.sandbox ? nightChoiceWindowDeadline(g) : null,
    deadline: g.deadline,
    remaining: g.remaining,
    winner: g.winner,
    gameStartedAt: g.gameStartedAt,
    ranked: !!g.ranked,
    ratingPreview:
      !a.host && g.progression?.ranked
        ? (() => {
            const seat = g.progression.seats.find((p) => p.player === a.id);
            return seat
              ? { rating: seat.rating, win: seat.win, loss: seat.loss }
              : null;
          })()
        : null,
    notebook: !a.host ? (g.notebooks?.[a.id] ?? null) : null,
    execution: g.execution,
    recaps: (g.phase === 'ended'
      ? [...(g.recaps ?? []), recapOf(g, now)]
      : (g.recaps ?? [])
    ).map(({ votes, progression: _privateProgression, ...recap }) => ({
      ...recap,
      ...(compactRecaps
        ? {
            messages: [],
            decisions: [],
            detailsDeferred: true,
            detailsRevision: `${recap.messages?.length ?? 0}:${recap.decisions.length}:${recap.players.map((p) => p.name).join('|')}`,
          }
        : {}),
      myReward:
        !g.sandbox &&
        _privateProgression &&
        (a.host || recap.players.some((p) => p.id === a.id))
          ? (() => {
              const won =
                alignmentOf(recap.players.find((p) => p.id === a.id)?.team) ===
                winnerOf(recap.winner);
              const seat = _privateProgression.seats.find(
                (p) => p.player === a.id,
              );
              const base = BASE_XP * (a.host ? 3 : won ? 1.5 : 1);
              const bonus = a.host
                ? 0
                : (mvpShares(
                    recap.players.map((p) => p.id),
                    votes,
                  )[a.id]?.xp ?? 0);
              return {
                baseXp: base,
                mvpXp: bonus,
                xp: base + bonus,
                eloDelta:
                  !a.host && _privateProgression.ranked && seat
                    ? won
                      ? seat.win
                      : seat.loss
                    : null,
                saved: a.host
                  ? !!_privateProgression.hostAccount
                  : !!seat?.account,
              };
            })()
          : null,
      myVotes: votes?.[a.host ? 'host' : a.id] ?? [],
      mvpCounts: Object.values(votes ?? {})
        .flat()
        .reduce<Record<string, number>>((counts, id) => {
          counts[id] = (counts[id] ?? 0) + 1;
          return counts;
        }, {}),
    })),
    players: g.players
      .slice()
      .sort((a, b) => a.seat - b.seat)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        avatar: avatars.get(p.id),
        deathEffect: p.deathEffect ?? 'spirit',
        publicAlive: p.publicAlive,
        departed: !!p.departed,
        dummy: !!p.dummy,
        alive: a.host ? p.alive : p.publicAlive,
        ghost: g.phase === 'night' && !a.host ? p.ghost : p.ghost,
        ...(a.host
          ? {
              role: p.role,
              shown: p.shown,
              notes: p.notes,
              poisoned: p.poisoned,
              protected: p.protected,
              used: p.used,
              feared: !!p.feared,
            }
          : {}),
        nominated: g.nominees.includes(p.id),
        hasNominated: g.nominators.includes(p.id),
      })),
    character:
      !a.host && g.phase !== 'lobby' && me
        ? {
            name: role(me.shown || me.role)?.name,
            description: role(me.shown || me.role)?.description,
            alignment: alignment({ ...me, role: me.shown || me.role }),
            tips: roleTips(g.script ?? 'horrors', me.shown || me.role),
          }
        : null,
    tasks: a.host && g.phase === 'night' ? tasks(g) : [],
    issues: a.host && g.phase === 'lobby' ? setupIssues(g) : [],
    hints: a.host ? winHints(g) : [],
    active: g.active
      ? {
          id: g.active.id,
          by: g.active.by,
          target: g.active.target,
          threshold: g.active.threshold,
          myVote: g.active.votes[a.id] ?? null,
          myVoteSubmitted: Object.hasOwn(g.active.votes, a.id),
          votes: g.active.votes,
          eligible: eligibleVoters(g).map((p) => p.id),
        }
      : null,
    ballots: g.ballots.map((b) => ({
      id: b.id,
      by: b.by,
      target: b.target,
      count: b.count,
      threshold: b.threshold,
      votes: b.votes,
      correctable:
        a.host &&
        !g.active &&
        ['nomination', 'dayReview'].includes(g.phase) &&
        b.id === g.ballots.at(-1)?.id &&
        !!b.voterState,
      eligible:
        b.voterState
          ?.filter(
            (p) => p.id !== b.target && !p.departed && (p.alive || p.ghost),
          )
          .map((p) => p.id) ?? [],
      ...(a.host ? { invalid: b.invalid } : {}),
    })),
    leader: { ...leader, name: leader.target ? nameOf(g, leader.target) : '' },
    messages: visibleMessages(g, a).slice(-LIVE_FEED_LIMIT),
    log: g.log.filter((l) => a.host || l.public).slice(-LIVE_FEED_LIMIT),
    feeds: {
      messages: feedPage(g, a, 'messages').before,
      log: feedPage(g, a, 'log').before,
      history: a.host ? feedPage(g, a, 'history').before : null,
    },
    controls: controls(g, a),
  };
}
export type GameView = ReturnType<typeof view> & {
  blockedChatSenders?: string[];
};
