-- Promptory backend schema, v1.

-- Feedback submissions from the in-extension review banner (when rating <5).
CREATE TABLE feedback (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  message     TEXT,
  version     TEXT,
  source      TEXT,                       -- 'sidepanel' | 'dashboard' | etc
  user_agent  TEXT,
  created_at  INTEGER NOT NULL            -- ms since epoch
);
CREATE INDEX idx_feedback_created_at ON feedback (created_at DESC);

-- Conversion uploads for Google Ads attribution.
-- gclid is hashed before storage so we never persist raw click IDs at rest.
CREATE TABLE conversions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  gclid_hash    TEXT NOT NULL,
  conversion_at INTEGER NOT NULL,         -- ms since epoch
  uploaded_at   INTEGER,                  -- null until Google API call succeeds
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'uploaded' | 'failed'
  error_message TEXT,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX idx_conversions_gclid ON conversions (gclid_hash);
CREATE INDEX idx_conversions_status ON conversions (status, created_at DESC);
