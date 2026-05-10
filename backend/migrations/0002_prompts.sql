-- Promptory backend schema, v2 — community-shared prompts.
--
-- Pipeline: extension client opts in → scrubs PII client-side → POSTs to
-- /v1/prompts → row inserted with status='pending'. A second server-side
-- scrub still runs (defense in depth). Manual moderation flips status to
-- 'approved' before any prompt is exposed publicly.

CREATE TABLE shared_prompts (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id       TEXT NOT NULL,             -- stable per-install UUID (matches GA client_id)
  captured_at     INTEGER NOT NULL,          -- ms since epoch on the user's clock
  platform        TEXT NOT NULL,             -- 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | 'copilot'
  prompt_text     TEXT NOT NULL,             -- already client-scrubbed
  response_text   TEXT NOT NULL,             -- already client-scrubbed
  thread_id       TEXT,
  is_regenerated  INTEGER NOT NULL DEFAULT 0,
  pii_detected    INTEGER NOT NULL DEFAULT 0, -- did the client-side scrubber find anything?
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  user_agent      TEXT,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_shared_prompts_status ON shared_prompts (status, created_at DESC);
CREATE INDEX idx_shared_prompts_client ON shared_prompts (client_id, captured_at DESC);
CREATE INDEX idx_shared_prompts_platform ON shared_prompts (platform, created_at DESC);
