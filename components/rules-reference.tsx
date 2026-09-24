import { RoleIcon } from './role-icon';
import { ROLES } from '@/lib/game/types';

const teams = [
  {
    id: 'townsfolk',
    name: 'Townsfolk',
    alignment: 'Good',
    description: 'Abilities that help the town find evil.',
  },
  {
    id: 'outsider',
    name: 'Outsiders',
    alignment: 'Good',
    description: 'Good players whose abilities complicate the town’s work.',
  },
  {
    id: 'minion',
    name: 'Minions',
    alignment: 'Evil',
    description: 'Support the Demon and mislead the town.',
  },
  {
    id: 'demon',
    name: 'Demon',
    alignment: 'Evil',
    description: 'The town’s hidden enemy.',
  },
];

// Shared public reference: never accepts a game state or exposes assigned roles.
export function RulesReference() {
  return (
    <div className="rules-reference">
      <nav className="reference-nav" aria-label="Rules and role sections">
        <a href="#how-to-play">How to play</a>
        <a href="#using-fearville">Using Fearville</a>
        {teams.map((team) => (
          <a key={team.id} href={`#roles-${team.id}`}>
            {team.name}
          </a>
        ))}
      </nav>
      <section id="how-to-play" className="reference-section">
        <p className="eyebrow">THE BASICS</p>
        <h2>How to play</h2>
        <div className="rules-grid">
          <article>
            <h3>Two teams, one hidden Demon</h3>
            <p>
              Good aims to kill the Demon. Evil usually wins when only two
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
          Quick reference, based on the{' '}
          <a
            href="https://wiki.bloodontheclocktower.com/Rules_Explanation"
            target="_blank"
            rel="noreferrer"
          >
            official rules explanation
          </a>
          . Character-specific rulings take precedence.
        </p>
      </section>
      <section id="using-fearville" className="reference-section">
        <p className="eyebrow">AT THIS TABLE</p>
        <h2>Using Fearville</h2>
        <ol className="reference-steps">
          <li>
            <strong>Join and prepare.</strong> One Storyteller creates a room
            for 5–15 players. They assign roles randomly or manually, review
            setup, and start the game. Your character stays hidden until you
            reveal it on your own screen.
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
      <section className="reference-section" aria-labelledby="all-roles">
        <p className="eyebrow">TROUBLE BREWING</p>
        <h2 id="all-roles">All 22 roles</h2>
        <p className="muted">
          This is the full script, including characters that may not be in your
          game. These summaries never reveal which roles are assigned. See the{' '}
          <a
            href="https://wiki.bloodontheclocktower.com/Trouble_Brewing"
            target="_blank"
            rel="noreferrer"
          >
            official script and character rulings
          </a>{' '}
          for details.
        </p>
        {teams.map((team) => (
          <section
            id={`roles-${team.id}`}
            key={team.id}
            className="reference-section"
          >
            <h3>
              {team.name} · {team.alignment}
            </h3>
            <p className="muted">{team.description}</p>
            <div className="reference-role-grid">
              {ROLES.filter((r) => r.team === team.id).map((r) => (
                <article key={r.id} id={`role-${r.id}`}>
                  <h4>
                    <RoleIcon role={r.id} /> {r.name}
                  </h4>
                  <p>{r.description}</p>
                </article>
              ))}
            </div>
          </section>
        ))}
      </section>
    </div>
  );
}
