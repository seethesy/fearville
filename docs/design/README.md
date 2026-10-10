# Night Rite references

The four PNG files and `night-rite-v2-design.md` were supplied by Sean. They are preserved as design references. The SVG companions were recreated from the implementation's own vector artwork; they are **not the original vector sources** for those PNGs.

`scripts/rite-design-assets.tsx` recreates the companions. From the repository root:

```powershell
node -e "import('esbuild').then(e=>e.build({entryPoints:['scripts/rite-design-assets.tsx'],outfile:'work/rite-design-assets.mjs',bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'}))"
node work/rite-design-assets.mjs
```

FEAR-10 and its child stories take precedence over the older draft. The agreed defaults are 2–4 players per vigil, uniform assignment without an Evil cap, a 30-second lock and a 60-second window, Divination attempts from night 3, rewards for all alignments, polling at approximately 300 ms, and no night-8 hard cap or hint dealing.

The scalable art is implemented in `components/rite/art.tsx` and `ios/Fearville/NightRite.swift`. The web screens use the references' dark green / purple surfaces, gold borders and serif headings. Controls and informational copy remain live UI rather than rasterized mockups.
