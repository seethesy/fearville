# Tutorial review

Exported by `npm run content:export`. Public source text only; no runtime behavior changes.

Edit these review copies directly and retain the IDs. Copy reviewed edits back to the named source before regenerating: rerunning replaces the review copies. Commit or save your edits first.

Source: `lib/tutorials/content/`. Tutorial IDs and step numbers map directly to the ordered catalog. Includes legacy platform overrides for completeness.

## Getting started [tutorial:walkthrough.lobby]

Kind: walkthrough; audience: player; platforms: web, ios

Summary: Your seat, your name, inviting friends and the script.

### Welcome to Fearville [walkthrough.lobby:step:1]

This short tour shows where everything lives. Skip it at any step, and replay it any time from Help.

### Take a seat [walkthrough.lobby:step:2]

Tap an open seat at the table to sit down. Everyone needs a seat before the Storyteller deals characters. You can change or leave your seat until the game starts.

Platforms: web

### Your name and look [walkthrough.lobby:step:3]

Open Cosmetic to change the name everyone sees and to pick your avatar.

Platforms: web

### Invite friends [walkthrough.lobby:step:4]

Signed in? Invite friends straight to this table from here. Anyone can also join with the six-letter session code.

Legacy iOS override: {"body":"Friends join with the six-letter session code shown at the top of the screen. Read it out or show it to them."}

### The script [walkthrough.lobby:step:5]

This table plays the script shown here. Open Rules at any time to read every character on it and the key terms.

Legacy iOS override: {"title":"The script","body":"The Script tab lists every character this table can use, plus the key terms. It never shows who has which character.","tab":"script"}

### Next: the first night [walkthrough.lobby:step:6]

When everyone is seated, the Storyteller deals characters and the game begins. The tour continues then.

Legacy iOS override: {"tab":"game"}

## Your character and the night [tutorial:walkthrough.start]

Kind: walkthrough; audience: player; platforms: web, ios

Summary: Revealing your character, Game flow, the clock and night prompts.

### Your character is private [walkthrough.start:step:1]

Tap Reveal my character when no one else can see your screen. It hides again as soon as you leave the app.

Legacy iOS override: {"body":"Scroll to Your private character and tap Reveal my character when no one else can see your screen. It hides again as soon as you leave the app.","tab":"game"}

### Game flow [walkthrough.start:step:2]

Game flow always shows what is happening now: the phase, what the town is doing, and any buttons you can use.

Legacy iOS override: {"body":"The Game tab always shows what is happening now: the phase, what the town is doing, and any actions you can use.","tab":"game"}

### The clock [walkthrough.start:step:3]

Timed phases count down here. The Storyteller can pause or extend the clock.

### Day and night [walkthrough.start:step:4]

By day the town talks, nominates and votes. At night everyone closes their eyes and the Storyteller works through the night in order. If you are asked for a choice, a private prompt opens on your screen. Every player sees the same night screen.

Legacy iOS override: {"body":"By day the town talks, nominates and votes. At night everyone closes their eyes and the Storyteller works through the night in order. If you are asked for a choice, the Storyteller tells you in Messages and you reply there. Every player sees the same night screen."}

### Messages [walkthrough.start:step:5]

Messages is your private line to the Storyteller. Anything meant only for you arrives here.

Legacy iOS override: {"tab":"messages"}

### Next: the first day [walkthrough.start:step:6]

Nominations and voting are covered when the first day begins.

Legacy iOS override: {"tab":"game"}

## Nominations, voting and your tools [tutorial:walkthrough.day]

Kind: walkthrough; audience: player; platforms: web, ios

Summary: How to nominate and vote, plus notes, Help and settings.

### Nominations [walkthrough.day:step:1]

During nominations each living player may nominate once per day, and each player can be nominated once per day. When you can nominate, the button appears in Game flow.

Legacy iOS override: {"body":"During nominations each living player may nominate once per day, and each player can be nominated once per day. When you can nominate, it appears under Actions in the Game tab.","tab":"game"}

### Voting [walkthrough.day:step:2]

When someone is nominated, vote before the timer ends. Votes are public. Dead players keep a single vote for the rest of the game.

### Your notebook [walkthrough.day:step:3]

