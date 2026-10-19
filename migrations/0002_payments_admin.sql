-- Thanh toán payOS, cài đặt do admin chỉnh, khóa tài khoản, nhật ký quản trị
ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS orders (
  order_code       INTEGER PRIMARY KEY,           -- mã đơn gửi payOS
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  package_id       TEXT NOT NULL,
  package_name     TEXT NOT NULL,
  days             INTEGER NOT NULL,
  amount           INTEGER NOT NULL,              -- VND
  status           TEXT NOT NULL DEFAULT 'PENDING', -- PENDING | PAID | CANCELLED | EXPIRED
  description      TEXT NOT NULL,                 -- nội dung chuyển khoản
  checkout_url     TEXT,
  qr_code          TEXT,
  bank_bin         TEXT,
  account_number   TEXT,
  account_name     TEXT,
  payment_link_id  TEXT,
  expired_at       INTEGER,                       -- giây (theo payOS)
  created_at       INTEGER NOT NULL,
  paid_at          INTEGER,
  paid_via         TEXT,                          -- webhook | check | admin
  reference        TEXT,                          -- mã giao dịch ngân hàng
  note             TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id    INTEGER,
  admin_email TEXT,
  action      TEXT NOT NULL,
  target      TEXT,
  detail      TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_time ON admin_logs(created_at);
