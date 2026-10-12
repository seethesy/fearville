'use client';
import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { share } from '@/lib/native/bridge';

const MESSAGES = {
  shared: '',
  cancelled: '',
  copied: 'Invite link copied.',
  unavailable: 'Sharing isn’t available here. Share the code instead.',
} as const;

// The share sheet in the app shells and phone browsers; elsewhere the link is
// copied to the clipboard.
export function ShareInvite({ code }: { code: string }) {
  const [status, setStatus] = useState('');
  return (
    <p>
      <button
        className="secondary"
        onClick={async () => {
          const result = await share({
            title: 'Join my Fearville table',
            text: `Join my Fearville table with code ${code}.`,
            url: `${window.location.origin}/?join=${code}`,
          });
          setStatus(MESSAGES[result]);
        }}
      >
        <Share2 size={16} aria-hidden /> Share invite link
      </button>
      {status && <span className="muted" role="status"> {status}</span>}
    </p>
  );
}
