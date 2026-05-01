import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { Env } from '../types';
import { rateLimit } from '../middleware';

const FeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  message: z.string().max(2000).optional(),
  version: z.string().max(20).optional(),
  source: z.enum(['sidepanel', 'dashboard']).optional(),
});

const router = new Hono<{ Bindings: Env }>();

router.post(
  '/',
  rateLimit({ max: 10 }),
  zValidator('json', FeedbackSchema),
  async (c) => {
    const { rating, message, version, source } = c.req.valid('json');
    const userAgent = c.req.header('user-agent')?.slice(0, 200) ?? null;

    await c.env.DB.prepare(
      `INSERT INTO feedback (rating, message, version, source, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        rating,
        message ?? null,
        version ?? null,
        source ?? null,
        userAgent,
        Date.now(),
      )
      .run();

    return c.json({ ok: true });
  },
);

export default router;
