// Cấu hình mặc định của gói dịch vụ. Admin có thể đổi giới hạn và giá ngay trong trang Quản trị (lưu ở D1),
// giá trị ở đây chỉ dùng khi admin chưa chỉnh gì.
// {calls} và {chars} trong perks được thay bằng giới hạn thực tế của gói.

export const PLANS = {
  guest: {
    id: 'guest', name: 'Khách', price: 'Miễn phí',
    ttsCalls: 5, maxChars: 500,
    perks: [
      'Giọng nói → văn bản bằng Whisper, không giới hạn (chạy trên máy bạn)',
      'Giọng Piper / Meta MMS / giọng trình duyệt, không giới hạn',
      'Xuất phụ đề SRT / VTT / TXT',
      '{calls} lượt giọng Edge Neural mỗi ngày, tối đa {chars} ký tự/lượt'
    ]
  },
  free: {
    id: 'free', name: 'Miễn phí', price: '0đ',
    ttsCalls: 50, maxChars: 3000,
    perks: [
      'Mọi thứ của gói Khách',
      '{calls} lượt giọng Edge Neural mỗi ngày, tối đa {chars} ký tự/lượt',
      'Lưu lịch sử chuyển đổi',
      'Dùng API key Gemini / Groq của bạn: nhận diện trên đám mây, Gemini TTS',
      'Cần xác minh email'
    ]
  },
  premium: {
    id: 'premium', name: 'Premium', price: '',
    ttsCalls: 500, maxChars: 20000,
    perks: [
      'Mọi thứ của gói Miễn phí',
      'Kho giọng CapCut / TikTok: 24 giọng Việt (review phim, TikTok, MC...)',
      'Tóm tắt, làm sạch, dịch văn bản bằng AI',
      '{calls} lượt giọng Edge / CapCut mỗi ngày, tối đa {chars} ký tự/lượt',
      'Đọc văn bản dài (cả chương truyện, kịch bản video) trong một lần',
      'Được ưu tiên khi hệ thống gần chạm giới hạn ngày'
    ]
  }
};

// Gói Premium bán qua payOS (VND). Admin sửa được giá / bật tắt từng gói.
export const PREMIUM_PACKAGES = [
  { id: 'm1', name: '1 tháng', days: 30, price: 49000, active: true },
  { id: 'm3', name: '3 tháng', days: 90, price: 129000, active: true },
  { id: 'y1', name: '12 tháng', days: 365, price: 399000, active: true }
];

// Chặn tổng toàn hệ thống để không vượt gói free của Cloudflare (100.000 request/ngày).
export const GLOBAL_DAILY_TTS = 60000;
export const GLOBAL_SOFT_RATIO = 0.85;

// Chống spam đăng ký / đăng nhập / gửi mail theo IP mỗi ngày
export const AUTH_ACTIONS_PER_IP = 60;
export const MAIL_COOLDOWN_MS = 60 * 1000;
