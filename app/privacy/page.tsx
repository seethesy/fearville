import Link from 'next/link';
export default function Privacy() {
  return (
    <main className="entry">
      <section className="panel">
        <p className="eyebrow">FEARVILLE</p>
        <h1>Privacy and account data</h1>
        <p>
          Guest play uses a random private seat credential. If you choose Google
          or Apple sign-in, the app stores the provider’s stable identifier,
          your verified email when supplied, and your display name to create and
          recover your account. It never receives your Google or Apple password.
        </p>
        <p>
          Game data includes chosen seat names, characters, votes, timers, and
          messages. The Storyteller can see the full game state and player
          conversations. Players receive their own private information and
          public game updates. Data is stored on the app’s hosting service. No
          advertising or cross-site tracking is used. The service processes
          network addresses for rate limiting and operation.
        </p>
        <p>
          Account sessions and guest recovery keys expire after 30 days. Game
          records persist for recovery and Storyteller corrections. Apple
          refresh credentials, when supplied, are encrypted and used only to
          revoke the Apple connection when deleting an account.
        </p>
        <p>
          You can delete an account from Account on the web or Controls →
          Account on iPhone. Deletion removes account identity records, linked
          provider credentials, and saved seat access. Games you host are
          deleted. Shared records in another Storyteller’s game remain part of
          that game; contact that Storyteller about corrections to those
          records. Previously read information cannot be made unknown.
        </p>
        <p>
          This is an in-person game companion. It is not affiliated with Google
          or Apple.
        </p>
        <Link href="/account" className="quiet-link">
          Manage your account →
        </Link>
      </section>
    </main>
  );
}
