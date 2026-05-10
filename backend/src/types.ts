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
  // Manager (MCC) account ID — sent as `login-customer-id` header. The
  // dev token is issued to this account; API calls authenticate as it.
  GOOGLE_ADS_LOGIN_CUSTOMER_ID?: string;
  // Client (advertiser) account ID — the account that actually owns the
  // conversion action and where the conversion lands. Used in the URL.
  GOOGLE_ADS_CUSTOMER_ID?: string;
  GOOGLE_ADS_CONVERSION_ACTION_ID?: string;
  // When "true", Google Ads API runs the request through validation but
  // doesn't actually record a conversion. Use during integration tests
  // against the real API so we don't pollute real conversion data.
  GOOGLE_ADS_VALIDATE_ONLY?: string;
};
