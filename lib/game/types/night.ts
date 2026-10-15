// Horrors of Fearville night orders. Steps that are not characters:
// minioninfo/demoninfo — evil introductions (7+ players)
// fear — Banshee and Monster fear carried from the day or previous night
//        takes effect (automatic, no Storyteller task)
// deaths — resolve queued night deaths
// The Sphinx's glimpse is an automatic popup during the night-choice window.
export const HOF_FIRST = [
  'minioninfo',
  'demoninfo',
  'basilisk',
  'lostwanderer',
  'sheriff',
  'hoflibrarian',
  'teacher',
  'psychic',
  'detective',
  'judge',
  'sphinx',
  'deaths',
];
export const HOF_OTHER = [
  'fear',
  'basilisk',
  'lostwanderer',
  'doctor',
  'monster',
  'wraith',
  'detective',
  'judge',
  'psychic',
  'mortician',
  'sphinx',
  'watchman',
  'deaths',
];
// Holy Moon and Stars night orders. Steps that are not characters:
// minioninfo/demoninfo — evil introductions (7+ players; none with an Atheist)
// plague — resolve last night's Miasma infection before anyone acts
// nightmare — an executed Nightmare binds to a player (once)
// guess — the Constellation's once-per-game guess (never on Night 1)
// deaths — resolve queued Horror and other night deaths after Spirit/Insomniac
export const HMS_FIRST = [
  'minioninfo',
  'demoninfo',
  'constellation',
  'stargazer',
  'astrologist',
  'mystic',
  'astronaut',
  'prophet',
  'diviner',
  'miasma',
  'grimreaper',
  'werewolf',
  'dreameater',
  'spirit',
  'insomniac',
  'deaths',
];
export const HMS_OTHER = [
  'plague',
  'nightmare',
  'medium',
  'gravedigger',
  'priest',
  'necromancer',
  'guess',
  'diviner',
  'miasma',
  'grimreaper',
  'werewolf',
  'dreameater',
  'spirit',
  'insomniac',
  'deaths',
];
