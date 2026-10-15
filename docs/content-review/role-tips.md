# Role abilities and tips review

Exported by `npm run content:export`. Public source text only; no runtime behavior changes.

Edit these review copies directly and retain the IDs. Copy reviewed edits back to the named source before regenerating: rerunning replaces the review copies. Commit or save your edits first.

Sources: `lib/game/types/roles.ts`, `lib/game/role-tips.json`. Script and role IDs are the mechanical mapping keys.

## horrors

### Doctor [role:horrors:doctor]

Team: townsfolk

Ability [horrors:doctor:description]: Every night after the first, visit a player to save them.

- [horrors:doctor:tip:1] Protect players who can gather information across several nights.
- [horrors:doctor:tip:2] Keep your role private when possible; the Horror has reason to target you.

### Detective [role:horrors:detective]

Team: townsfolk

Ability [horrors:detective:description]: Every night, visit two players to investigate them. You are told “Yes” if one of them is a Horror, or “No” if neither are. One random Villager secretly registers as a false positive, so they may produce a “Yes” despite being a Villager.

- [horrors:detective:tip:1] Cross-check every result: one Villager is a false positive, and fear or drunkenness can distort your information.
- [horrors:detective:tip:2] Share findings carefully so you can keep investigating.

### Watchman [role:horrors:watchman]

Team: townsfolk

Ability [horrors:watchman:description]: Every night after the first, visit a player to stay on lookout for them. You learn the names of all players who visit them.

- [horrors:watchman:tip:1] Watch players the Horror may target or players whose visitors you want to verify.
- [horrors:watchman:tip:2] A hidden Wraith may escape notice, so compare your results with other claims.

### Bodyguard [role:horrors:bodyguard]

Team: townsfolk

Ability [horrors:bodyguard:description]: After the Storyteller confirms that someone will die at night, learn their name and choose whether to die in their place.

- [horrors:bodyguard:tip:1] Find an ally whose survival matters. If the Storyteller confirms they will die at night, you can take their place.

### Psychic [role:horrors:psychic]

Team: townsfolk

Ability [horrors:psychic:description]: Every night, the Storyteller chooses another player for you to visit. After the first night, that player’s role type will be different from the player you visited the previous night. You will not know their roles.

- [horrors:psychic:tip:1] Ask each player you visit what role type they claim, then look for a pattern across nights.
- [horrors:psychic:tip:2] A broken pattern can expose a false claim, but fear or drunkenness can mislead you.

### Judge [role:horrors:judge]

Team: townsfolk

Ability [horrors:judge:description]: Every night, visit two players. You learn if they are the same alignment.

- [horrors:judge:tip:1] Compare players whose claims you can check against other information.
- [horrors:judge:tip:2] Your answer reveals whether their alignments match, not what either role is.

### Mortician [role:horrors:mortician]

Team: townsfolk

Ability [horrors:mortician:description]: Once per game, at night, visit a dead player. Learn which roles have visited them in this game. If they were visited by 3 or more different players, learn 1 of their names.

- [horrors:mortician:tip:1] Wait for a dead player who attracted several visitors if you want the extra name clue.
- [horrors:mortician:tip:2] You can use this ability only once and only while alive.

### Vigilante [role:horrors:vigilante]

Team: townsfolk

Ability [horrors:vigilante:description]: Once per game, during the day, you may declare a player you want to kill. They may die instantly.

- [horrors:vigilante:tip:1] Use other players’ information before declaring a kill; a wrong target can hurt your team.
- [horrors:vigilante:tip:2] A Haunt can be a useful target, especially one whose ability triggers on execution.

### Sheriff [role:horrors:sheriff]

Team: townsfolk

Ability [horrors:sheriff:description]: At the start of the game, learn that one of two players is a particular Haunt.

- [horrors:sheriff:tip:1] Speak privately with the two named players before revealing the Haunt you were shown.
- [horrors:sheriff:tip:2] Check their claims against other evidence; your first-night information may be unreliable.
- [horrors:sheriff:tip:3] Completing the Night Rite can refresh your starting clue.

### Librarian [role:horrors:hoflibrarian]

Team: townsfolk

Ability [horrors:hoflibrarian:description]: At the start of the game, learn that one of two players is a particular Villager.

