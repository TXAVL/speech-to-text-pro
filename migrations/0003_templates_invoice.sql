-- Mẫu email do admin chỉnh + thông tin xuất hóa đơn của đơn hàng
CREATE TABLE IF NOT EXISTS email_templates (
  id           TEXT PRIMARY KEY,
  subject      TEXT,
  preheader    TEXT,
  heading      TEXT,
  body         TEXT,
  button_text  TEXT,
  button_url   TEXT,
  note         TEXT,
  updated_at   INTEGER NOT NULL,
  updated_by   TEXT
);

ALTER TABLE orders ADD COLUMN invoice TEXT;            -- JSON: { type, name, tax_code, address, email }
ALTER TABLE orders ADD COLUMN invoice_no TEXT;         -- số hóa đơn điện tử admin ghi lại sau khi phát hành
ALTER TABLE orders ADD COLUMN invoice_issued_at INTEGER;