Notes holds your private notebook and role guesses. It syncs across your devices and is revealed to the table only after the game ends.

Platforms: web

### Help [walkthrough.day:step:4]

Replay this tour or any section guide from Help.

### Settings and account [walkthrough.day:step:5]

Open Settings from the gear in the table header. Your account keeps your saved lobbies available across devices.

Legacy iOS override: {"body":"Settings opens from the gear. Return home from the top bar; your seat stays in the lobby.","tab":"controls"}

### You are ready [walkthrough.day:step:6]

That is the tour. Good luck in Fearville.

Legacy iOS override: {"tab":"game"}

## Game flow [tutorial:section.flow]

Kind: section; audience: player; platforms: web, ios

Summary: What is happening now and what you can do.

### Game flow [section.flow:step:1]

This is your home screen during play. It shows the current phase, what the town is doing, and any buttons you can use right now.

Legacy iOS override: {"tab":"game"}

### Your seat [section.flow:step:2]

Your private character, the living players and a shortcut to Messages sit alongside.

Legacy iOS override: {"body":"Your private character and any actions you can take are further down this screen."}

## Night actions [tutorial:section.night]

Kind: section; audience: player; platforms: web, ios

Summary: What happens on your screen at night.

### The night [section.night:step:1]

At night the Storyteller works through the night order. Your screen stays on the night view whatever your character.

### Night prompts [section.night:step:2]

If you are asked for a choice, a private prompt opens with a countdown. Pick your players or answer, then confirm. You can also pass when the prompt allows it.

Platforms: web

### Night messages [section.night:step:3]

If you are asked for a choice, the Storyteller tells you in Messages. Reply there before the night moves on.

Platforms: ios

Legacy iOS override: {"tab":"messages"}

### Dawn [section.night:step:4]

Deaths from the night become public at dawn. Anything you learn at night stays in Messages.

## Notes [tutorial:section.notes]

Kind: section; audience: player; platforms: web

Summary: Your private notebook and role guesses.

### Your private notebook [section.notes:step:1]

Write anything you want to remember. Notes sync privately across your devices while you play.

### Guessing roles [section.notes:step:2]

Track which characters you think are in play and who you think each player is. All notes are revealed to the table after the game ends.

## Seats [tutorial:section.seats]

Kind: section; audience: player; platforms: ios

Summary: Everyone at the table and who is alive.

### Seats [section.seats:step:1]

Seats lists everyone at the table in seat order, who is alive, and who still has a dead vote. Nominations used today show here too.

Legacy iOS override: {"tab":"seats"}

## Messages [tutorial:section.messages]

Kind: section; audience: player; platforms: web, ios

Summary: Your private conversation with the Storyteller.

### Messages [section.messages:step:1]

Your conversation with the Storyteller. Information meant only for you arrives here, and you can reply at any time.

Legacy iOS override: {"tab":"messages"}

### Everyone [section.messages:step:2]

Messages marked Everyone were sent to the whole table. Private messages are never shown to other players during the game.

## Rules & roles [tutorial:section.rules]

Kind: section; audience: player; platforms: web, ios

Summary: Every character on the script and the key terms.

### Rules & roles [section.rules:step:1]

Every character on this script, grouped by team, with the glossary of key terms. It lists the script, never who has which character.

Legacy iOS override: {"body":"Every character on this script with the glossary of key terms. It lists the script, never who has which character.","tab":"script"}

### Key terms [section.rules:step:2]

Underlined words open a short definition. Tap one to read it, and tap again to close.

## Cosmetic [tutorial:section.cosmetic]

Kind: section; audience: player; platforms: web

Summary: Your name and appearance at this table.

### Your appearance [section.cosmetic:step:1]

Pick an avatar or upload a photo, and change the name other players see. Changes apply straight away.

## Session Recap [tutorial:section.recap]

Kind: section; audience: player; platforms: web

Summary: Every finished game at this table.

### Session Recap [section.recap:step:1]

Each finished game at this table is saved here as a session. Open one to see the final seating, MVP votes, and everyone’s history, notes and messages.

## Session [tutorial:section.session]

Kind: section; audience: player; platforms: ios

Summary: Your account and returning home.

### Session [section.session:step:1]

Your account keeps saved lobbies available across devices. Return home while keeping your seat. Help lives here too.

