import type { Tutorial } from '../types.ts';
// ---------------------------------------------------------------------------
// Night Rite pattern guides. Each player is shown only their own vigil's guide,
// automatically during night 1 (the Rite opens on a later night), and can
// reread it from Help and the Rules section. Ids are `guide.<pattern>`.
// ---------------------------------------------------------------------------
export const RITE_GUIDES: Tutorial[] = [
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
        title: 'Keep sliding on your turn',
        body: 'Your vigil takes turns in a random order. Make as many legal slides as you want, then press Pass to hand over the board. Turns keep cycling until the Storyteller ends the night or closes the Rite.',
        diagram: 'escape-turns',
      },
      {
        title: 'Plan it by day',
        body: 'This escape takes about thirty slides. Between turns you see the board as you left it; the live board appears when your turn begins. By day, study the board together and agree on the next moves.',
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
        title: 'Keep pouring on your turn',
        body: 'Your vigil takes turns in a random order. Make as many legal pours as you want, then press Pass to hand over the vials. Turns keep cycling until the Storyteller ends the night or closes the Rite.',
        diagram: 'lab-turns',
      },
      {
        title: 'Undo, reset and ruin',
        body: 'On your turn you may call a vote to undo tonight’s last pour or to reset to the very start; everyone else must agree. The vote stays open until everyone answers or the Rite closes. A pour that makes the brew impossible returns the vials to how they were at nightfall.',
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
        body: 'Arrange people and activities on your map whenever you like and save it. At night, submit your answer; you can replace it until the Storyteller ends the night or closes the Rite. The riddle is solved at dawn if more than half your vigil submitted the right answer. A card that clashes with the rest may be forged.',
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
