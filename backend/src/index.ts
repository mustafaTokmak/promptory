import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bodyLimit } from 'hono/body-limit';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './types';
import feedback from './routes/feedback';
import conversion from './routes/conversion';

const app = new Hono<{ Bindings: Env }>();

app.use('*', logger());
app.use('*', secureHeaders());

// CORS — only our website and the published extension can call this from a
// browser context. Direct curl calls aren't blocked here (CORS is a browser
// thing); rate limit + zod validation are the actual abuse defenses.
app.use('/v1/*', (c, next) => {
  const allowed = [c.env.ALLOWED_ORIGIN_SITE, c.env.ALLOWED_ORIGIN_EXTENSION];
  return cors({
    origin: allowed,
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    maxAge: 86400,
  })(c, next);
});

// Cap any incoming body at 8 KB. Feedback messages are tiny and the
// conversion endpoint takes ~300 bytes; nothing legitimate needs more.
app.use('/v1/*', bodyLimit({ maxSize: 8 * 1024 }));

// Health check — used by uptime monitors and for the "is the API alive" smoke test.
app.get('/', (c) =>
  c.json({ service: 'promptory-api', version: 1, status: 'ok' }),
);

app.route('/v1/feedback', feedback);
app.route('/v1/conversion', conversion);

// Default 404 — keeps the surface area predictable.
app.notFound((c) => c.json({ error: 'not_found' }, 404));

// Error handler: never leak stack traces to clients.
app.onError((err, c) => {
  console.error('[promptory-api] unhandled error', err);
  return c.json({ error: 'internal' }, 500);
});

export default app;