Legacy iOS override: {"tab":"controls"}

## Friends [tutorial:section.friends]

Kind: section; audience: all; platforms: web

Summary: Handles, friend requests and table invitations.

### Your handle [section.friends:step:1]

Choose a handle first. It is the only way other players can find you; your email is never shown.

### Friends and invitations [section.friends:step:2]

Send requests by handle. Friends can invite each other to a table, and invitations you receive wait here for 24 hours.

## Your record [tutorial:section.stats]

Kind: section; audience: all; platforms: web

Summary: Progression, results and Storyteller feedback.

### Your record [section.stats:step:1]

Finished games saved to your account build your record: level, results by character and team, MVP awards, ranked rating, and feedback when you Storytell.

## Profiles [tutorial:section.profile]

Kind: section; audience: all; platforms: web

Summary: What other players can see about you.

### Profiles [section.profile:step:1]

A profile shows a player’s record and recent games, as far as their privacy settings allow. Set yours from your account page.

## Your account [tutorial:section.account]

Kind: section; audience: all; platforms: web, ios

Summary: Saved seats, sign-in and privacy.

### Your account [section.account:step:1]

An account saves your seats across devices and keeps your record. Resume a saved game, connect another sign-in, or adjust your privacy here.

### Tutorials [section.account:step:2]

Signed in, each tutorial shows once. Use Show tutorials again in Settings to see them all from the start.

## Seats [tutorial:section.host-seats]

Kind: section; audience: host; platforms: web

Summary: Every seat, its character and its status.

### Seats [section.host-seats:step:1]

Seats lists every player with their character, whether they are alive and their remaining votes. Only you see the characters here. In the lobby this is also where you set the script and assign characters.

## Controls [tutorial:section.host-controls]

Kind: section; audience: host; platforms: web

Summary: Night Rite setup, undo, rewind and ending the game.

### Storyteller controls [section.host-controls:step:1]

Set up the Night Rite before it opens, undo your last ruling, rewind, change the phase or end the game. Every ruling is recorded in the decision history.

## Storyteller tour [tutorial:tour.lobby]

Kind: tour; audience: host; platforms: web

Summary: Lobby setup, running nights and days, and the Night Rite.

### You are the Storyteller [tour.lobby:step:1]

This tour shows the controls only you can see: setting up the lobby, starting the game, and running nights, days and the Night Rite. Players never see any of it. Skip it at any step and replay it from Help.

### Script and player count [tour.lobby:step:2]

In Seats, choose the script and the role distribution for this many players. Standard counts follow the player count; custom counts are shown to everyone at the table.

### Assign characters [tour.lobby:step:3]

Deal a random setup and adjust it, or choose each seat’s character by hand. Characters stay hidden until you begin the game.

### Night Rite and vigils [tour.lobby:step:4]

In Controls, choose whether to run the Night Rite, which patterns it uses and the night it opens. Vigils are dealt at random when the game starts, or arrange the teams yourself here.

### Invite your players [tour.lobby:step:5]

Players join on their own phones with this six-letter code. Read it out, share the link, or invite signed-in friends straight to the table.

### Start the game [tour.lobby:step:6]

Setup checks list anything still missing. When they pass, begin the game here and everyone moves to the first night together.

### Your settings [tour.lobby:step:7]

Settings holds your own sound, role tip and privacy preferences. They never change what players see.

### Next: running the game [tour.lobby:step:8]

The tour continues when the game starts.

## Running the game [tutorial:tour.play]

Kind: tour; audience: host; platforms: web

Summary: Nights, days, timers, the Night Rite board and undo.

### Your next task [tour.play:step:1]

At night this panel walks you through the night order one task at a time. By day it runs discussion, nominations and votes. The buttons for the next step are always here.

### Night answers [tour.play:step:2]

When players answer a night prompt, a notice appears at the top. Review their answers before you move on.

### Timers [tour.play:step:3]

Pause, resume or extend the current timer. Timers keep running on the server even if your screen sleeps.

### The Night Rite board [tour.play:step:4]

Once the Rite opens, this board shows each vigil’s progress and how many must finish. Open a vigil to see its puzzle and turn log, pass a stuck turn, or redeal its puzzle. Close Rite now ends tonight’s Rite early.

