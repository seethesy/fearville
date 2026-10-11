import { IOS_SYMBOLS, TUTORIALS } from './content.ts';
import { iosDiagramAsset } from './diagrams.ts';
import { available, stepsFor } from './engine.ts';

// The iPhone app bundles this catalog as tutorials.json, resolved for iOS
// (platform filters and iPhone wording applied). Regenerate with
// `node --experimental-strip-types scripts/generate-ios-reference.mjs`.
export function iosCatalog() {
  return {
    tutorials: TUTORIALS.filter((t) => available(t.id, 'ios')).map((t) => ({
      id: t.id,
      kind: t.kind,
      title: t.title,
      summary: t.summary,
      audience: t.audience,
      section: t.section ?? null,
      group: t.group ?? null,
      covers: t.covers ?? [],
      steps: stepsFor(t, 'ios').map((s) => ({
        title: s.title,
        body: s.body,
        symbol: s.illustration ? IOS_SYMBOLS[s.illustration] : null,
        // Night Rite guides: a vector diagram in the asset catalog.
        diagram: s.diagram ? iosDiagramAsset(s.diagram) : null,
        tab: s.ios?.tab ?? null,
      })),
    })),
  };
}
