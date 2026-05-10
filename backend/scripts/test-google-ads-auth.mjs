#!/usr/bin/env node
/**
 * Read-only Google Ads API auth check.
 *
 * Exercises every piece of the credential chain *without* uploading a
 * conversion (which would require a real gclid from a real ad click):
 *
 *   refresh_token ─→ access_token             (validates OAuth client)
 *   access_token + dev_token ─→ Ads API       (validates dev token approval)
 *   login-customer-id + customer-id           (validates MCC→client link)
 *   GET conversion_action by ID               (validates action exists + is type=UPLOAD_CLICKS)
 *
 * Run from backend/:    node scripts/test-google-ads-auth.mjs
 * Reads secrets from:   ./.dev.vars
 *
 * The script does NOT modify any state on Google Ads' side.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '..', '.dev.vars');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const ok = (msg) => console.log(`${GREEN}✓${RESET} ${msg}`);
const fail = (msg, detail) => {
  console.log(`${RED}✗${RESET} ${BOLD}${msg}${RESET}`);
  if (detail) console.log(`  ${DIM}${detail}${RESET}`);
  process.exit(1);
};
const info = (msg) => console.log(`${DIM}  ${msg}${RESET}`);
const warn = (msg) => console.log(`${YELLOW}⚠${RESET} ${msg}`);

/** Parse a tiny KEY="value" file. No interpolation. Comments start with #. */
function parseDotenv(text) {
  const result = {};
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

/** First 6 chars of a string, rest replaced with dots. For safe logging. */
const mask = (s) => (s ? `${s.slice(0, 6)}…(${s.length} chars)` : '<empty>');

const env = (() => {
  try {
    return parseDotenv(readFileSync(ENV_PATH, 'utf8'));
  } catch (err) {
    fail(`Cannot read ${ENV_PATH}`, err.message);
  }
})();

const required = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
  'GOOGLE_ADS_CUSTOMER_ID',
  'GOOGLE_ADS_CONVERSION_ACTION_ID',
];
const missing = required.filter((k) => !env[k]);
if (missing.length) {
  fail(
    `Missing ${missing.length} required value(s) in .dev.vars`,
    missing.join(', '),
  );
}
ok('All 7 required secrets present in .dev.vars');
info(`developer_token:    ${mask(env.GOOGLE_ADS_DEVELOPER_TOKEN)}`);
info(`client_id:          ${mask(env.GOOGLE_ADS_CLIENT_ID)}`);
info(`refresh_token:      ${mask(env.GOOGLE_ADS_REFRESH_TOKEN)}`);
info(`login_customer_id:  ${env.GOOGLE_ADS_LOGIN_CUSTOMER_ID}`);
info(`customer_id:        ${env.GOOGLE_ADS_CUSTOMER_ID}`);
info(`conversion_action:  ${env.GOOGLE_ADS_CONVERSION_ACTION_ID}`);

// ── 1. Exchange refresh token for access token ───────────────────────────
console.log('');
console.log(`${BOLD}Step 1${RESET} — Exchange refresh token for access token`);
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID,
    client_secret: env.GOOGLE_ADS_CLIENT_SECRET,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  }).toString(),
});

const tokenBody = await tokenRes.text();
if (!tokenRes.ok) {
  let parsed;
  try {
    parsed = JSON.parse(tokenBody);
  } catch {
    parsed = { raw: tokenBody };
  }
  const errorHint =
    parsed.error === 'invalid_client'
      ? 'client_id or client_secret is wrong'
      : parsed.error === 'invalid_grant'
      ? 'refresh_token is wrong, revoked, or expired (Test mode = 7 day TTL)'
      : 'see error response below';
  fail(`OAuth refresh failed (HTTP ${tokenRes.status}) — ${errorHint}`, JSON.stringify(parsed, null, 2));
}

const { access_token, expires_in } = JSON.parse(tokenBody);
if (!access_token) fail('OAuth response missing access_token', tokenBody);
ok(`OAuth refresh succeeded (access_token TTL: ${expires_in}s)`);

// ── 1.5. List accessible customers ───────────────────────────────────────
// listAccessibleCustomers doesn't take a customer-id in the path or header,
// so it's a clean way to see what the OAuth token can reach. Useful for
// diagnosing CUSTOMER_NOT_FOUND when the configured customer-id is wrong
// or when an MCC→sub-account link hasn't been accepted.
console.log('');
console.log(`${BOLD}Step 1.5${RESET} — Discover accessible customers`);

const listRes = await fetch(
  'https://googleads.googleapis.com/v20/customers:listAccessibleCustomers',
  {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
    },
  },
);
const listText = await listRes.text();
if (!listRes.ok) {
  fail(`listAccessibleCustomers failed (HTTP ${listRes.status})`, listText);
}
const listData = JSON.parse(listText);
const accessibleIds = (listData.resourceNames || []).map((n) =>
  n.replace('customers/', ''),
);
if (accessibleIds.length === 0) {
  fail(
    'OAuth token has no accessible customers',
    'The Google account you authorized with has no Google Ads account access. Check you signed in as the right user.',
  );
}
ok(`OAuth token can access ${accessibleIds.length} customer(s):`);
for (const id of accessibleIds) info(`  • ${id}`);

