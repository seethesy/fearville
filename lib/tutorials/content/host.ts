import type { Tutorial } from '../types.ts';
// ---------------------------------------------------------------------------
// FEAR-19: the Storyteller tour. Two chapters: lobby setup, then running the
// game once it starts. Shown only to the Storyteller (never requested for a
// seated player): guests every time they host a table, accounts the first
// time. Skipping either chapter ends the whole tour. Web only for now: the
// iPhone client can host, but its triggers and spotlight targets would need
// client layouts. Mobile shells now use these web tutorials too.
// ---------------------------------------------------------------------------
export const HOST_TOUR: Tutorial[] = [
  {
    id: 'tour.lobby',
    kind: 'tour',
    group: 'tour',
    title: 'Storyteller tour',
    summary: 'Lobby setup, running nights and days, and the Night Rite.',
    audience: 'host',
    platforms: ['web'],
    tab: 'flow',
    // The chapter visits Seats, so that section's popup is not needed after.
    covers: ['section.host-seats'],
    steps: [
      {
        title: 'You are the Storyteller',
        body: 'This tour shows the controls only you can see: setting up the lobby, starting the game, and running nights, days and the Night Rite. Players never see any of it. Skip it at any step and replay it from Help.',
        illustration: 'welcome',
      },
      {
        title: 'Script and player count',
        body: 'In Seats, choose the script and the role distribution for this many players. Standard counts follow the player count; custom counts are shown to everyone at the table.',
        target: 'host-setup',
        tab: 'seats',
        illustration: 'script',
      },
      {
        title: 'Assign characters',
        body: 'Deal a random setup and adjust it, or choose each seat’s character by hand. Characters stay hidden until you begin the game.',
        target: 'host-assign',
        tab: 'seats',
        illustration: 'character',
      },
      {
        title: 'Night Rite and vigils',
        body: 'In Controls, choose whether to run the Night Rite, which patterns it uses and the night it opens. Vigils are dealt at random when the game starts, or arrange the teams yourself here.',
        target: 'rite-setup',
        tab: 'control',
        illustration: 'night',
      },
      {
        title: 'Invite your players',
        body: 'Players join on their own phones with this six-letter code. Read it out, share the link, or invite signed-in friends straight to the table.',
        target: 'session-code',
        tab: 'flow',
        illustration: 'invite',
      },
      {
        title: 'Start the game',
        body: 'Setup checks list anything still missing. When they pass, begin the game here and everyone moves to the first night together.',
        target: 'flow-actions',
        tab: 'flow',
        illustration: 'day-night',
      },
      {
        title: 'Your settings',
        body: 'Settings holds your own sound, role tip and privacy preferences. They never change what players see.',
        target: 'table-settings',
        illustration: 'settings',
      },
      {
        title: 'Next: running the game',
        body: 'The tour continues when the game starts.',
        illustration: 'flow',
      },
    ],
  },
  {
    id: 'tour.play',
    kind: 'tour',
    group: 'tour',
    title: 'Running the game',
    summary: 'Nights, days, timers, the Night Rite board and undo.',
    audience: 'host',
    platforms: ['web'],
    tab: 'flow',
    covers: ['section.host-controls'],
    steps: [
      {
        title: 'Your next task',
        body: 'At night this panel walks you through the night order one task at a time. By day it runs discussion, nominations and votes. The buttons for the next step are always here.',
        target: 'flow-panel',
        tab: 'flow',
        illustration: 'flow',
      },
      {
        title: 'Night answers',
        body: 'When players answer a night prompt, a notice appears at the top. Review their answers before you move on.',
        illustration: 'night',
      },
      {
        title: 'Timers',
        body: 'Pause, resume or extend the current timer. Timers keep running on the server even if your screen sleeps.',
        target: 'timer-actions',
        illustration: 'clock',
      },
      {
        title: 'The Night Rite board',
        body: 'Once the Rite opens, this board shows each vigil’s progress and how many must finish. Open a vigil to see its puzzle and turn log, pass a stuck turn, or redeal its puzzle. Close Rite now ends tonight’s Rite early.',
        target: 'rite-host',
        tab: 'flow',
        illustration: 'night',
      },
      {
        title: 'Undo and rewind',
        body: 'Made a mistake? Controls can undo your last ruling, rewind to an earlier point, change the phase or end the game. Every ruling is listed in the decision history.',
        target: 'host-controls',
        tab: 'control',
        illustration: 'recap',
      },
      {
        title: 'Help is here',
        body: 'Replay this tour or any section guide from Help.',
        target: 'help-button',
        illustration: 'help',
      },
      {
        title: 'You are ready',
        body: 'That is the tour. Enjoy running the table.',
        illustration: 'done',
      },
    ],
  },
];
// FEAR-19: first-open tutorials for the Storyteller-only panels.
export const HOST_SECTIONS: Tutorial[] = [
  {
    id: 'section.host-seats',
    kind: 'section',
    section: 'host-seats',
    tab: 'seats',
    platforms: ['web'],
    title: 'Seats',
    summary: 'Every seat, its character and its status.',
    audience: 'host',
    steps: [
      {
        title: 'Seats',
        body: 'Seats lists every player with their character, whether they are alive and their remaining votes. Only you see the characters here. In the lobby this is also where you set the script and assign characters.',
        illustration: 'seat',
      },
    ],
  },
  {
    id: 'section.host-controls',
    kind: 'section',
    section: 'host-controls',
    tab: 'control',
    platforms: ['web'],
    title: 'Controls',
    summary: 'Night Rite setup, undo, rewind and ending the game.',
    audience: 'host',
    steps: [
      {
        title: 'Storyteller controls',
        body: 'Set up the Night Rite before it opens, undo your last ruling, rewind, change the phase or end the game. Every ruling is recorded in the decision history.',
        target: 'host-controls',
        illustration: 'settings',
      },
    ],
  },
];
