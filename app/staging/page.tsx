import { currentEnvironment } from '@/lib/runtime/environment';
import { FIXTURES } from '@/lib/staging/fixtures';
import { ReviewPanel } from '@/components/staging/review-panel';

// FEAR-161: UI review entry point. Never available in production.
export default function StagingReview() {
  if (currentEnvironment() === 'production')
    return (
      <main className="panel">
        <p>Not found.</p>
      </main>
    );
  return <ReviewPanel fixtures={FIXTURES} />;
}
