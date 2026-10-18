// Cấu hình gói dịch vụ. Sửa số ở đây là đổi giới hạn cho cả website.
// Chỉ giới hạn những thứ tốn tài nguyên Cloudflare (Edge / CapCut TTS chạy qua Worker).
// Các tính năng chạy trong trình duyệt (Whisper, Piper, MMS, Gemini bằng key riêng) không tốn gì nên không giới hạn.

export const PLANS = {
  guest: {
    id: 'guest', name: 'Khách', price: 'Miễn phí',
    ttsCalls: 5, maxChars: 500,
    perks: ['Giọng nói → văn bản không giới hạn (chạy trên máy)', 'Piper / MMS / giọng trình duyệt không giới hạn', '5 lượt Edge / CapCut mỗi ngày, tối đa 500 ký tự/lượt']
  },
  free: {
    id: 'free', name: 'Miễn phí', price: '0đ',
    ttsCalls: 50, maxChars: 3000,
    perks: ['Mọi thứ của gói Khách', '50 lượt Edge / CapCut mỗi ngày, tối đa 3.000 ký tự/lượt', 'Cần xác minh email']
  },
  premium: {
    id: 'premium', name: 'Premium', price: 'Liên hệ',
    ttsCalls: 500, maxChars: 20000,
    perks: ['Mọi thứ của gói Miễn phí', '500 lượt Edge / CapCut mỗi ngày, tối đa 20.000 ký tự/lượt', 'Được ưu tiên khi hệ thống gần chạm giới hạn ngày']
  }
};

// Chặn tổng toàn hệ thống để không bao giờ vượt gói free của Cloudflare (100.000 request/ngày).
// Để dư cho request đăng nhập, danh sách giọng... Premium được dùng tới GLOBAL_DAILY_TTS, các gói khác dừng sớm hơn.
export const GLOBAL_DAILY_TTS = 60000;
export const GLOBAL_SOFT_RATIO = 0.85;

// Chống spam đăng ký / đăng nhập / gửi mail theo IP mỗi ngày
export const AUTH_ACTIONS_PER_IP = 60;
export const MAIL_COOLDOWN_MS = 60 * 1000;

export function publicPlans() {
  return Object.values(PLANS).map(({ id, name, price, ttsCalls, maxChars, perks }) => ({ id, name, price, ttsCalls, maxChars, perks }));
}
