'use client';
import { useKeepAwakeSetting } from '@/hooks/use-keep-awake';

export function KeepAwakeToggle() {
  const { enabled, setEnabled, busy, error } = useKeepAwakeSetting();
  return (
    <div>
      <label className="check-setting">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(event) => void setEnabled(event.target.checked)}
        />
        <span>Keep screen awake during games</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
