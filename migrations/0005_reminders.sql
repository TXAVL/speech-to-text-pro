-- Nhắc hạn Premium: lưu plan_expires của kỳ hạn đã nhắc để mỗi kỳ chỉ gửi một email
ALTER TABLE users ADD COLUMN expiry_notice INTEGER;   -- đã báo "sắp hết hạn" cho kỳ hạn này
ALTER TABLE users ADD COLUMN expired_notice INTEGER;  -- đã báo "đã hết hạn" cho kỳ hạn này
