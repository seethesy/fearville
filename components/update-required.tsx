'use client';
// FEAR-120: "Update required" (full screen, no game actions) for shells below
// the minimum build, and a dismissible "Update available" banner below the
// recommended build. The server refuses old shells with 426 regardless; this
// screen just explains it.
import { useEffect, useState } from 'react';
import { useRemoteSwitches } from '@/components/remote-switches';
import { NATIVE_EVENT } from '@/lib/native/bridge';
import {
  UPDATE_EVENT,
  currentClient,
  type UpdateDetail,
} from '@/lib/compat/client';
import { compatibility, type ClientInfo } from '@/lib/compat/versions';

const DISMISSED = 'fearville:update-dismissed';
function dismissedFor(build: number) {
  try {
    return localStorage.getItem(DISMISSED) === String(build);
  } catch {
    return false;
  }
}

export function UpdateGate() {
  const switches = useRemoteSwitches();
  const [client, setClient] = useState<ClientInfo>({ platform: 'unknown' }),
    [server, setServer] = useState<UpdateDetail | null>(null),
    [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    // The shell reports its build asynchronously after the bridge installs.
    const read = () => setClient(currentClient());
    const timer = setTimeout(read, 0);
    const onNative = (e: Event) => {
      if ((e as CustomEvent<{ type?: string }>).detail?.type === 'app') read();
    };
    const onUpdate = (e: Event) =>
      setServer((e as CustomEvent<UpdateDetail>).detail);
    window.addEventListener(NATIVE_EVENT, onNative);
    window.addEventListener(UPDATE_EVENT, onUpdate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener(NATIVE_EVENT, onNative);
      window.removeEventListener(UPDATE_EVENT, onUpdate);
    };
  }, []);
  const local = switches ? compatibility(client, switches.builds) : null;
  const required =
    local?.status === 'required'
      ? local
      : server?.status === 'required'
        ? server
        : null;
  const build = 'build' in client ? client.build : 0;
  if (required)
    return (
      <div
        className="update-required"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="update-required-title"
      >
        <h1 id="update-required-title">Update required</h1>
        <p>
          This version of Fearville is too old to play. Update the app to keep
          playing; your account and seats are safe.
        </p>
        {required.updateUrl ? (
          <a
            className="primary"
            href={required.updateUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Update Fearville
          </a>
        ) : (
          <p className="muted">
            Update from TestFlight or your app store, then reopen Fearville.
          </p>
        )}
      </div>
    );
  const recommended =
    local?.status === 'recommended'
      ? local
      : server?.status === 'recommended'
        ? server
        : null;
  if (!recommended || dismissed || dismissedFor(build)) return null;
  return (
    <div className="update-available" aria-live="polite">
      <span>A new version of Fearville is available.</span>
      {recommended.updateUrl && (
        <a
          href={recommended.updateUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Update
        </a>
      )}
      <button
        type="button"
        className="secondary"
        aria-label="Dismiss update notice"
        onClick={() => {
          setDismissed(true);
          try {
            localStorage.setItem(DISMISSED, String(build));
          } catch {
            /* Dismissal lasts for this page only. */
          }
        }}
      >
        Not now
      </button>
    </div>
  );
}
