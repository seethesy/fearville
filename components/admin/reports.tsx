'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminRequest } from '@/components/ui-text';
type Report = { id: string; kind: string; reason: string; target_name: string; target_account: string | null; reporter_account: string | null; reporter_seat: string | null; code: string | null; content: string; note: string; status: string; created: number; resolution: string | null };
export function ReportQueue() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [status, setStatus] = useState('open');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ command: string; token: string; output: unknown } | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin?view=reports&status=${status}&offset=${offset}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
      const data = await response.json() as { reports?: Report[]; error?: string };
      if (!response.ok) throw Error(data.error ?? 'Could not load reports.');
      setReports(data.reports ?? []);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load reports.'); }
  }, [status, offset]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load]);
  async function resolve(command: string, token?: string) {
    setBusy(true);
    setError('');
    try {
      const data = await adminRequest({ command, ...(token ? { confirmation: token } : {}) });
      if (data.confirmationRequired && data.confirmation)
        setPending({ command, token: data.confirmation, output: data.output });
      else { setPending(null); setNote(''); await load(); }
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not resolve report.'); setPending(null); }
    finally { setBusy(false); }
  }
  return <section className="panel">
    <h2>Moderation queue</h2>
    <p>Oldest reports first. Review reports within 24 hours; every resolution is audited.</p>
    <label>Status <select value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); setPending(null); }}>
      {['open', 'dismissed', 'actioned', 'all'].map((s) => <option key={s} value={s}>{s}</option>)}
    </select></label>
    <button disabled={busy} onClick={() => void load()}>Refresh reports</button>
    <label className="field">Resolution note <input value={note} maxLength={500} onChange={(e) => { setNote(e.target.value); setPending(null); }} /></label>
    {error && <p role="alert" className="error">{error}</p>}
    {pending && <div className="admin-confirm" role="alert">
      <p>Review this change before confirming.</p><pre>{JSON.stringify(pending.output, null, 2)}</pre>
      <button disabled={busy} onClick={() => void resolve(pending.command, pending.token)}>Confirm resolution</button>
      <button disabled={busy} onClick={() => setPending(null)}>Cancel</button>
    </div>}
    {reports === null ? <p>Loading reports…</p> : reports.length === 0 ? <p>No reports in this view.</p> : reports.map((report) => <article key={report.id}>
      <h3>{report.kind} · {report.reason} · {report.target_name || 'Former player'}</h3>
      <p>{new Date(report.created).toLocaleString()} · {report.status} · Table {report.code ?? '—'}</p>
      <p>Reporter: {report.reporter_account ?? report.reporter_seat ?? 'Former player'}</p>
      <blockquote style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.content}</blockquote>
      {report.note && <p>Reporter note: {report.note}</p>}
      {report.resolution && <p>{report.resolution}</p>}
      {report.status === 'open' && <div className="admin-actions">{['dismiss', 'warn', 'remove', 'suspend'].map((decision) => <button key={decision} disabled={busy || !!pending || ((!report.target_account) && ['warn', 'suspend'].includes(decision))}
        onClick={() => void resolve(`report ${report.id} ${decision}${note.trim() ? ' ' + note.trim() : ''}`)}>{decision === 'remove' ? 'Remove content' : decision === 'suspend' ? 'Suspend account' : decision === 'warn' ? 'Warn account' : 'Dismiss'}</button>)}</div>}
    </article>)}
    <div className="admin-actions">
      <button disabled={busy || offset === 0} onClick={() => { setOffset(Math.max(0, offset - 100)); setPending(null); }}>Previous</button>
      <button disabled={busy || !reports || reports.length < 100} onClick={() => { setOffset(offset + 100); setPending(null); }}>Next</button>
    </div>
  </section>;
}
