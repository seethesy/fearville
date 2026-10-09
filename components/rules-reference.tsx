import { RoleIcon } from './role-icon';
import {
  HMS_ROLES,
  HMS_FIRST,
  HMS_OTHER,
  HOF_ROLES,
  HOF_FIRST,
  HOF_OTHER,
  MAX_PLAYERS,
  scriptRoles,
  role,
  type RoleScript,
} from '@/lib/game/types';
import { GLOSSARY, glossarySegments } from '@/lib/game/glossary';

const teams = [
  {
    id: 'townsfolk',
    name: 'Villagers',
    alignment: 'Good',
    description: 'Abilities that help the town find evil.',
  },
  {
    id: 'outsider',
    name: 'Fools',
    alignment: 'Good',
    description: 'Good players whose abilities complicate the town’s work.',
  },
  {
    id: 'traveler',
    name: 'Travelers',
    alignment: 'Neutral',
    description:
      'Neither good nor evil. Each has a personal win condition, won alongside the team result.',
  },
  {
    id: 'minion',
    name: 'Haunts',
    alignment: 'Evil',
    description: 'Support the Horror and mislead the town.',
  },
  {
    id: 'demon',
    name: 'Horrors',
    alignment: 'Evil',
    description: 'The town’s hidden enemy.',
  },
];

const STEP_NAMES: Record<string, string> = {
  minioninfo: 'Haunts learn the Horror (7+ players)',
  demoninfo: 'Horror learns Haunts and bluffs (7+ players)',
  plague: 'Last night’s plague victim dies; their neighbors are poisoned',
  nightmare: 'An executed Nightmare chooses a player to haunt',
  guess: 'Constellation’s once-per-game guess',
  deaths: 'Queued deaths resolve',
  fear: 'Banshee and Monster fear takes effect',
  sphinx: 'Sphinx (automatic glimpse during the choice timer)',
};
const teamsFor = (script: RoleScript) =>
  teams.filter((team) => scriptRoles(script).some((r) => r.team === team.id));
// Role text with glossary terms linked to their definitions.
function Described({ text, linked }: { text: string; linked: boolean }) {
  if (!linked) return <>{text}</>;
  return (
    <>
      {glossarySegments(text).map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : (
          <a key={i} className="glossary-link" href={`#glossary-${part.id}`}>
            {part.text}
          </a>
        ),
      )}
    </>
  );
}
function RoleTeams({ script }: { script: RoleScript }) {
  const list = scriptRoles(script);
  return (
    <>
      {teamsFor(script).map((team) => (
        <section
          id={`roles-${script}-${team.id}`}
          key={team.id}
          className="reference-section"
        >
          <h3>
            {team.name} · {team.alignment}
          </h3>
          <p className="muted">{team.description}</p>
          <div className="reference-role-grid">
            {list
              .filter((r) => r.team === team.id)
              .map((r) => (
                <article key={r.id} id={`role-${r.id}`}>
                  <h4>
                    <RoleIcon role={r.id} /> {r.name}
                  </h4>
                  <p>
                    <Described
                      text={r.description}
                      linked={script === 'horrors'}
                    />
                  </p>
                </article>
              ))}
          </div>
        </section>
      ))}
    </>
  );
}
function MoonAndStars() {
  const step = (id: string) => STEP_NAMES[id] ?? role(id)?.name ?? id;
  return (
    <section className="reference-section" aria-labelledby="hms-roles">
      <p className="eyebrow">HOLY MOON AND STARS</p>
      <h2 id="hms-roles">All {HMS_ROLES.length} roles</h2>
      <div className="rules-grid">
        <article>
          <h3>Four Horrors</h3>
          <p>
            The Grim Reaper marks and reaps, the Werewolf strikes three at a
            time on Nights 3, 6, 9…, the Dreameater guesses characters, and the
            Miasma spreads a plague. There is no Horror succession.
          </p>
        </article>
        <article>
          <h3>How a death resolves</h3>
          <p>
            Redirects first (Dazed, then the Nightmare), then prevention (Extra
            Life; the Celestial by day), then the Fateweaver may move the death
            once, and only then do death triggers happen (Constellation, Zealot,
            Priest, Moonshiner).
          </p>
        </article>
        <article>
          <h3>Visits</h3>
          <p>
            Choosing a player with a night ability visits them. The Spirit and
            Insomniac act after nearly every visit, and before the night’s
            Horror deaths resolve.
          </p>
        </article>
        <article>
          <h3>Dawn</h3>
          <p>
            Revivals from the Priest and Necromancer, the Gravedigger’s new
            character and the Priest’s self-revival happen at dawn. The Medium’s
            channel closes.
          </p>
        </article>
      </div>
      <div className="rules-grid">
        <article>
          <h3>First night</h3>
          <ol>
            {HMS_FIRST.map((id) => (
              <li key={id}>{step(id)}</li>
            ))}
          </ol>
        </article>
        <article>
          <h3>Other nights</h3>
          <ol>
            {HMS_OTHER.map((id) => (
              <li key={id}>{step(id)}</li>
            ))}
          </ol>
          <p className="muted">
            A dead player reached by the Medium acts in their own slot.
          </p>
        </article>
      </div>
      <RoleTeams script="holyMoonStars" />
    </section>
  );
}

