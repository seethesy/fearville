import type { Illustration, Tutorial } from './types.ts';

// Every word here is shown identically to every player regardless of their
// character or team. Never branch content on role, alignment or night order:
// tests/tutorials.test.ts rejects role names and team words in this file.

// ---------------------------------------------------------------------------
// FEAR-17: first-time player walkthrough. Three chapters that follow the first
// lobby, the first night and the first day. Skipping any chapter ends the
// whole walkthrough.
// ---------------------------------------------------------------------------
const WALKTHROUGH: Tutorial[] = [
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
        body: 'Use the links at the bottom of the page to change your name and appearance, save a recovery key, or open your account.',
        target: 'table-footer',
        illustration: 'settings',
        ios: {
          body: 'The Controls tab holds your account, your recovery key and Help. Return home from the top bar; your seat stays in the lobby.',
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

// ---------------------------------------------------------------------------
// FEAR-18: first-open section tutorials. Add a section by adding an entry
// here and calling useSectionTutorial(section) where it opens.
// ---------------------------------------------------------------------------
const SECTIONS: Tutorial[] = [
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
    summary: 'Your account, recovery key and returning home.',
    audience: 'player',
    steps: [
      {
        title: 'Session',
        body: 'Save a recovery key before you switch devices, open your account and saved games, or return home while keeping your seat. Help lives here too.',
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

// ---------------------------------------------------------------------------
// Night Rite pattern guides. Each player is shown only their own vigil's guide,
// automatically during night 1 (the Rite opens on a later night), and can
// reread it from Help and the Rules section. Ids are `guide.<pattern>`.
// ---------------------------------------------------------------------------
const RITE_GUIDES: Tutorial[] = [
  {
    id: 'guide.board',
    kind: 'guide',
    title: 'Escape Fearville',
    summary: 'Slide the wreckage aside and free the red carriage.',
    audience: 'player',
    steps: [
      {
        title: 'Free the red carriage',
        body: 'Wreckage blocks the road out of Fearville. Your vigil wins by sliding the red carriage out through the gap in the fence. Every piece slides only along its length: side-to-side pieces never move up or down, and upright pieces never move sideways.',
        diagram: 'escape-goal',
      },
      {
        title: 'One slide per turn',
        body: 'Each night the Rite is open, your vigil takes turns in a random order. On your turn you have five seconds to slide one piece as far as you like. The turn passes the moment you move, or when time runs out. A slide the rules do not allow is refused.',
        diagram: 'escape-turns',
      },
      {
        title: 'Plan it by day',
        body: 'This escape takes about thirty slides, so expect to need three nights. Between turns you see the board as you left it; the live board appears when your turn begins. By day, study the board together and agree on the next moves.',
        illustration: 'day-night',
      },
    ],
  },
  {
    id: 'guide.lab',
    kind: 'guide',
    title: 'Alchemist’s Laboratory',
    summary: 'Pour the brews until every vial holds one liquid.',
    audience: 'player',
    steps: [
      {
        title: 'Sort every brew',
        body: 'Ten liquids are mixed across twelve vials. Your vigil wins when every vial holds a single liquid. Tap a vial, then tap where to pour: the whole top layer pours onto the same liquid or into an empty vial, as far as there is room. A vial holds four.',
        diagram: 'lab-pour',
      },
      {
        title: 'One pour per turn',
        body: 'Each night the Rite is open, your vigil takes turns in a random order, with eight seconds to make one pour. Between turns you see the vials as you left them; the live vials appear when your turn begins. Running out of time passes your turn.',
        diagram: 'lab-turns',
      },
      {
        title: 'Undo, reset and ruin',
        body: 'On your turn you may call a vote to undo tonight’s last pour or to reset to the very start; everyone else must agree. A pour that makes the brew impossible ruins it, and the vials return to how they were at nightfall. Expect about thirty pours over three nights.',
        illustration: 'vote',
      },
    ],
  },
  {
    id: 'guide.grid',
    kind: 'guide',
    title: 'The Sphinx’s Riddles',
    summary: 'Work out who was where, doing what, on the street.',
    audience: 'player',
    steps: [
      {
        title: 'Who, where and doing what?',
        body: 'Five people each spent the night at a different place on one street, each doing a different activity. Work out who was where and what they were doing. The places stand in a fixed order from west to east, exactly as the map shows them.',
        diagram: 'riddle-map',
      },
      {
        title: 'Your clue cards',
        body: 'You hold four clue cards. Two are revealed on the Rite’s first night, then one more on each of the next two nights. No one else can see your cards, so read them aloud by day. The riddle needs everyone’s cards to solve.',
        diagram: 'riddle-cards',
      },
      {
        title: 'Reading the clues',
        body: '“Next door” means neighbouring places. “Somewhere west of” means anywhere further west; “directly west of” means the very next place. “In some order” matches two groups without saying who goes with whom. “Either … or …, but not both” means exactly one part is true.',
        diagram: 'riddle-terms',
      },
      {
        title: 'Answer at night',
        body: 'Arrange people and activities on your map whenever you like and save it. At night, submit your answer; you can replace it until the window closes. The riddle is solved at dawn if more than half your vigil submitted the right answer. A card that clashes with the rest may be forged.',
        illustration: 'night',
      },
    ],
  },
  {
    id: 'guide.ritual',
    kind: 'guide',
    title: 'Ritual of Divination',
    summary: 'Three players, three rituals, three parts each.',
    audience: 'player',
    steps: [
      {
        title: 'Three rituals, three parts',
        body: 'Each of you performs your own ritual at an altar. For a second player’s ritual you hold the omens, and for the third player’s you keep the grimoire. Every ritual needs all three of you: omens read aloud, the grimoire turns them into settings, and the performer sets the altar.',
        diagram: 'ritual-roles',
      },
      {
        title: 'Omens and the grimoire',
        body: 'The omens are three sets of three symbols, one set per altar control, in no particular order. Find each set in the grimoire to learn which control it belongs to and how to set it. A set never holds two look-alike symbols, such as a skull and a skull and crossbones.',
        diagram: 'ritual-book',
      },
      {
        title: 'Perform the ritual',
        body: 'From the night shown on your altar, you get one attempt per night. Set all three controls, then perform. A faltering ritual reveals nothing about what went wrong. The Divination is complete once two of the three rituals are performed. Omens can be misread, by accident or on purpose.',
        illustration: 'night',
      },
    ],
  },
];

export const TUTORIALS: Tutorial[] = [
  ...WALKTHROUGH,
  ...SECTIONS,
  ...RITE_GUIDES,
];
// The guide for a Night Rite pattern (board, grid, ritual or lab).
export const riteGuideId = (pattern: string) => `guide.${pattern}`;

export const WALKTHROUGH_IDS = WALKTHROUGH.map((t) => t.id);

export function tutorial(id: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.id === id);
}
export function isTutorialId(id: unknown): id is string {
  return typeof id === 'string' && TUTORIALS.some((t) => t.id === id);
}
export function sectionTutorial(section: string): Tutorial | undefined {
  return TUTORIALS.find((t) => t.kind === 'section' && t.section === section);
}

// iPhone: SF Symbol for each illustration.
export const IOS_SYMBOLS: Record<Illustration, string> = {
  welcome: 'sparkles',
  seat: 'chair',
  appearance: 'person.crop.circle',
  invite: 'person.badge.plus',
  script: 'scroll',
  character: 'eye.slash',
  flow: 'list.bullet.rectangle',
  clock: 'timer',
  'day-night': 'sun.horizon',
  night: 'moon.stars',
  nominate: 'hand.raised',
  vote: 'checkmark.circle',
  notes: 'note.text',
  messages: 'bubble.left.and.bubble.right',
  help: 'questionmark.circle',
  settings: 'gearshape',
  rules: 'book',
  recap: 'clock.arrow.circlepath',
  friends: 'person.2',
  stats: 'chart.bar',
  profile: 'person.text.rectangle',
  account: 'person.crop.square',
  done: 'checkmark.seal',
};
