import AppLink from '@/components/app-link';
// Keep in sync with docs/privacy-data-inventory.md.
export default function Privacy() {
  return (
    <main className="entry">
      <section className="panel">
        <p className="eyebrow">FEARVILLE</p>
        <h1>Privacy and account data</h1>
        <h2>Accounts</h2>
        <p>
          Guest play uses a random private seat credential. If you choose Google
          or Apple sign-in, the app stores the provider’s stable identifier,
          your email (which may be an Apple relay address) and your display name
          to create and recover your account. It never receives your Google or
          Apple password. With an account you can also save a username, a
          profile photo or icon, settings, privacy choices, friends and tutorial
          progress.
        </p>
        <h2>Games</h2>
        <p>
          Game data includes seat names, characters, votes, night choices,
          timers, private notes and messages. The Storyteller can see the full
          game state and player conversations. Players receive their own private
          information and public game updates. After a game, a recap with seat
          names, characters, notes and messages is shown to its participants,
          and signed-in players keep a record of results, XP, ratings and
          Storyteller feedback.
        </p>
        <h2>How data is used</h2>
        <p>
          Data is used only to run Fearville and is stored with the app’s
          hosting provider. No advertising, no tracking across apps or websites,
          and no data is sold or shared for others’ purposes. Network addresses
          are processed for rate limiting and kept in hashed form for about two
          minutes.
        </p>
        <h2>Retention</h2>
        <p>
          Seat credentials and sign-in sessions expire after 30 days.
          Invitations expire after 24 hours. Account data is kept while the
          account exists. Finished-game records are kept for other players’
          histories. Apple refresh credentials, when supplied, are encrypted and
          used only to revoke the Apple connection when you delete your account.
        </p>
        <h2>Deleting your account</h2>
        <p>
          Delete your account in the app under Account → Settings, or at{' '}
          <AppLink href="/delete-account">fearville.app/delete-account</AppLink>
          . Deletion removes your email, name, sign-in links, username, profile,
          photo, settings, friends, invitations, saved seats, tutorial progress,
          ratings you received and tables you host, and revokes Sign in with
          Apple. Finished games keep your seat as an anonymous “Former player”
          with your name, photo, notes and messages removed; star ratings you
          gave stay in the Storyteller’s average without your comment.
          Information other players already saw can’t be made unknown.
        </p>
        <p>
          This is an in-person game companion. It is not affiliated with Google
          or Apple.
        </p>
        <AppLink href="/account" className="quiet-link">
          Manage your account →
        </AppLink>
      </section>
    </main>
  );
}
