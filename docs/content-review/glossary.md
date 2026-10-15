# Glossary review

Exported by `npm run content:export`. Public source text only; no runtime behavior changes.

Edit these review copies directly and retain the IDs. Copy reviewed edits back to the named source before regenerating: rerunning replaces the review copies. Commit or save your edits first.

Source: `lib/game/glossary.ts`. Linked role text appears in `/rules`, the in-table Rules and Game flow views, and the role picker. Dynamic information and messages also use `GlossaryText`; their runtime contents are intentionally excluded.

## Fear [glossary:fear]

Variants: fear, feared, fears

A feared player’s ability malfunctions, exactly as if they were poisoned or drunk. They are not told. They still wake and make choices, but their ability has no effect and anything they learn may be false. Fear lasts only as long as the ability that caused it says.

Scripts: horrors

Linked from role IDs: horrors/banshee, horrors/basilisk, horrors/monster

## Visit [glossary:visit]

Variants: visit, visits, visited, visiting

When a player with a night ability chooses another player, they visit that player, unless the ability says otherwise. A feared player still visits. If a visit is redirected, it lands on the new player instead.

Scripts: horrors, holyMoonStars

Linked from role IDs: horrors/doctor, horrors/detective, horrors/watchman, horrors/psychic, horrors/judge, horrors/mortician, horrors/lostwanderer, horrors/basilisk, horrors/monster, horrors/wraith, holyMoonStars/insomniac, holyMoonStars/spirit

## Save [glossary:save]

Variants: save, saved, saves

A saved player cannot die that night. A save stops every attempt to kill that player that night, even several at once. Saves only work at night, and players can never save themselves.

Scripts: horrors

Linked from role IDs: horrors/doctor

## Learn [glossary:learn]

Variants: learn, learns

The Storyteller privately tells you information that players cannot normally access. This is the main ability of information roles. If you are feared, poisoned or drunk, what you learn may be false.

Scripts: horrors, holyMoonStars

Linked from role IDs: horrors/watchman, horrors/bodyguard, horrors/judge, horrors/mortician, horrors/sheriff, horrors/hoflibrarian, horrors/teacher, holyMoonStars/mystic, holyMoonStars/astronaut, holyMoonStars/prophet, holyMoonStars/insomniac, holyMoonStars/spirit, holyMoonStars/celestial, holyMoonStars/moonshiner

## Declare [glossary:declare]

Variants: declare, declares, declared, declaration

An official public statement made during the day. If you are asked to declare at night, wait until morning to make your declaration.

Example: “I am the Vigilante and I declare that I want to kill Player A.”

Scripts: horrors

Linked from role IDs: horrors/vigilante, horrors/hag, horrors/researcher

## Neighbor [glossary:neighbor]

Variants: neighbor, neighbors

A player sitting directly next to you; everyone has two. Neighbors include both living and dead players unless an ability says otherwise, for example “living neighbors”.

Scripts: horrors, holyMoonStars

Linked from role IDs: horrors/teacher, horrors/lostwanderer, horrors/monster, holyMoonStars/mystic, holyMoonStars/prophet, holyMoonStars/insomniac, holyMoonStars/fateweaver, holyMoonStars/dazed, holyMoonStars/miasma

## Possible missing definitions [gaps:undefined]

Heuristic list of game vocabulary found in ability text without a matching glossary variant; Art should decide which need definitions. This is not an automatic claim that every noun needs an entry.

- **poisoned** [undefined:poisoned]: holyMoonStars/celestial, holyMoonStars/miasma
- **drunk** [undefined:drunk]: horrors/drunk, holyMoonStars/celestial, holyMoonStars/dazed, holyMoonStars/moonshiner
- **execution** [undefined:execution]: horrors/executioner
- **dead** [undefined:dead]: horrors/mortician, horrors/researcher, holyMoonStars/stargazer, holyMoonStars/medium, holyMoonStars/gravedigger, holyMoonStars/priest, holyMoonStars/necromancer
- **revive** [undefined:revive]: holyMoonStars/constellation
- **alignment** [undefined:alignment]: horrors/judge, holyMoonStars/gravedigger
- **haunt** [undefined:haunt]: horrors/sheriff, horrors/hunter, holyMoonStars/prophet, holyMoonStars/necromancer
- **horror** [undefined:horror]: horrors/detective, horrors/executioner, holyMoonStars/prophet, holyMoonStars/necromancer
- **once per game** [undefined:once-per-game]: horrors/mortician, horrors/vigilante, horrors/researcher, holyMoonStars/gravedigger, holyMoonStars/priest, holyMoonStars/constellation, holyMoonStars/necromancer, holyMoonStars/nightmare, holyMoonStars/astrophage
