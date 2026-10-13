// Writes www/site.js so the bundled error page knows which site to retry.
// Uses the same FEARVILLE_URL as capacitor.config.ts.
import { writeFileSync } from 'node:fs';

const site = new URL(
  process.env.FEARVILLE_URL ?? 'https://staging.fearville.app',
).origin;
writeFileSync(
  new URL('../www/site.js', import.meta.url),
  `// Written by scripts/write-site.mjs. Do not edit.\nwindow.FEARVILLE_SITE = ${JSON.stringify(site + '/')};\n`,
);
console.log(`www/site.js -> ${site}/`);
