/**
 * Cloudflare Worker bindings — wired up via wrangler.toml.
 */
export type Env = {
  // Bindings
  DB: D1Database;
  RATE_LIMIT: KVNamespace;

  // Vars (non-secret, set in wrangler.toml [vars])
  ALLOWED_ORIGIN_SITE: string;
  ALLOWED_ORIGIN_EXTENSION: string;

  // Secrets (set via `wrangler secret put`)
  GOOGLE_ADS_DEVELOPER_TOKEN?: string;
  GOOGLE_ADS_REFRESH_TOKEN?: string;
  GOOGLE_ADS_CLIENT_ID?: string;
  GOOGLE_ADS_CLIENT_SECRET?: string;
  GOOGLE_ADS_CUSTOMER_ID?: string;
  GOOGLE_ADS_CONVERSION_ACTION_ID?: string;
};
