import AppLink from '@/components/app-link';
// Terms of use and community rules (FEAR-119). Linked from sign-in.
export default function Terms() {
  return (
    <main className="entry">
      <section className="panel">
        <p className="eyebrow">FEARVILLE</p>
        <h1>Terms and community rules</h1>
        <p>
          Fearville is a companion app for in-person games. By creating an
          account or joining a table you agree to these rules. Breaking them can
          get content removed and accounts suspended.
        </p>
        <h2>Zero tolerance for objectionable content</h2>
        <ul>
          <li>No harassment, bullying, threats or abuse of other players.</li>
          <li>
            No hate speech or slurs targeting race, ethnicity, religion,
            disability, gender, sexual orientation or any other group.
          </li>
          <li>No sexual content, and nothing involving minors.</li>
          <li>No spam, scams or advertising.</li>
          <li>
            No cheating, such as sharing hidden information outside the rules of
            the game.
          </li>
          <li>
            Usernames, table names, chat and Storyteller comments must follow
            these rules. Offensive usernames and comments are rejected.
          </li>
        </ul>
        <h2>Reporting and blocking</h2>
        <p>
          Report a player from their profile, a chat message or a Storyteller
          comment. Block a player from the same places to stop seeing their
          messages, requests and invitations. Reports are reviewed within 24
          hours. Content that breaks these rules is removed, and the account
          responsible can be warned or suspended.
        </p>
        <h2>Your account</h2>
        <p>
          Keep your sign-in to yourself. You can delete your account at any time
          from Account → Settings or at{' '}
          <AppLink href="/delete-account">fearville.app/delete-account</AppLink>
          . See the <AppLink href="/privacy">privacy page</AppLink> for what we
          store.
        </p>
        <h2>No warranty</h2>
        <p>
          Fearville is provided as is, without guarantees of availability. These
          terms may change; continued use means you accept the current version.
        </p>
      </section>
    </main>
  );
}