- [horrors:hoflibrarian:tip:1] Speak privately with the two named players before revealing the Villager you were shown.
- [horrors:hoflibrarian:tip:2] Check their claims against other evidence; your first-night information may be unreliable.
- [horrors:hoflibrarian:tip:3] Completing the Night Rite can refresh your starting clue.

### Teacher [role:horrors:teacher]

Team: townsfolk

Ability [horrors:teacher:description]: At the start of the game, learn that one of your neighbors is a particular role.

- [horrors:teacher:tip:1] Ask your neighbors what they claim before revealing the role you were shown.
- [horrors:teacher:tip:2] Check their claims against other evidence; your first-night information may be unreliable.
- [horrors:teacher:tip:3] Completing the Night Rite can refresh your starting clue.

### Hunter [role:horrors:hunter]

Team: townsfolk

Ability [horrors:hunter:description]: If you are killed at night, a Haunt may die the same night.

- [horrors:hunter:tip:1] If the Horror kills you at night, a Haunt may die too.
- [horrors:hunter:tip:2] A convincing claim to be a valuable information role may draw the Horror’s attack.

### Drunk [role:horrors:drunk]

Team: outsider

Ability [horrors:drunk:description]: You do not know you are the Drunk. Instead, you are shown a random Villager role that you believe yourself to be. That role’s ability will not work as intended, but you will not know that.

- [horrors:drunk:tip:1] You see guidance for the Villager you believe you are.

### Hag [role:horrors:hag]

Team: outsider

Ability [horrors:hag:description]: If you are killed, declare another player to die. If they are Good, they may die that night.

- [horrors:hag:tip:1] Your declaration after death can test a player’s claim to be Good.
- [horrors:hag:tip:2] Coordinate with allies before choosing a target; a Good player may die.

### Lost Wanderer [role:horrors:lostwanderer]

Team: outsider

Ability [horrors:lostwanderer:description]: Every night, visit a player. Anyone else who visits them may be redirected to one of their neighbors.

- [horrors:lostwanderer:tip:1] Visit an ally who may be targeted. Other visits to them may move to a neighbor.
- [horrors:lostwanderer:tip:2] Coordinate with trusted players so your redirection protects more than it disrupts.

### Executioner [role:horrors:executioner]

Team: traveler

Ability [horrors:executioner:description]: At the start of the game, a random player becomes your execution target. You win if this player is executed. This player will never be the Horror.

- [horrors:executioner:tip:1] Your target’s execution wins your personal goal even if you have died.
- [horrors:executioner:tip:2] You may bargain with either team, but reveal your target only when it helps.

### Researcher [role:horrors:researcher]

Team: traveler

Ability [horrors:researcher:description]: Once per game, even while dead, you may declare the role of 3 living players. You win if you are correct about all of them.

- [horrors:researcher:tip:1] Listen to claims and compare them with other players’ information before naming three roles.
- [horrors:researcher:tip:2] You may declare during the day even after death; all three guesses must be right.

### Guardian [role:horrors:guardian]

Team: traveler

Ability [horrors:guardian:description]: At the start of the game, a random player becomes your ward. Any time this player is meant to die, you will die in their place. You win if your ward lives to the end of the game.

- [horrors:guardian:tip:1] Learn what your ward needs to survive; they may belong to any team.
- [horrors:guardian:tip:2] Your goal is for your ward to live to the end, even if you die first.

### Banshee [role:horrors:banshee]

Team: minion

Ability [horrors:banshee:description]: If you are executed, every Villager is feared that night.

- [horrors:banshee:tip:1] You want to be executed. Death from a night attack or a Villager ability will not trigger your fear.
- [horrors:banshee:tip:2] Make a plausible claim that invites suspicion without making yourself an obvious kill target.

### Basilisk [role:horrors:basilisk]

Team: minion

Ability [horrors:basilisk:description]: Every night, visit one player to fear them that night.

- [horrors:basilisk:tip:1] Coordinate with the Horror to fear players whose abilities could expose or protect against them.
- [horrors:basilisk:tip:2] Keeping an information role feared can be more useful than eliminating them immediately.

### Sphinx [role:horrors:sphinx]

Team: minion

Ability [horrors:sphinx:description]: Every night, receive a glimpse of every player’s role for the game.