### Undo and rewind [tour.play:step:5]

Made a mistake? Controls can undo your last ruling, rewind to an earlier point, change the phase or end the game. Every ruling is listed in the decision history.

### Help is here [tour.play:step:6]

Replay this tour or any section guide from Help.

### You are ready [tour.play:step:7]

That is the tour. Enjoy running the table.

## Escape Fearville [tutorial:guide.board]

Kind: guide; audience: player; platforms: web, ios

Summary: Slide the wreckage aside and free the red carriage.

### Free the red carriage [guide.board:step:1]

Wreckage blocks the road out of Fearville. Your vigil wins by sliding the red carriage out through the gap in the fence. Every piece slides only along its length: side-to-side pieces never move up or down, and upright pieces never move sideways.

### Keep sliding on your turn [guide.board:step:2]

Your vigil takes turns in a random order. Make as many legal slides as you want, then press Pass to hand over the board. Turns keep cycling until the Storyteller ends the night or closes the Rite.

### Plan it by day [guide.board:step:3]

This escape takes about thirty slides. Between turns you see the board as you left it; the live board appears when your turn begins. By day, study the board together and agree on the next moves.

## Alchemist’s Laboratory [tutorial:guide.lab]

Kind: guide; audience: player; platforms: web, ios

Summary: Pour the brews until every vial holds one liquid.

### Sort every brew [guide.lab:step:1]

Ten liquids are mixed across twelve vials. Your vigil wins when every vial holds a single liquid. Tap a vial, then tap where to pour: the whole top layer pours onto the same liquid or into an empty vial, as far as there is room. A vial holds four.

### Keep pouring on your turn [guide.lab:step:2]

Your vigil takes turns in a random order. Make as many legal pours as you want, then press Pass to hand over the vials. Turns keep cycling until the Storyteller ends the night or closes the Rite.

### Undo, reset and ruin [guide.lab:step:3]

On your turn you may call a vote to undo tonight’s last pour or to reset to the very start; everyone else must agree. The vote stays open until everyone answers or the Rite closes. A pour that makes the brew impossible returns the vials to how they were at nightfall.

## The Sphinx’s Riddles [tutorial:guide.grid]

Kind: guide; audience: player; platforms: web, ios

Summary: Work out who was where, doing what, on the street.

### Who, where and doing what? [guide.grid:step:1]

Five people each spent the night at a different place on one street, each doing a different activity. Work out who was where and what they were doing. The places stand in a fixed order from west to east, exactly as the map shows them.

### Your clue cards [guide.grid:step:2]

You hold four clue cards. Two are revealed on the Rite’s first night, then one more on each of the next two nights. No one else can see your cards, so read them aloud by day. The riddle needs everyone’s cards to solve.

### Reading the clues [guide.grid:step:3]

“Next door” means neighbouring places. “Somewhere west of” means anywhere further west; “directly west of” means the very next place. “In some order” matches two groups without saying who goes with whom. “Either … or …, but not both” means exactly one part is true.

### Answer at night [guide.grid:step:4]

Arrange people and activities on your map whenever you like and save it. At night, submit your answer; you can replace it until the Storyteller ends the night or closes the Rite. The riddle is solved at dawn if more than half your vigil submitted the right answer. A card that clashes with the rest may be forged.

## Ritual of Divination [tutorial:guide.ritual]

Kind: guide; audience: player; platforms: web, ios

Summary: Three players, three rituals, three parts each.

### Three rituals, three parts [guide.ritual:step:1]

Each of you performs your own ritual at an altar. For a second player’s ritual you hold the omens, and for the third player’s you keep the grimoire. Every ritual needs all three of you: omens read aloud, the grimoire turns them into settings, and the performer sets the altar.

### Omens and the grimoire [guide.ritual:step:2]

The omens are three sets of three symbols, one set per altar control, in no particular order. Find each set in the grimoire to learn which control it belongs to and how to set it. A set never holds two look-alike symbols, such as a skull and a skull and crossbones.

### Perform the ritual [guide.ritual:step:3]

From the night shown on your altar, you get one attempt per night. Set all three controls, then perform. A faltering ritual reveals nothing about what went wrong. The Divination is complete once two of the three rituals are performed. Omens can be misread, by accident or on purpose.

