-- Lượt mua thêm (chỉ gói Premium): cộng dồn, không hết hạn theo ngày, dùng khi đã hết lượt trong ngày
ALTER TABLE users ADD COLUMN extra_credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN kind TEXT NOT NULL DEFAULT 'premium';   -- premium | credits
ALTER TABLE orders ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;     -- số lượt của đơn mua lượt