- [horrors:sphinx:tip:1] Share useful glimpses with your evil team quickly, especially likely information and protection roles.
- [horrors:sphinx:tip:2] Use your clues to help the Horror choose kills and the Basilisk choose fear targets.

### Monster [role:horrors:monster]

Team: demon

Ability [horrors:monster:description]: Every night after the first, visit one player to kill them and choose one of their living neighbors. If the target dies, your chosen neighbor is feared the following night.

- [horrors:monster:tip:1] Choose a victim and one of their living neighbors to fear if that victim dies.
- [horrors:monster:tip:2] Coordinate bluffs and target choices with your Haunts; a saved victim causes no fear.

### Wraith [role:horrors:wraith]

Team: demon

Ability [horrors:wraith:description]: Every night after the first, visit one player to kill them that night. You may choose whether or not you are detected visiting this player.

- [horrors:wraith:tip:1] Choose whether your visit is visible to the Watchman and Mortician.
- [horrors:wraith:tip:2] Coordinate your target and cover story with your Haunts; a hidden visit can conceal your attack.

## holyMoonStars

### Astrologist [role:holyMoonStars:astrologist]

Team: townsfolk

Ability [holyMoonStars:astrologist:description]: At the start of the game, choose 3 players. You are told 3 roles: 1 belongs to one of them and 2 do not belong to anyone.

