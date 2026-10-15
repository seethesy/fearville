import type { Tutorial } from '../types.ts';
// ---------------------------------------------------------------------------
// FEAR-18: first-open section tutorials. Add a section by adding an entry
// here and calling useSectionTutorial(section) where it opens.
// ---------------------------------------------------------------------------
export const SECTIONS: Tutorial[] = [
  {
    id: 'section.flow',
    kind: 'section',
    section: 'flow',
    tab: 'flow',
    title: 'Game flow',
    summary: 'What is happening now and what you can do.',
    audience: 'player',
    steps: [
      {
        title: 'Game flow',
        body: 'This is your home screen during play. It shows the current phase, what the town is doing, and any buttons you can use right now.',
        target: 'flow-panel',
        illustration: 'flow',
        ios: { tab: 'game' },
      },
      {
        title: 'Your seat',
        body: 'Your private character, the living players and a shortcut to Messages sit alongside.',
        target: 'character-reveal',
        illustration: 'character',
        ios: {
          body: 'Your private character and any actions you can take are further down this screen.',
        },
      },
    ],
  },
  {
    id: 'section.night',
    kind: 'section',
    section: 'night',
    title: 'Night actions',
    summary: 'What happens on your screen at night.',
    audience: 'player',
    steps: [
      {
        title: 'The night',
        body: 'At night the Storyteller works through the night order. Your screen stays on the night view whatever your character.',
        illustration: 'night',
      },
      {
        title: 'Night prompts',
        body: 'If you are asked for a choice, a private prompt opens with a countdown. Pick your players or answer, then confirm. You can also pass when the prompt allows it.',
        illustration: 'night',
        platforms: ['web'],
      },
      {
        title: 'Night messages',
        body: 'If you are asked for a choice, the Storyteller tells you in Messages. Reply there before the night moves on.',
        illustration: 'messages',
        platforms: ['ios'],
        ios: { tab: 'messages' },
      },
      {
        title: 'Dawn',
        body: 'Deaths from the night become public at dawn. Anything you learn at night stays in Messages.',
        illustration: 'day-night',
      },
    ],
  },
  {
    id: 'section.notes',
    kind: 'section',
    section: 'notes',
    tab: 'seats',
    platforms: ['web'],
    title: 'Notes',
    summary: 'Your private notebook and role guesses.',
    audience: 'player',
    steps: [
      {
        title: 'Your private notebook',
        body: 'Write anything you want to remember. Notes sync privately across your devices while you play.',
        target: 'notes-panel',
        illustration: 'notes',
      },
      {
        title: 'Guessing roles',
        body: 'Track which characters you think are in play and who you think each player is. All notes are revealed to the table after the game ends.',
        illustration: 'notes',
      },
    ],
  },
  {
    id: 'section.seats',
    kind: 'section',
    section: 'seats',
    platforms: ['ios'],
    title: 'Seats',
    summary: 'Everyone at the table and who is alive.',
    audience: 'player',
    steps: [
      {
        title: 'Seats',
        body: 'Seats lists everyone at the table in seat order, who is alive, and who still has a dead vote. Nominations used today show here too.',
        illustration: 'seat',
        ios: { tab: 'seats' },
      },
    ],
  },
  {
    id: 'section.messages',
    kind: 'section',
    section: 'messages',
    tab: 'messages',
    title: 'Messages',
    summary: 'Your private conversation with the Storyteller.',
    audience: 'player',
    steps: [
      {
        title: 'Messages',
        body: 'Your conversation with the Storyteller. Information meant only for you arrives here, and you can reply at any time.',
        target: 'messages-panel',
        illustration: 'messages',
        ios: { tab: 'messages' },
      },
      {
        title: 'Everyone',
        body: 'Messages marked Everyone were sent to the whole table. Private messages are never shown to other players during the game.',
        illustration: 'messages',
      },
    ],
  },
  {
    id: 'section.rules',
    kind: 'section',
    section: 'rules',
    tab: 'script',
    title: 'Rules & roles',
    summary: 'Every character on the script and the key terms.',
    audience: 'player',
    steps: [
      {
        title: 'Rules & roles',
        body: 'Every character on this script, grouped by team, with the glossary of key terms. It lists the script, never who has which character.',
        target: 'rules-panel',
        illustration: 'rules',
        ios: {
          body: 'Every character on this script with the glossary of key terms. It lists the script, never who has which character.',
          tab: 'script',
        },
      },
      {
        title: 'Key terms',
        body: 'Underlined words open a short definition. Tap one to read it, and tap again to close.',
        illustration: 'rules',
      },
    ],
  },
  {
    id: 'section.cosmetic',
    kind: 'section',
    section: 'cosmetic',
    tab: 'cosmetic',
    platforms: ['web'],
    title: 'Cosmetic',
    summary: 'Your name and appearance at this table.',
    audience: 'player',
    steps: [
      {
        title: 'Your appearance',
        body: 'Pick an avatar or upload a photo, and change the name other players see. Changes apply straight away.',
        target: 'cosmetic-panel',
        illustration: 'appearance',
      },
    ],
  },
  {
    id: 'section.recap',
    kind: 'section',
    section: 'recap',
    tab: 'recap',
    platforms: ['web'],
    title: 'Session Recap',
    summary: 'Every finished game at this table.',
    audience: 'player',
    steps: [
      {
        title: 'Session Recap',
        body: 'Each finished game at this table is saved here as a session. Open one to see the final seating, MVP votes, and everyone’s history, notes and messages.',
        target: 'recap-panel',
        illustration: 'recap',
      },
    ],
  },
  {
    id: 'section.session',
    kind: 'section',
    section: 'session',
    platforms: ['ios'],
    title: 'Session',
    summary: 'Your account and returning home.',
    audience: 'player',
    steps: [
      {
        title: 'Session',
        body: 'Your account keeps saved lobbies available across devices. Return home while keeping your seat. Help lives here too.',
        illustration: 'settings',
        ios: { tab: 'controls' },
      },
    ],
  },
  {
    id: 'section.friends',
    kind: 'section',
    section: 'friends',
    platforms: ['web'],
    title: 'Friends',
    summary: 'Handles, friend requests and table invitations.',
    audience: 'all',
    steps: [
      {
        title: 'Your handle',
        body: 'Choose a handle first. It is the only way other players can find you; your email is never shown.',
        illustration: 'friends',
      },
      {
        title: 'Friends and invitations',
        body: 'Send requests by handle. Friends can invite each other to a table, and invitations you receive wait here for 24 hours.',
        illustration: 'invite',
      },
    ],
  },
  {
    id: 'section.stats',
    kind: 'section',
    section: 'stats',
    platforms: ['web'],
    title: 'Your record',
    summary: 'Progression, results and Storyteller feedback.',
    audience: 'all',
    steps: [
      {
        title: 'Your record',
        body: 'Finished games saved to your account build your record: level, results by character and team, MVP awards, ranked rating, and feedback when you Storytell.',
        illustration: 'stats',
      },
    ],
  },
  {
    id: 'section.profile',
    kind: 'section',
    section: 'profile',
    platforms: ['web'],
    title: 'Profiles',
    summary: 'What other players can see about you.',
    audience: 'all',
    steps: [
      {
        title: 'Profiles',
        body: 'A profile shows a player’s record and recent games, as far as their privacy settings allow. Set yours from your account page.',
        illustration: 'profile',
      },
    ],
  },
  {
    id: 'section.account',
    kind: 'section',
    section: 'account',
    title: 'Your account',
    summary: 'Saved seats, sign-in and privacy.',
    audience: 'all',
    steps: [
      {
        title: 'Your account',
        body: 'An account saves your seats across devices and keeps your record. Resume a saved game, connect another sign-in, or adjust your privacy here.',
        illustration: 'account',
      },
      {
        title: 'Tutorials',
        body: 'Signed in, each tutorial shows once. Use Show tutorials again in Settings to see them all from the start.',
        illustration: 'help',
      },
    ],
  },
];