function HorrorsOfFearville() {
  const step = (id: string) => STEP_NAMES[id] ?? role(id)?.name ?? id;
  return (
    <section className="reference-section" aria-labelledby="hof-roles">
      <p className="eyebrow">HORRORS OF FEARVILLE · 5–18 PLAYERS</p>
      <h2 id="hof-roles">All {HOF_ROLES.length} roles</h2>
      <div className="rules-grid">
        <article>
          <h3>Fear, visits and saves</h3>
          <p>
            Choosing a player at night <a href="#glossary-visit">visits</a>{' '}
            them. A <a href="#glossary-fear">feared</a> player’s ability
            malfunctions without them knowing. A{' '}
            <a href="#glossary-save">saved</a> player cannot die that night.
          </p>
        </article>
        <article>
          <h3>Declarations</h3>
          <p>
            The Vigilante, the Researcher and a killed Hag act by{' '}
            <a href="#glossary-declare">declaring</a> publicly during the day,
            from their Controls. The Storyteller rules on the outcome.
          </p>
        </article>
        <article>
          <h3>Travelers</h3>
          <p>
            Executioner, Researcher and Guardian are neutral. They register as
            neither good nor evil and win in addition to whichever team wins.
            The Researcher learns their result at the end of the game.
          </p>
        </article>
        <article>
          <h3>How a death resolves</h3>
          <p>
            A save or an impaired killer prevents a night death. Then the
            Guardian may die in their ward’s place, and only then do triggers
            happen (Executioner, Banshee, Hag, Hunter, Monster).
          </p>
        </article>
      </div>
      <div className="rules-grid">
        <article>
          <h3>First night</h3>
          <ol>
            {HOF_FIRST.filter((id) => id !== 'deaths').map((id) => (
              <li key={id}>{step(id)}</li>
            ))}
          </ol>
        </article>
        <article>
          <h3>Other nights</h3>
          <ol>
            {HOF_OTHER.map((id) => (
              <li key={id}>{step(id)}</li>
            ))}
          </ol>
        </article>
      </div>
      <RoleTeams script="horrors" />
    </section>
  );
}

