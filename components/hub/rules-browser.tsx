'use client';
import { useState } from 'react';
import { RulesReference, RoleTeams } from '@/components/rules-reference';
import { SCRIPTS, type RoleScript } from '@/lib/game/types';
export function RulesBrowser({ rolesOnly = false }: { rolesOnly?: boolean }) {
  const [script, setScript] = useState<RoleScript>('horrors');
  return (
    <div className="rules-browser">
      <fieldset className="script-tabs" aria-label="Choose a script">
        {Object.entries(SCRIPTS).map(([id, name]) => (
          <button
            key={id}
            className={script === id ? 'primary' : 'secondary'}
            aria-pressed={script === id}
            onClick={() => setScript(id as RoleScript)}
          >
            {name}
          </button>
        ))}
      </fieldset>
      {rolesOnly ? (
        <RoleTeams script={script} />
      ) : (
        <RulesReference key={script} script={script} />
      )}
    </div>
  );
}
