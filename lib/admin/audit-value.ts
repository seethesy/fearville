// Audit operational changes without duplicating hidden game information.
const PRIVATE_KEYS = new Set(['role', 'shown', 'notes', 'notebook', 'notebooks', 'nightChoices', 'nightChoiceTasks', 'nightIntroductions', 'acts', 'token', 'accountToken', 'credentialHash', 'sessionHash', 'confirmation']);
export function auditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(auditValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEYS.has(key)).map(([key, child]) => [key, auditValue(child)]));
  return value;
}
