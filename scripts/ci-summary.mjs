import { appendFileSync, existsSync, readFileSync } from 'node:fs';
const file = process.argv[2];
const lines = existsSync(file) ? readFileSync(file, 'utf8').replace(/\u001b\[[0-9;]*m/g, '').split(/\r?\n/) : ['Dependency installation or setup failed before the test runner.'];
const failures = lines.filter((line) => /^(FAIL |\w+: FAILED)/.test(line));
const first = lines.findIndex((line) => /^(FAIL |\w+: FAILED)/.test(line));
const summary = [`### ${file} failed`, ...failures.slice(0, 8).map((line) => `- ${line}`), '```text', ...lines.slice(Math.max(0, first), Math.max(0, first) + Math.min(30, 35 - Math.min(8, failures.length))), '```', 'Full logs are attached as an artifact.'];
appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary.join('\n') + '\n');
