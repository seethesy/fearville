// Original geometric icons drawn for Fearville; dedicated to the public domain.
const paths: Record<string, string> = {
  washerwoman: 'M4 10h16l-2 10H6z M8 4v3m4-3v3m4-3v3 M5 14q3-3 7 0t7 0',
  librarian: 'M12 6Q7 2 3 5v15q5-3 9 0 4-3 9 0V5q-4-3-9 1v14',
  investigator:
    'M15 15l6 6 M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M7 10h6m-3-3v6',
  chef: 'M6 12C0 10 3 3 8 5c1-5 7-5 8 0 5-2 8 5 2 7v8H6z M6 16h12',
  empath: 'M12 20S1 13 3 7q3-6 9 0 6-6 9 0c2 6-9 13-9 13',
  fortuneteller:
    'M19 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M6 21h12l-2-4H8z M12 6v8m-4-4h8',
  undertaker: 'M7 3h10l4 7-4 11H7L3 10z M12 6v11m-3-7h6',
  monk: 'M5 21v-7Q1 8 8 4l4-2 4 2q7 4 3 10v7z M8 10q4 8 8 0 M8 21v-5m8 5v-5',
  ravenkeeper: 'M3 15l7-9 4 2 4-3 1 5 3 2-5 1-5 7-2-5z M14 10h1',
  virgin: 'M12 3l2 5 6-2-3 6 4 3-6 1-3 6-3-6-6-1 4-3-3-6 6 2z',
  slayer: 'M5 21L18 4l3-1-1 4L7 23 M3 14l8 6',
  soldier: 'M12 2l8 4v7q0 5-8 9-8-4-8-9V6z M12 6v12m-5-7h10',
  mayor: 'M3 7l5 4 4-8 4 8 5-4-3 12H6z M6 22h12',
  butler: 'M3 15h18 M5 14a7 7 0 0 1 14 0 M12 7V4 M8 21l4-6 4 6',
  drunk: 'M6 3h12l-2 10-4 3-4-3z M12 16v5m-4 0h8 M7 8h10',
  recluse: 'M3 11L12 3l9 8 M5 10v11h14V10 M10 21v-7h4v7',
  saint: 'M18 5a6 2 0 1 1-12 0 6 2 0 0 1 12 0 M12 10v12m-6-7h12',
  poisoner:
    'M9 2h6m-5 0v6L4 19q-1 3 3 3h10q4 0 3-3L14 8V2 M7 15h10 M10 18l4 2m0-2-4 2',
  spy: 'M2 12q10-14 20 0-10 14-20 0 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  scarletwoman:
    'M12 12q-10-9-7 1 1 4 7-1 10-9 7 1-1 4-7-1 M12 12V4m0 8v10m0-5 6-2',
  baron: 'M4 21V6h4v4h3V3h3v7h3V6h3v15z M10 21v-6h4v6',
  imp: 'M6 9L3 2l8 5h2l8-5-3 7v6l-6 7-6-7z M8 12l2 1m6-1-2 1 M9 17h6',
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
