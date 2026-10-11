/* oxlint-disable next/no-img-element -- Inline SVG data URI, nothing to optimise. */
import {
  DIAGRAM_ALT,
  RITE_DIAGRAMS,
  type RiteDiagram,
} from '@/lib/tutorials/diagrams';
import { tutorial } from '@/lib/tutorials/content';

// A Night Rite guide drawing. The markup is static and authored in
// lib/tutorials/diagrams.ts (shared with the iPhone asset catalog).
export function RiteDiagramArt({ name }: { name: RiteDiagram }) {
  return (
    <div className="rite-diagram">
      <img
        src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(RITE_DIAGRAMS[name])}`}
        alt={DIAGRAM_ALT[name]}
        width={320}
        height={160}
      />
    </div>
  );
}

// Night Rite guides for the Rules section: the player's own pattern, every
// pattern for the Storyteller, or every pattern in the standalone reference.
export function RiteGuides({ patterns }: { patterns: string[] }) {
  const guides = patterns.map((p) => tutorial(`guide.${p}`)).filter((t) => !!t);
  if (!guides.length) return null;
  return (
    <div className="rite-guides">
      {guides.map((g) => (
        <article key={g.id} className="rite-guide">
          <h3>{g.title}</h3>
          <p className="rite-guide-summary">{g.summary}</p>
          <ol>
            {g.steps
              .filter((s) => !s.platforms || s.platforms.includes('web'))
              .map((s) => (
                <li key={s.title}>
                  {s.diagram && <RiteDiagramArt name={s.diagram} />}
                  <h4>{s.title}</h4>
                  <p>{s.body}</p>
                </li>
              ))}
          </ol>
        </article>
      ))}
    </div>
  );
}