- [holyMoonStars:astrologist:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Mystic [role:holyMoonStars:mystic]

Team: townsfolk

Ability [holyMoonStars:mystic:description]: At the start of the game, choose 1 of your neighbors. You learn up to 3 other players they may be connected to.

- [holyMoonStars:mystic:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Astronaut [role:holyMoonStars:astronaut]

Team: townsfolk

Ability [holyMoonStars:astronaut:description]: At the start of the game, learn how far the nearest evil player is from you.

- [holyMoonStars:astronaut:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Stargazer [role:holyMoonStars:stargazer]

Team: townsfolk

Ability [holyMoonStars:stargazer:description]: At the start of the game, choose a player. Alive or dead, you may ask the Storyteller who they spoke with or what they discussed. Answers are at Storyteller discretion.

- [holyMoonStars:stargazer:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Prophet [role:holyMoonStars:prophet]

Team: townsfolk

Ability [holyMoonStars:prophet:description]: At the start of the game, learn which Haunt and Horror characters are in play. If the Storyteller hears you reveal this, you and one of your neighbors may die that night.

- [holyMoonStars:prophet:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Insomniac [role:holyMoonStars:insomniac]

Team: townsfolk

Ability [holyMoonStars:insomniac:description]: Each night, learn which players visited you and how many of your neighbors visited another player.

- [holyMoonStars:insomniac:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Diviner [role:holyMoonStars:diviner]

Team: townsfolk

Ability [holyMoonStars:diviner:description]: Each night, ask the Storyteller a question. They answer with the name of a player you should speak to the next day.

- [holyMoonStars:diviner:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Medium [role:holyMoonStars:medium]

Team: townsfolk

Ability [holyMoonStars:medium:description]: Each night after the first, choose a dead player. They may use their night ability tonight (spent once-per-game abilities are not reset), and you share a private channel with them until dawn.

- [holyMoonStars:medium:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Spirit [role:holyMoonStars:spirit]

Team: townsfolk

Ability [holyMoonStars:spirit:description]: Each night, choose a player. Learn how many of their visitors are good and evil. If nobody visited, learn “0 people.” If you die, learn only the number of visitors.

- [holyMoonStars:spirit:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Gravedigger [role:holyMoonStars:gravedigger]

Team: townsfolk

Ability [holyMoonStars:gravedigger:description]: Once per game, at night, choose a dead player. You may become their character and alignment at dawn. The Storyteller may refuse setup-changing characters.

- [holyMoonStars:gravedigger:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Fateweaver [role:holyMoonStars:fateweaver]

Team: townsfolk

Ability [holyMoonStars:fateweaver:description]: The first time either of your living neighbors dies, you may redirect their death. The Storyteller may or may not follow your choice.

- [holyMoonStars:fateweaver:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Priest [role:holyMoonStars:priest]

Team: townsfolk

Ability [holyMoonStars:priest:description]: Once per game, at night, choose a dead player: they return at dawn (Villagers as themselves, Fools as themselves, Haunts as an out-of-play Villager). If you are killed, you return at the next dawn as an out-of-play Villager.

- [holyMoonStars:priest:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Atheist [role:holyMoonStars:atheist]

Team: townsfolk

Ability [holyMoonStars:atheist:description]: If the Atheist is in play, every player is good. Good wins by executing the Storyteller; evil wins when two players remain. The Storyteller may break any rule.

- [holyMoonStars:atheist:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Celestial [role:holyMoonStars:celestial]

Team: townsfolk

Ability [holyMoonStars:celestial:description]: While you live, other good players cannot die during the day. If you are executed, everyone is poisoned until the next dusk and one Villager becomes drunk for the rest of the game. Evil learns whether a Celestial is in play.

- [holyMoonStars:celestial:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Constellation [role:holyMoonStars:constellation]

Team: outsider

Ability [holyMoonStars:constellation:description]: At the start of the game, choose 3 players to link. If one dies, the others may die too. Once per game, at night, guess all their characters: if correct, revive one or give one an extra life; if wrong, the link breaks and you and another member may die.

- [holyMoonStars:constellation:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Lost Soul [role:holyMoonStars:lostsoul]

Team: outsider

Ability [holyMoonStars:lostsoul:description]: You secretly act as an out-of-play Villager, but you do not know which. Its ability does not work, and information is given only as unlabeled names or values.

- [holyMoonStars:lostsoul:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Zealot [role:holyMoonStars:zealot]

Team: outsider

Ability [holyMoonStars:zealot:description]: When you die, the Storyteller gains a character ability from this script of their choice.

- [holyMoonStars:zealot:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Dazed [role:holyMoonStars:dazed]

Team: outsider

Ability [holyMoonStars:dazed:description]: You are drunk and believe you are a Villager. Whenever another player targets you with an ability, the Storyteller may redirect it to one of your living neighbors or to a player of your choice.

- [holyMoonStars:dazed:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Necromancer [role:holyMoonStars:necromancer]

Team: minion

Ability [holyMoonStars:necromancer:description]: Once per game, at night, choose a dead player: they return at dawn as evil (Haunts as themselves; others as an out-of-play Haunt). The Horror cannot be revived.

- [holyMoonStars:necromancer:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Moonshiner [role:holyMoonStars:moonshiner]

Team: minion

Ability [holyMoonStars:moonshiner:description]: Adds a Fool to the game. Every Fool is drunk and believes they are a Villager, though their own Fool ability still works. After you die, the Fools may sober up and learn their real characters.

- [holyMoonStars:moonshiner:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Nightmare [role:holyMoonStars:nightmare]

Team: minion

Ability [holyMoonStars:nightmare:description]: If you are executed, at night choose a player with a nighttime targeting ability. Once per game, when they choose a target, you have 60 seconds to redirect it without them knowing.

- [holyMoonStars:nightmare:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Astrophage [role:holyMoonStars:astrophage]

Team: minion

Ability [holyMoonStars:astrophage:description]: Once per game, during the day, you may end the day early. Not available with 4 or fewer living players.

- [holyMoonStars:astrophage:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Grim Reaper [role:holyMoonStars:grimreaper]

Team: demon

Ability [holyMoonStars:grimreaper:description]: Each night, mark a player for death. At any time you may reap: every marked player dies.

- [holyMoonStars:grimreaper:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Werewolf [role:holyMoonStars:werewolf]

Team: demon

Ability [holyMoonStars:werewolf:description]: Each night, prepare for the full moon. After two nights of preparation, choose 3 players to die (Nights 3, 6, 9…).

- [holyMoonStars:werewolf:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Dreameater [role:holyMoonStars:dreameater]

Team: demon

Ability [holyMoonStars:dreameater:description]: Each night, guess any number of players’ characters. Correct guesses die. At 3 total wrong guesses you die instead, and that night’s correct guesses do not count.

- [holyMoonStars:dreameater:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

### Miasma [role:holyMoonStars:miasma]

Team: demon

Ability [holyMoonStars:miasma:description]: Each night, infect a player with the plague. The next night they die and both of their living neighbors are poisoned that night.

- [holyMoonStars:miasma:tip:1] Review your character’s ability and confirm its timing with the Storyteller.

