declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    // Production only: staging's database, for remote switches (FEAR-122).
    STAGING_DB?: D1Database;
    ENVIRONMENT_PROBE?: DurableObjectNamespace;
  }
}
