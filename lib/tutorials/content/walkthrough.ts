import type { Tutorial } from '../types.ts';
// Every word here is shown identically to every player regardless of their
// character or team. Never branch content on role, alignment or night order:
// tests/tutorials.test.ts rejects role names and team words in this file.

// ---------------------------------------------------------------------------
// FEAR-17: first-time player walkthrough. Three chapters that follow the first
// lobby, the first night and the first day. Skipping any chapter ends the
// whole walkthrough.
// ---------------------------------------------------------------------------
export const WALKTHROUGH: Tutorial[] = [
  {
    id: 'walkthrough.lobby',
    kind: 'walkthrough',
    group: 'walkthrough',
    title: 'Getting started',
    summary: 'Your seat, your name, inviting friends and the script.',
    audience: 'player',
    steps: [
      {
        title: 'Welcome to Fearville',
        body: 'This short tour shows where everything lives. Skip it at any step, and replay it any time from Help.',
        illustration: 'welcome',
      },
      {
        title: 'Take a seat',
        body: 'Tap an open seat at the table to sit down. Everyone needs a seat before the Storyteller deals characters. You can change or leave your seat until the game starts.',
        target: 'seating',
        illustration: 'seat',
        platforms: ['web'],
      },
      {
        title: 'Your name and look',
        body: 'Open Cosmetic to change the name everyone sees and to pick your avatar.',
        target: 'tab-cosmetic',
        illustration: 'appearance',
        platforms: ['web'],
      },
      {
        title: 'Invite friends',
        body: 'Signed in? Invite friends straight to this table from here. Anyone can also join with the six-letter session code.',
        target: 'invite-friends',
        illustration: 'invite',
        ios: {
          body: 'Friends join with the six-letter session code shown at the top of the screen. Read it out or show it to them.',
        },
      },
      {
        title: 'The script',
        body: 'This table plays the script shown here. Open Rules at any time to read every character on it and the key terms.',
        target: 'script',
        illustration: 'script',
        ios: {
          title: 'The script',
          body: 'The Script tab lists every character this table can use, plus the key terms. It never shows who has which character.',
          tab: 'script',
        },
      },
      {
        title: 'Next: the first night',
        body: 'When everyone is seated, the Storyteller deals characters and the game begins. The tour continues then.',
        illustration: 'night',
        ios: { tab: 'game' },
      },
    ],
  },
  {
    id: 'walkthrough.start',
    kind: 'walkthrough',
    group: 'walkthrough',
    title: 'Your character and the night',
    summary:
      'Revealing your character, Game flow, the clock and night prompts.',
    audience: 'player',
    covers: ['section.flow'],
    steps: [
      {
        title: 'Your character is private',
        body: 'Tap Reveal my character when no one else can see your screen. It hides again as soon as you leave the app.',
        target: 'character-reveal',
        illustration: 'character',
        ios: {
          body: 'Scroll to Your private character and tap Reveal my character when no one else can see your screen. It hides again as soon as you leave the app.',
          tab: 'game',
        },
      },
      {
        title: 'Game flow',
        body: 'Game flow always shows what is happening now: the phase, what the town is doing, and any buttons you can use.',
        target: 'flow-panel',
        illustration: 'flow',
        ios: {
          body: 'The Game tab always shows what is happening now: the phase, what the town is doing, and any actions you can use.',
          tab: 'game',
        },
      },
      {
        title: 'The clock',
        body: 'Timed phases count down here. The Storyteller can pause or extend the clock.',
        target: 'clock',
        illustration: 'clock',
      },
      {
        title: 'Day and night',
        body: 'By day the town talks, nominates and votes. At night everyone closes their eyes and the Storyteller works through the night in order. If you are asked for a choice, a private prompt opens on your screen. Every player sees the same night screen.',
        illustration: 'day-night',
        ios: {
          body: 'By day the town talks, nominates and votes. At night everyone closes their eyes and the Storyteller works through the night in order. If you are asked for a choice, the Storyteller tells you in Messages and you reply there. Every player sees the same night screen.',
        },
      },
      {
        title: 'Messages',
        body: 'Messages is your private line to the Storyteller. Anything meant only for you arrives here.',
        target: 'tab-messages',
        illustration: 'messages',
        ios: { tab: 'messages' },
      },
      {
        title: 'Next: the first day',
        body: 'Nominations and voting are covered when the first day begins.',
        illustration: 'day-night',
        ios: { tab: 'game' },
      },
    ],
  },
  {
    id: 'walkthrough.day',
    kind: 'walkthrough',
    group: 'walkthrough',
    title: 'Nominations, voting and your tools',
    summary: 'How to nominate and vote, plus notes, Help and settings.',
    audience: 'player',
    steps: [
      {
        title: 'Nominations',
        body: 'During nominations each living player may nominate once per day, and each player can be nominated once per day. When you can nominate, the button appears in Game flow.',
        target: 'flow-actions',
        illustration: 'nominate',
        ios: {
          body: 'During nominations each living player may nominate once per day, and each player can be nominated once per day. When you can nominate, it appears under Actions in the Game tab.',
          tab: 'game',
        },
      },
      {
        title: 'Voting',
        body: 'When someone is nominated, vote before the timer ends. Votes are public. Dead players keep a single vote for the rest of the game.',
        target: 'flow-panel',
        illustration: 'vote',
      },
      {
        title: 'Your notebook',
        body: 'Notes holds your private notebook and role guesses. It syncs across your devices and is revealed to the table only after the game ends.',
        target: 'tab-notes',
        illustration: 'notes',
        platforms: ['web'],
      },
      {
        title: 'Help',
        body: 'Replay this tour or any section guide from Help.',
        target: 'help-button',
        illustration: 'help',
      },
      {
        title: 'Settings and account',
        body: 'Open Settings from the gear in the table header. Your account keeps your saved lobbies available across devices.',
        target: 'table-settings',
        illustration: 'settings',
        ios: {
          body: 'Settings opens from the gear. Return home from the top bar; your seat stays in the lobby.',
          tab: 'controls',
        },
      },
      {
        title: 'You are ready',
        body: 'That is the tour. Good luck in Fearville.',
        illustration: 'done',
        ios: { tab: 'game' },
      },
    ],
  },
];
