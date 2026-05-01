import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';
import { rateLimit, sha256 } from '../middleware';

/**
 * `gclid` shape: opaque alphanumeric + a few special chars, ≤200 chars.
 * Validating the format here prevents the conversions table from filling with
 * arbitrary user-supplied junk.
 */
const GCLID_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;

const ConversionSchema = z.object({
  gclid: z.string().regex(GCLID_PATTERN, 'invalid gclid format'),
  conversionTime: z.string().datetime().optional(),
});

const router = new Hono<{ Bindings: Env }>();

router.post(
  '/',
  rateLimit({ max: 10 }),
  zValidator('json', ConversionSchema),
  async (c) => {
    const { gclid, conversionTime } = c.req.valid('json');
    const gclidHash = await sha256(gclid);
    const conversionAt = conversionTime ? Date.parse(conversionTime) : Date.now();

    // Insert-or-ignore so a re-submission with the same gclid doesn't
    // create duplicate rows. The unique index on gclid_hash enforces this.
    const result = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO conversions (gclid_hash, conversion_at, status, created_at)
       VALUES (?, ?, 'pending', ?)`,
    )
      .bind(gclidHash, conversionAt, Date.now())
      .run();

    // If the row was new, kick off the upload to Google Ads.
    // We use waitUntil so the user gets a fast 200 even though the upload
    // hasn't happened yet.
    if (result.meta.changes && result.meta.changes > 0) {
      c.executionCtx.waitUntil(uploadConversion(c.env, gclid, gclidHash, conversionAt));
    }

    return c.json({ ok: true, deduped: !result.meta.changes });
  },
);

/**
 * Upload a single click conversion to the Google Ads API.
 *
 * Stub: the actual API call is gated behind the developer token application.
 * Once the token is approved and secrets are set, the request body below is
 * what we'll POST to ConversionUploadService.UploadClickConversions.
 */
async function uploadConversion(
  env: Env,
  gclid: string,
  gclidHash: string,
  conversionAt: number,
): Promise<void> {
  const required: Array<keyof Env> = [
    'GOOGLE_ADS_DEVELOPER_TOKEN',
    'GOOGLE_ADS_REFRESH_TOKEN',
    'GOOGLE_ADS_CLIENT_ID',
    'GOOGLE_ADS_CLIENT_SECRET',
    'GOOGLE_ADS_CUSTOMER_ID',
    'GOOGLE_ADS_CONVERSION_ACTION_ID',
  ];
  const missing = required.filter((k) => !env[k]);
  if (missing.length > 0) {
    // Token not approved yet; mark as pending so we can backfill later.
    console.log('[conversion] secrets missing, deferring upload:', missing.join(','));
    return;
  }

  try {
    const accessToken = await fetchAccessToken(env);
    const conversionDate = formatGoogleAdsDate(conversionAt);

    const res = await fetch(
      `https://googleads.googleapis.com/v17/customers/${env.GOOGLE_ADS_CUSTOMER_ID}:uploadClickConversions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'developer-token': env.GOOGLE_ADS_DEVELOPER_TOKEN!,
          'login-customer-id': env.GOOGLE_ADS_CUSTOMER_ID!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          conversions: [
            {
              gclid,
              conversionAction: `customers/${env.GOOGLE_ADS_CUSTOMER_ID}/conversionActions/${env.GOOGLE_ADS_CONVERSION_ACTION_ID}`,
              conversionDateTime: conversionDate,
              conversionValue: 0.0,
              currencyCode: 'USD',
            },
          ],
          partialFailure: true,
          validateOnly: false,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      await env.DB.prepare(
        `UPDATE conversions SET status='failed', error_message=? WHERE gclid_hash=?`,
      )
        .bind(text.slice(0, 500), gclidHash)
        .run();
      return;
    }

    await env.DB.prepare(
      `UPDATE conversions SET status='uploaded', uploaded_at=? WHERE gclid_hash=?`,
    )
      .bind(Date.now(), gclidHash)
      .run();
  } catch (err) {
    await env.DB.prepare(
      `UPDATE conversions SET status='failed', error_message=? WHERE gclid_hash=?`,
    )
      .bind(String(err).slice(0, 500), gclidHash)
      .run();
  }
}

/**
 * Exchange a refresh token for a fresh access token.
 * Google access tokens last ~1 hour. For now we re-mint each time;
 * once volume picks up we can cache in KV until expiry.
 */
async function fetchAccessToken(env: Env): Promise<string> {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
    refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`OAuth refresh failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

/** Google Ads expects "yyyy-MM-dd HH:mm:ss±HH:mm". UTC keeps it simple. */
function formatGoogleAdsDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  );
}

export default router;
