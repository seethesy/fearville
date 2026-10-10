'use client';
import { useEffect } from 'react';
import type { GameView } from '@/lib/game/view';
import {
  suppressionReasons,
  walkthroughTriggers,
} from '@/lib/tutorials/engine';
import { useTutorials, useTutorialBlocker } from './provider';

// Connects the table to the tutorial engine: the guest seat scope, the
// walkthrough chapters (FEAR-17), first-open section tutorials (FEAR-18),
// tab switching for replays, and the game states that hold popups.
export function TableTutorials({
  game,
  tab,
  setTab,
  dialogOpen,
}: {
  game: GameView;
  tab: string;
  setTab: (tab: string) => void;
  dialogOpen: boolean;
}) {
  const { setScope, request, sectionOpened, setNavigator } = useTutorials();
  const seated = !game.host && !game.sandboxHost;

  // Each seat (code + player) is one join; guests start fresh per join.
  useEffect(() => {
    setScope(`${game.code}:${game.me}`);
  }, [game.code, game.me, setScope]);

  useEffect(() => {
    setNavigator(setTab);
    return () => setNavigator(null);
  }, [setTab, setNavigator]);

  // Walkthrough first, so a section it covers queues behind it.
  const chapters = walkthroughTriggers({
    phase: game.phase,
    host: game.host,
    day: game.day,
    sandboxHost: game.sandboxHost,
  }).join(',');
  useEffect(() => {
    for (const id of chapters.split(',').filter(Boolean)) request(id);
  }, [chapters, request]);

  const section = !seated
    ? ''
    : tab === 'flow'
      ? game.phase === 'lobby'
        ? ''
        : 'flow'
      : tab === 'seats'
        ? game.phase === 'lobby'
          ? ''
          : 'notes'
        : tab === 'script'
          ? 'rules'
          : ['cosmetic', 'recap', 'messages'].includes(tab)
            ? tab
            : '';
  useEffect(() => {
    if (section) sectionOpened(section);
  }, [section, sectionOpened]);
  // Night actions: every seated player gets it on their first night, whatever
  // their character, so it never singles anyone out.
  const night = seated && game.phase === 'night';
  useEffect(() => {
    if (night) sectionOpened('night');
  }, [night, sectionOpened]);

  const reasons = suppressionReasons(game);
  useTutorialBlocker('night-choice', reasons.includes('night-choice'));
  useTutorialBlocker('night-glimpse', reasons.includes('night-glimpse'));
  useTutorialBlocker('vote', reasons.includes('vote'));
  useTutorialBlocker('night-lock', reasons.includes('night-lock'));
  useTutorialBlocker('rite-turn', reasons.includes('rite-turn'));
  useTutorialBlocker('table-dialog', dialogOpen);
  return null;
}
