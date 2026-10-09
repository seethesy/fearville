// Original geometric icons drawn for Fearville; dedicated to the public domain.
const paths: Record<string, string> = {
  drunk: 'M6 3h12l-2 10-4 3-4-3z M12 16v5m-4 0h8 M7 8h10',
  // Holy Moon and Stars
  astrologist:
    'M4 20l16-16 M6 5h.01 M18 19h.01 M5 13h.01 M14 6l1 2 2 1-2 1-1 2-1-2-2-1 2-1z',
  mystic:
    'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18 M12 7v10 M7 12h10 M12 3q-5 9 0 18 M12 3q5 9 0 18',
  astronaut: 'M7 10a5 5 0 0 1 10 0v5H7z M9 10h6 M5 21l2-6h10l2 6 M12 5V3',
  stargazer: 'M3 17l9-9 3 3-9 9z M12 8l4-4 4 4-4 4 M18 3v2m2 0h-2',
  prophet: 'M4 4h16v16H4z M8 9h8 M8 13h8 M8 17h5 M12 2v2',
  insomniac: 'M15 4a8 8 0 1 0 5 13 7 7 0 0 1-5-13 M9 11v.01 M13 11v.01',
  diviner: 'M12 3l3 6 6 1-4 4 1 7-6-3-6 3 1-7-4-4 6-1z M12 10v4',
  medium: 'M6 20V10a6 6 0 0 1 12 0v10l-3-2-3 2-3-2z M10 11h.01 M14 11h.01',
  spirit: 'M12 3c4 0 6 3 6 7v11l-3-2-3 2-3-2-3 2V10c0-4 2-7 6-7 M9 10q3 3 6 0',
  gravedigger: 'M12 3v12 M8 15h8l-1 6H9z M6 7l6-4 6 4',
  fateweaver: 'M4 12q4-8 8 0t8 0 M4 18q4-8 8 0t8 0 M4 6q4-8 8 0t8 0',
  priest: 'M12 2v20 M6 8h12 M8 22h8',
  atheist: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18 M6 6l12 12',
  celestial:
    'M12 2v4m0 12v4M2 12h4m12 0h4 M5 5l3 3m8 8 3 3M19 5l-3 3M8 16l-3 3 M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  constellation: 'M4 18l6-12 6 9 4-7 M4 18h.01 M10 6h.01 M16 15h.01 M20 8h.01',
  lostsoul: 'M12 21a9 9 0 1 1 0-18 M9 9q0-3 3-3t3 3-3 3v2 M12 18v.01',
  zealot: 'M12 3l2 7h7l-6 4 2 7-5-4-5 4 2-7-6-4h7z',
  dazed:
    'M12 12m-2 0a2 2 0 1 0 4 0 4 4 0 1 0-8 0 6 6 0 1 0 12 0 8 8 0 1 0-16 0',
  necromancer:
    'M6 21V11a6 6 0 0 1 12 0v10 M9 12h.01 M15 12h.01 M10 17h4 M3 7l3 2m15-2-3 2',
  moonshiner:
    'M7 3h10l-1 5a5 5 0 0 1-8 0z M12 13v8 M8 21h8 M19 4a3 3 0 0 0 0 5',
  nightmare: 'M3 12q9-12 18 0-9 12-18 0 M12 9v6 M9 12h6 M5 5l2 2m10 0 2-2',
  astrophage:
    'M12 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M12 2v3m0 14v3M2 12h3m14 0h3 M17 7l3-3',
  grimreaper: 'M5 21L15 5 M15 5q6 0 6 6-4-4-9-2',
  werewolf: 'M4 20l3-12 5 4 5-4 3 12z M9 15h.01 M15 15h.01 M18 4a3 3 0 1 0 3 3',
  dreameater: 'M3 12q9-9 18 0 M3 12q9 9 18 0 M8 12l2 2 2-2 2 2 2-2',
  miasma:
    'M12 21a5 5 0 0 1-5-5c0-4 5-9 5-13 0 4 5 9 5 13a5 5 0 0 1-5 5 M10 15h.01 M14 17h.01',
  // Horrors of Fearville
  doctor: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
  detective:
    'M3 9h18 M6 9l2-5h8l2 5 M8 15a3 3 0 1 0 0 .01 M16 15a3 3 0 1 0 0 .01 M11 15h2',
  watchman: 'M12 3l8 4v4H4V7z M6 11v10 M18 11v10 M4 21h16 M12 14v4',
  bodyguard: 'M12 2l8 4v6q0 6-8 10-8-4-8-10V6z M9 12l2 2 4-4',
  psychic: 'M2 12q10-12 20 0-10 12-20 0 M12 9v6 M9 12h6 M12 2v3',
  judge: 'M12 3v18 M5 21h14 M4 8h16 M4 8l-2 6h4z M20 8l-2 6h4z',
  mortician: 'M8 3h8l3 6-3 12H8L5 9z M10 9h4 M12 7v6',
  vigilante:
    'M12 12m-8 0a8 8 0 1 0 16 0 8 8 0 1 0-16 0 M12 2v6 M12 16v6 M2 12h6 M16 12h6',
  sheriff: 'M12 2l2.5 5.5L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z',
  hoflibrarian: 'M4 4h5v16H4z M10 4h4v16h-4z M15 5l4-1 3 15-4 1z',
  teacher: 'M3 6h18v10H3z M7 20l2-4 M17 20l-2-4 M7 10h6',
  hunter: 'M4 20L20 4 M15 4h5v5 M4 15l5 5 M9 9l-5-1 M15 15l1 5',
  hag: 'M12 3l7 12H5z M3 15h18 M8 19a4 4 0 0 0 8 0',
  lostwanderer:
    'M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11 M10 9q2-3 4 0t-2 3v1 M12 16h.01',
  executioner: 'M6 21V8l6-5 6 5v13 M3 21h18 M10 12h4v4h-4z',
  researcher: 'M9 3h6 M10 3v6L5 19h14L14 9V3 M8 14h8',
  guardian: 'M4 12a8 8 0 0 1 16 0 M12 4v16 M8 20h8 M4 12h16',
  banshee:
    'M7 21V10a5 5 0 0 1 10 0v11l-2-2-3 2-3-2z M10 10h.01 M14 10h.01 M10 14q2 2 4 0',
  basilisk: 'M4 18q4-8 8-4t8-6 M18 6l2 2-2 2 M6 18h.01',
  sphinx: 'M3 20h18 M6 20V11l6-7 6 7v9 M10 13h.01 M14 13h.01 M10 17h4',
  monster:
    'M4 21V10l4-6 4 4 4-4 4 6v11 M8 13h.01 M16 13h.01 M8 17l2 1 2-1 2 1 2-1',
  wraith:
    'M6 21c0-8 1-17 6-17s6 9 6 17l-2-2-2 2-2-2-2 2-2-2z M10 10h.01 M14 10h.01',
};
export function RoleIcon({ role }: { role: string }) {
  return (
    <svg
      className="role-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[role] ?? 'M12 3v12m0 4v2'} />
    </svg>
  );
}