// Shared public reference: never accepts a game state or exposes assigned roles.
// Inside a game, only that game's script is shown; the public page shows both.
export function RulesReference({ script }: { script?: RoleScript }) {
  return (
    <div className="rules-reference">
      <nav className="reference-nav" aria-label="Rules and role sections">
        <a href="#how-to-play">How to play</a>
        <a href="#glossary">Glossary</a>
        <a href="#using-fearville">Using Fearville</a>
        {teamsFor(script ?? 'horrors').map((team) => (
          <a key={team.id} href={`#roles-${script ?? 'horrors'}-${team.id}`}>
            {team.name}
          </a>
        ))}
      </nav>
      <section id="how-to-play" className="reference-section">
        <p className="eyebrow">THE BASICS</p>
        <h2>How to play</h2>
        <div className="rules-grid">
          <article>
            <h3>Two teams, one hidden Horror</h3>
            <p>
              Good aims to kill the Horror. Evil usually wins when only two
              players remain alive. Character abilities can change these
              outcomes; the Storyteller resolves them.
            </p>
          </article>
          <article>
            <h3>Day and night</h3>
            <p>
              By day, talk, share information, and bluff. At night, follow the
              Storyteller’s private instructions. Some characters act only on
              the first night or when a condition is met.
            </p>
          </article>
          <article>
            <h3>Nominations and execution</h3>
            <p>
              Living players may nominate once each day; each player may be
              nominated once. Votes need at least half the living players,
              rounded up. The highest qualifying tally leads to execution; a tie
              means no execution.
            </p>
          </article>
          <article>
            <h3>Death is not the end</h3>
            <p>
              Dead players still talk and win with their team. They cannot
              nominate and have one remaining vote. Abilities usually stop on
              death unless they say otherwise.
            </p>
          </article>
          <article>
            <h3>Information can be wrong</h3>
            <p>
              Drunkenness and poison disable abilities without telling their
              owners. Information may be false. Ask the Storyteller privately
              when unsure.
            </p>
          </article>
          <article>
            <h3>Keep the game fair</h3>
            <p>
              Bluffing is welcome; peeking at private screens is not. Respect
              the other players and ask the neutral Storyteller for help.
            </p>
          </article>
        </div>
        <p className="hint">
          Quick reference. Character-specific rulings take precedence.
        </p>
      </section>
      <section
        id="glossary"
        className="reference-section"
        aria-labelledby="glossary-title"
      >
        <p className="eyebrow">KEY TERMS</p>
        <h2 id="glossary-title">Glossary</h2>
        <p className="muted">
          Role descriptions use these words with a precise meaning.
        </p>
        <dl className="glossary">
          {GLOSSARY.map((t) => (
            <div key={t.id} id={`glossary-${t.id}`} className="glossary-term">
              <dt>{t.term}</dt>
              <dd>
                {t.definition}
                {t.example && (
                  <>
                    {' '}
                    <span className="glossary-example">
                      Example: {t.example}
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section id="using-fearville" className="reference-section">
        <p className="eyebrow">AT THIS TABLE</p>
        <h2>Using Fearville</h2>
        <ol className="reference-steps">
          <li>
            <strong>Join and prepare.</strong> One Storyteller creates a room
            for 5–{MAX_PLAYERS} players. They assign roles randomly or manually,
            review setup, and start the game. Your character stays hidden until
            you reveal it on your own screen.
          </li>
          <li>
            <strong>Follow Game flow.</strong> Discovery, discussion,
            nominations, defense, and voting use shared timers. Check Messages
            at night and send choices privately to the Storyteller, who resolves
            abilities.
          </li>
          <li>
            <strong>Vote openly.</strong> Submit Yes or No in Game flow;
            everyone can see your answer. At this table, the nominee does not
            vote. Voting closes when all eligible players answer or the timer
            ends, whichever comes first. You can change your ballot until then.
            A counted Yes spends a dead player’s remaining vote; No does not.
            The Storyteller confirms the day’s outcome.
          </li>
          <li>
            <strong>Answer a night poll.</strong> Everyone can pick a name for
            fun while waiting. Polls do not use character abilities or count as
            execution votes. Only the favorite or tied favorites appear after
            dawn.
          </li>
          <li>
            <strong>Keep your seat.</strong> Closing a tab does not leave the
            game. Return from the home page in the same browser. Save your
            private recovery key or link your account to return from another
            device.
          </li>
        </ol>
      </section>
      {(!script || script === 'holyMoonStars') && <MoonAndStars />}
      {(!script || script === 'horrors') && <HorrorsOfFearville />}
    </div>
  );
}
