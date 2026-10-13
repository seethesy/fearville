export function successfulMainCI(run, jobs, repository, sha) {
  return (
    run.event === 'push' &&
    run.head_branch === 'main' &&
    run.head_sha === sha &&
    run.head_repository?.full_name === repository &&
    run.conclusion === 'success' &&
    ['check', 'integration'].every((name) =>
      jobs.some((job) => job.name === name && job.conclusion === 'success'),
    )
  );
}
export function productionCandidate(health, sha, ready) {
  return (
    ready === 'true' &&
    health.ok === true &&
    health.environment === 'staging' &&
    health.build === sha &&
    health.d1 === 'ok' &&
    health.durableObject === 'ok'
  );
}
