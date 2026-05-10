import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';
import { rateLimit } from '../middleware';

/**
 * /v1/prompts — community-shared prompt submissions from opted-in users.
 *
 * The client is expected to scrub PII before POSTing. We trust nothing —
 * the server runs its own scrub on insert and stores the result; the
 * `pii_detected` flag the client sends is informational only (lets us
 * later detect "this client is leaking lots of PII" patterns).
 *
 * status='pending' on insert. A separate moderation step (manual via D1
 * console for now, automated later) flips approved rows live.
 */

const PLATFORMS = [
  'chatgpt',
  'claude',
  'gemini',
  'perplexity',
  'grok',
  'copilot',
] as const;

const PromptSubmissionSchema = z.object({
  client_id: z.string().uuid(),
  captured_at: z.number().int().positive(),
  platform: z.enum(PLATFORMS),
  prompt_text: z.string().min(1).max(20000),
  response_text: z.string().max(50000),
  thread_id: z.string().max(200).optional(),
  is_regenerated: z.boolean().optional(),
  pii_detected: z.boolean().optional(),
});

/**
 * Server-side PII scrubber — defense in depth. Even if the client is buggy
 * or compromised, the server replaces detected patterns before persisting.
 * Patterns mirror the client-side scrubber in lib/pii.ts.
 */
const SERVER_PII_PATTERNS: { regex: RegExp; replacement: string }[] = [
  { regex: /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g, replacement: '[email]' },
  { regex: /\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b/g, replacement: '[card]' },
  { regex: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g, replacement: '[ssn]' },
  { regex: /(\+?\d[\d\s\-().]{7,}\d)/g, replacement: '[phone]' },
  { regex: /https?:\/\/\S+[?&](token|key|auth|secret|api_key)=[^\s&"']+/gi, replacement: '[redacted-url]' },
];

function serverScrub(text: string): { clean: string; foundPii: boolean } {
  let clean = text;
  let foundPii = false;
  for (const { regex, replacement } of SERVER_PII_PATTERNS) {
    if (regex.test(clean)) {
      foundPii = true;
      clean = clean.replace(regex, replacement);
    }
  }
  return { clean, foundPii };
}

const router = new Hono<{ Bindings: Env }>();

router.post(
  '/',
  bodyLimit({ maxSize: 80 * 1024 }),
  // 100 submissions per minute per IP. Power users sending 2/sec hit it,
  // bots sending floods get blocked. Tunable via wrangler if it's wrong.
  rateLimit({ max: 100 }),
  zValidator('json', PromptSubmissionSchema),
  async (c) => {
    const body = c.req.valid('json');
    const userAgent = c.req.header('user-agent')?.slice(0, 200) ?? null;

    const promptScrub = serverScrub(body.prompt_text);
    const responseScrub = serverScrub(body.response_text);
    const piiDetected =
      body.pii_detected === true || promptScrub.foundPii || responseScrub.foundPii;

    await c.env.DB.prepare(
      `INSERT INTO shared_prompts (
         client_id, captured_at, platform,
         prompt_text, response_text, thread_id,
         is_regenerated, pii_detected, status,
         user_agent, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
      .bind(
        body.client_id,
        body.captured_at,
        body.platform,
        promptScrub.clean,
        responseScrub.clean,
        body.thread_id ?? null,
        body.is_regenerated ? 1 : 0,
        piiDetected ? 1 : 0,
        userAgent,
        Date.now(),
      )
      .run();

    return c.json({ ok: true });
  },
);

// --- Batch endpoint -------------------------------------------------------
//
// Background SW flush sends queued prompts in groups of up to 10 per POST
// to amortize round-trip cost and keep network use efficient on retry
// after outages. One client_id per batch (per-install) — the flush always
// drains a single user's queue at a time.

const BatchItemSchema = PromptSubmissionSchema.omit({ client_id: true });

const PromptBatchSchema = z.object({
  client_id: z.string().uuid(),
  prompts: z.array(BatchItemSchema).min(1).max(10),
});

router.post(
  '/batch',
  // Up to 10 prompts × 70KB each + envelope.
  bodyLimit({ maxSize: 1024 * 1024 }),
  // 30 batches/min/IP. With max 10 prompts per batch that's 300 prompts/min
  // — generous for a power user, quickly noticeable for an abuser.
  rateLimit({ max: 30 }),
  zValidator('json', PromptBatchSchema),
  async (c) => {
    const { client_id, prompts } = c.req.valid('json');
    const userAgent = c.req.header('user-agent')?.slice(0, 200) ?? null;
    const now = Date.now();

    const stmt = c.env.DB.prepare(
      `INSERT INTO shared_prompts (
         client_id, captured_at, platform,
         prompt_text, response_text, thread_id,
         is_regenerated, pii_detected, status,
         user_agent, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    );

    const batch = prompts.map((p) => {
      const promptScrub = serverScrub(p.prompt_text);
      const responseScrub = serverScrub(p.response_text);
      const piiDetected =
        p.pii_detected === true || promptScrub.foundPii || responseScrub.foundPii;

      return stmt.bind(
        client_id,
        p.captured_at,
        p.platform,
        promptScrub.clean,
        responseScrub.clean,
        p.thread_id ?? null,
        p.is_regenerated ? 1 : 0,
        piiDetected ? 1 : 0,
        userAgent,
        now,
      );
    });

    await c.env.DB.batch(batch);

    return c.json({ ok: true, accepted: prompts.length });
  },
);

export default router;
