import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './types';
import feedback from './routes/feedback';
import conversion from './routes/conversion';
import prompts from './routes/prompts';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', secureHeaders());

// CORS — our website + Chromium-based extensions (matched exactly by ID)
// + any Firefox extension origin (wildcard required because Firefox assigns
// a random per-install UUID to moz-extension:// origins as a privacy
// feature, so exact-match allowlisting is impossible).
//
// ALLOWED_ORIGIN_EXTENSION is a comma-separated list of chrome-extension://
// origins — both the published CWS build, the Edge Add-ons build, and any
// dev unpacked installs go here.
//
// Direct curl calls aren't blocked (CORS is a browser-only check); rate
// limit + zod validation are the actual abuse defenses.
app.use('/v1/*', (c, next) => {
  const extensionOrigins = c.env.ALLOWED_ORIGIN_EXTENSION.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const exactAllowed = new Set([c.env.ALLOWED_ORIGIN_SITE, ...extensionOrigins]);

  return cors({
    origin: (origin) => {
      if (!origin) return undefined;
      if (exactAllowed.has(origin)) return origin;
      // Firefox: every install has a random moz-extension://<uuid> origin.
      // Allowing the prefix is intentional — see header comment.
      if (origin.startsWith('moz-extension://')) return origin;
      return undefined;
    },
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next);
});

// Per-route body limits. Feedback messages are tiny and the conversion
// endpoint takes ~300 bytes — 8 KB is plenty. Prompts can carry the full
// AI response which streams to several pages, so the prompts route gets
// 80 KB. Anything bigger than that is almost certainly noise.
// Per-route body limits live with the route definition (in routes/*.ts) —
// Hono's app.use() does prefix matching, so a top-level limit on /v1/prompts
// would also clamp /v1/prompts/batch and break batches. Keeping the limits
// inside the routers keeps each route's cap correct.
app.use('/v1/feedback', bodyLimit({ maxSize: 8 * 1024 }));
app.use('/v1/conversion', bodyLimit({ maxSize: 8 * 1024 }));

// Health check — used by uptime monitors and for the "is the API alive" smoke test.
app.get('/', (c) =>
  c.json({ service: 'promptory-api', version: 1, status: 'ok' }),
);

app.route('/v1/feedback', feedback);
app.route('/v1/conversion', conversion);
app.route('/v1/prompts', prompts);

// Default 404 — keeps the surface area predictable.
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Error handler: never leak stack traces to clients.
app.onError((err, c) => {
  console.error('[promptory-api] unhandled error', err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
