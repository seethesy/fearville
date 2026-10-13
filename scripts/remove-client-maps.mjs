import { readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist/client');
for (const file of readdirSync(root, { recursive: true })) {
  const resolved = path.resolve(root, file);
  if (resolved.startsWith(root + path.sep) && file.endsWith('.map'))
    unlinkSync(resolved);
}
console.log('Client source maps removed after private upload.');
