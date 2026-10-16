'use client';
import { useMemo, useState } from 'react';
import { UiText, useTextEditor } from '@/components/ui-text';
import { UI_TEXT, textGroup } from '@/lib/ui-text/registry';

// FEAR-173: every editable key, grouped and searchable, for the admin console.
export function TextCatalog() {
  const { drafts, overrides } = useTextEditor();
  const [query, setQuery] = useState('');
  const [only, setOnly] = useState<'all' | 'drafts' | 'edited'>('all');
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const map = new Map<string, string[]>();
    for (const [key, value] of Object.entries(UI_TEXT)) {
      if (only === 'drafts' && !drafts[key]) continue;
      if (only === 'edited' && !overrides[key]) continue;
      if (
        q &&
        !key.toLowerCase().includes(q) &&
        !(overrides[key]?.value ?? value).toLowerCase().includes(q)
      )
        continue;
      const g = textGroup(key);
      map.set(g, [...(map.get(g) ?? []), key]);
    }
    return [...map];
  }, [query, only, drafts, overrides]);
  const shown = groups.reduce((n, [, keys]) => n + keys.length, 0);
  return (
    <>
      <div className="admin-filters">
        <label>
          Search text
          <input
            type="search"
            value={query}
            placeholder="Words or key, e.g. glossary.fear"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          Show
          <select
            value={only}
            onChange={(e) => setOnly(e.target.value as typeof only)}
          >
            <option value="all">Everything</option>
            <option value="drafts">Unpublished drafts</option>
            <option value="edited">Edited (not default)</option>
          </select>
        </label>
      </div>
      <p className="hint">{shown} texts</p>
      {groups.map(([group, keys]) => (
        <details className="panel" key={group} open={!!query || only !== 'all'}>
          <summary>
            {group} ({keys.length})
          </summary>
          {keys.slice(0, 300).map((key) => (
            <div className="admin-text-row" key={key}>
              <small>
                {key}
                {drafts[key] ? ' · draft' : ''}
              </small>
              <div>
                <UiText id={key} values={{ count: 8 }} />
              </div>
            </div>
          ))}
          {keys.length > 300 && (
            <p className="hint">
              Showing 300 of {keys.length}. Search to narrow.
            </p>
          )}
        </details>
      ))}
    </>
  );
}
