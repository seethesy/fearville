// node:test reporter that prints failures and a one-line summary only.
// Used by `npm run test:unit`. Keeps agent and CI output small.
import path from 'node:path';

export default async function* quietReporter(source) {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const started = Date.now();
  const failures = [];
  for await (const event of source) {
    const data = event.data;
    if (event.type === 'test:pass' && data.details?.type !== 'suite') {
      if (data.skip || data.todo) skipped++;
      else passed++;
    } else if (event.type === 'test:fail' && data.details?.type !== 'suite') {
      failed++;
      const error = data.details?.error;
      const cause = error?.cause ?? error;
      const where = data.file
        ? path.relative(process.cwd(), data.file.replace(/^file:\/\//, ''))
        : '';
      const message = String(
        cause?.stack ?? cause?.message ?? cause ?? 'failed',
      )
        .split('\n')
        .slice(0, 30)
        .join('\n');
      failures.push(
        `FAIL ${data.name}${where ? ` (${where})` : ''}\n${message}\n`,
      );
    } else if (
      event.type === 'test:diagnostic' &&
      /^(Error|SyntaxError)/.test(data.message)
    ) {
      failures.push(`${data.message}\n`);
    }
  }
  for (const failure of failures) yield failure + '\n';
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  yield `unit: ${passed} passed, ${failed} failed${skipped ? `, ${skipped} skipped` : ''} (${seconds}s)\n`;
}
