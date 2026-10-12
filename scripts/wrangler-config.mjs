import { readFileSync } from 'node:fs';
import ts from 'typescript';
export function readConfig(file = 'wrangler.jsonc') {
  const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, 'utf8'));
  if (parsed.error) throw new Error('Invalid Wrangler JSONC configuration.');
  return parsed.config;
}
