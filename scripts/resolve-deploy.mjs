import { readFileSync, appendFileSync } from 'node:fs';
import { successfulMainCI, productionCandidate } from './deployment-policy.mjs';
const repository = process.env.GITHUB_REPOSITORY;
const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const token = process.env.GH_TOKEN;
if (!repository || !token) throw Error('GitHub CI context is required.');
async function github(path) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(20000),
    },
  );
  if (!response.ok)
    throw Error(
      `GitHub deployment validation failed: HTTP ${response.status}.`,
    );
  return response.json();
}
const main = (await github('git/ref/heads/main')).object.sha;
const automatic = process.env.GITHUB_EVENT_NAME === 'workflow_run';
const environment = automatic
  ? 'staging'
  : (event.inputs?.environment ?? 'staging');
const sha = automatic
  ? event.workflow_run?.head_sha
  : event.inputs?.sha?.trim() || main;
if (
  !['staging', 'production'].includes(environment) ||
  !/^[a-f0-9]{40}$/.test(sha ?? '')
)
  throw Error('Invalid deployment inputs.');
if (
  automatic &&
  (event.workflow_run.head_branch !== 'main' ||
    event.workflow_run.event !== 'push' ||
    event.workflow_run.head_repository?.full_name !== repository ||
    event.workflow_run.conclusion !== 'success' ||
    sha !== main)
) {
  console.log('Skipped non-main, unsuccessful or superseded CI run.');
  appendFileSync(process.env.GITHUB_OUTPUT, 'sha=\n');
} else {
  const comparison = await github(`compare/${sha}...${main}`);
  if (!['identical', 'ahead'].includes(comparison.status))
    throw Error('The requested commit is not in main history.');
  const runs = (
    await github(
      `actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&status=completed&per_page=20`,
    )
  ).workflow_runs;
  let validated = false;
  for (const run of runs.filter((run) => run.conclusion === 'success')) {
    const jobs = (
      await github(`actions/runs/${run.id}/jobs?per_page=100&filter=latest`)
    ).jobs;
    if (successfulMainCI(run, jobs, repository, sha)) {
      validated = true;
      break;
    }
  }
  if (!validated)
    throw Error(
      'The exact main commit must have successful check and integration jobs.',
    );
  if (environment === 'production') {
    const response = await fetch('https://staging.fearville.app/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const health = await response.json();
    if (
      !response.ok ||
      !productionCandidate(health, sha, process.env.PRODUCTION_CUTOVER_READY)
    )
      throw Error(
        'Production requires FEAR-92 cutover readiness and this exact healthy staging SHA.',
      );
  }
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `sha=${sha}\nenvironment=${environment}\n`,
  );
  console.log(`Validated ${environment} deployment of ${sha}.`);
}