const expectedLogin = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
const expectedCustomer = env.GOOGLE_ADS_CUSTOMER_ID;
if (!accessibleIds.includes(expectedLogin)) {
  fail(
    `Configured GOOGLE_ADS_LOGIN_CUSTOMER_ID (${expectedLogin}) is NOT in the accessible list.`,
    `The OAuth token can access [${accessibleIds.join(', ')}] but not ${expectedLogin}. Either you authorized with the wrong Google account, or the manager ID is wrong.`,
  );
}
ok(`Login (manager) ID ${expectedLogin} is accessible`);

// ── 2. Find which customer owns the conversion action ───────────────────
// Searches every accessible customer in parallel. The conversion action
// can only live in one of them. Surfaces the correct GOOGLE_ADS_CUSTOMER_ID
// value to use even when the user has the wrong one configured.
console.log('');
console.log(`${BOLD}Step 2${RESET} — Search all accessible customers for conversion action ${env.GOOGLE_ADS_CONVERSION_ACTION_ID}`);

const conversionActionId = env.GOOGLE_ADS_CONVERSION_ACTION_ID;
const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;

const query = `
  SELECT
    conversion_action.id,
    conversion_action.name,
    conversion_action.type,
    conversion_action.status,
    conversion_action.category
  FROM conversion_action
  WHERE conversion_action.id = ${conversionActionId}
`;

async function searchCustomer(custId) {
  const res = await fetch(
    `https://googleads.googleapis.com/v20/customers/${custId}/googleAds:search`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN,
        'login-customer-id': loginCustomerId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  return { custId, status: res.status, ok: res.ok, body: text };
}

const results = await Promise.all(accessibleIds.map(searchCustomer));

let foundCustomer = null;
let foundAction = null;
for (const r of results) {
  if (!r.ok) {
    info(`  ${r.custId} → HTTP ${r.status}`);
    continue;
  }
  const data = JSON.parse(r.body);
  const rows = data.results || [];
  if (rows.length > 0) {
    foundCustomer = r.custId;
    foundAction = rows[0].conversionAction;
    info(`  ${r.custId} → FOUND ✓`);
  } else {
    info(`  ${r.custId} → no match`);
  }
}

if (!foundCustomer) {
  fail(
    `Conversion action ${conversionActionId} not found in any accessible customer`,
    'Either the conversion action ID is wrong, or it lives in an account this OAuth token can\'t reach.',
  );
}

ok(`Conversion action found: "${foundAction.name}" (id ${foundAction.id})`);
info(`owned by customer: ${foundCustomer}`);
info(`type:     ${foundAction.type}`);
info(`status:   ${foundAction.status}`);
info(`category: ${foundAction.category}`);

if (foundCustomer !== env.GOOGLE_ADS_CUSTOMER_ID) {
  warn(
    `Your .dev.vars has GOOGLE_ADS_CUSTOMER_ID="${env.GOOGLE_ADS_CUSTOMER_ID}" but the action actually lives in "${foundCustomer}". Update .dev.vars before deploying.`,
  );
}

const action = foundAction;

// ── 3. Sanity checks on the action's configuration ───────────────────────
console.log('');
console.log(`${BOLD}Step 3${RESET} — Sanity-check conversion action configuration`);

if (action.status !== 'ENABLED') {
  warn(
    `Conversion action status is "${action.status}" (not ENABLED). Conversions will be silently dropped by Google. Re-enable it in the Google Ads UI before launching the campaign.`,
  );
} else {
  ok('Status: ENABLED');
}

// Type must be one that accepts uploaded clicks. The relevant types:
//   UPLOAD_CLICKS   — what we want
//   WEBPAGE         — page-load conversions (uses gtag, not API)
//   etc.
const uploadOk = action.type === 'UPLOAD_CLICKS';
if (!uploadOk) {
  warn(
    `Conversion action type is "${action.type}". For server-side uploads via gclid, you need type UPLOAD_CLICKS. Other types (e.g. WEBPAGE) require gtag.js on the landing page and will reject API uploads. Reconfigure the conversion action's source as "Import → Clicks" if you want server-side uploads.`,
  );
} else {
  ok('Type: UPLOAD_CLICKS (correct for server-side gclid uploads)');
}

// ── Done ─────────────────────────────────────────────────────────────────
console.log('');
if (action.status === 'ENABLED' && uploadOk) {
  console.log(`${GREEN}${BOLD}All credentials valid. Conversion uploads should work for real gclids.${RESET}`);
  process.exit(0);
} else {
  console.log(
    `${YELLOW}${BOLD}Credentials valid, but conversion action needs reconfiguration before going live.${RESET}`,
  );
  process.exit(2);
}
