-- VoiceKit: tài khoản, phiên đăng nhập, token email, lượt dùng theo ngày
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  pass_hash     TEXT NOT NULL,
  pass_salt     TEXT NOT NULL,
  plan          TEXT NOT NULL DEFAULT 'free',     -- free | premium
  plan_expires  INTEGER,                          -- ms epoch, NULL = không hết hạn
  role          TEXT NOT NULL DEFAULT 'user',     -- user | admin
  verified      INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  last_login    INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  user_agent  TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS email_tokens (
  token_hash  TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                      -- verify | reset
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL,
  used        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON email_tokens(user_id, kind);

-- subject: 'u:<id>' | 'ip:<hash>' | 'global' | 'auth:<hash>' ; day theo giờ Việt Nam (YYYY-MM-DD)
CREATE TABLE IF NOT EXISTS usage (
  subject  TEXT NOT NULL,
  day      TEXT NOT NULL,
  calls    INTEGER NOT NULL DEFAULT 0,
  chars    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, day)
);
