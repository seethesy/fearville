export const ADMIN_SESSION_MS = 60 * 60 * 1000;
// Exact ASCII address matching. No plus aliases, Unicode folding or dot removal.
export function allowlisted(email: string, allowlist: string) {
  const entries = allowlist
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return (
    entries.length === 1 &&
    /^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(email.toLowerCase()) &&
    entries[0] === email.toLowerCase()
  );
}
export function adminSessionValid(
  input: {
    role: string;
    googleEmail: string | null;
    provider: string | null;
    verifiedEmail: string | null;
    issued: number;
    expires: number;
  },
  allowlist: string,
  now: number,
) {
  return (
    input.role === 'admin' &&
    input.provider === 'google' &&
    !!input.googleEmail &&
    input.googleEmail === input.verifiedEmail &&
    allowlisted(input.googleEmail, allowlist) &&
    input.issued > 0 &&
    input.issued <= now &&
    input.expires > now &&
    input.issued + ADMIN_SESSION_MS > now
  );
}
