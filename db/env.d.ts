declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    ENVIRONMENT_PROBE?: DurableObjectNamespace;
  }
}
