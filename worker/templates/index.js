// Danh sách mẫu email mặc định. Thêm mẫu mới: tạo file trong thư mục này rồi khai báo ở đây.
// Admin sửa trên trang Quản trị -> lưu vào D1 (bảng email_templates), "Khôi phục mặc định" sẽ quay về nội dung trong file.
import verify from './verify.js';
import reset from './reset.js';
import welcome from './welcome.js';
import plan from './plan.js';
import receipt from './receipt.js';
import invite from './invite.js';
import passwordChanged from './password_changed.js';
import premiumExpiring from './premium_expiring.js';
import premiumExpired from './premium_expired.js';

export const TEMPLATES = Object.fromEntries([verify, reset, welcome, invite, passwordChanged, receipt, plan, premiumExpiring, premiumExpired].map(t => [t.id, t]));

// Nhóm hiển thị trong trang Quản trị
export const TEMPLATE_GROUPS = { verify: 'Tài khoản', reset: 'Tài khoản', welcome: 'Tài khoản', invite: 'Tài khoản', password_changed: 'Tài khoản', receipt: 'Gói & thanh toán', plan: 'Gói & thanh toán', premium_expiring: 'Gói & thanh toán', premium_expired: 'Gói & thanh toán' };

// Biến dùng được trong mọi mẫu
export const GLOBAL_VARS = {
  app_name: { desc: 'Tên website', sample: 'TXA Voice' },
  app_url: { desc: 'Địa chỉ website', sample: 'https://voicekit.example' },
  name: { desc: 'Tên người nhận (hoặc "bạn")', sample: 'Minh Anh' },
  email: { desc: 'Email người nhận', sample: 'minhanh@example.com' },
  year: { desc: 'Năm hiện tại', sample: String(new Date().getFullYear()) }
};

// Các trường admin chỉnh được
export const FIELDS = ['subject', 'preheader', 'heading', 'body', 'button_text', 'button_url', 'note'];
