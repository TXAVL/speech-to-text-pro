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
      '{calls} lượt giọng Edge Neural mỗi ngày, tối đa {chars} ký tự/lượt',
      'Có chèn câu ghi nguồn trang web vào file âm thanh'
    ]
  },
  free: {
    id: 'free', name: 'Miễn phí', price: '0đ',
    ttsCalls: 50, maxChars: 3000,
    perks: [
      'Mọi thứ của gói Khách',
      '{calls} lượt giọng Edge Neural mỗi ngày, tối đa {chars} ký tự/lượt',
      'Điều chỉnh tốc độ đọc linh hoạt từ 0.75× đến 1.50×',
      'Từ điển phát âm cá nhân hóa lưu vĩnh viễn (KTX → ký túc xá...)',
      'Lưu lịch sử chuyển đổi giọng nói và file âm thanh',
      'Dùng API key Gemini / Groq của bạn: nhận diện đám mây, Gemini TTS',
      'Cần xác minh email'
    ]
  },
  premium: {
    id: 'premium', name: 'Premium', price: '',
    ttsCalls: 500, maxChars: 20000,
    perks: [
      'Mọi thứ của gói Miễn phí',
      'Mở khóa độc quyền Mô hình VieNeu-TTS: 25 giọng chuẩn Bắc - Trung - Nam, đa phong cách, đọc chuẩn tiếng Anh xen tiếng Việt',
      'Mở khóa độc quyền Mô hình Supertonic 3: 31 ngôn ngữ quốc tế (Anh, Nhật, Hàn, Pháp, Đức, Nga...), 10 giọng nam nữ',
      'Kho giọng CapCut / TikTok: 24 giọng Việt viral (review phim, kịch bản, hài hước...)',
      'Hạn mức vượt trội: {calls} lượt mỗi ngày, tối đa {chars} ký tự/lượt (gấp 10 lần Free, đọc cả chương truyện/kịch bản dài)',
      'Xuất âm thanh chất lượng cao: WAV 48 kHz (16-bit PCM chuẩn phòng thu) hoặc MP3',
      'Điều khiển cảm xúc ([cười], [thở dài], <laugh>...) & Thẻ nghỉ chính xác từng mili-giây ([nghỉ 2s], [nghỉ 500ms])',
      'Hoàn toàn không có câu ghi nguồn (không watermark) vào file âm thanh',
      'Công cụ AI thông minh: Tóm tắt, làm sạch, dịch văn bản tự động',
      'Hỗ trợ mua thêm lượt cộng dồn và ưu tiên hàng đợi cao nhất khi hệ thống cao điểm'
    ]
  }
};

// Gói Premium bán qua payOS (VND). Admin sửa được giá / bật tắt từng gói.
export const PREMIUM_PACKAGES = [
  { id: 'm1', name: '1 tháng', days: 30, price: 49000, active: true },
  { id: 'm3', name: '3 tháng', days: 90, price: 129000, active: true },
  { id: 'y1', name: '12 tháng', days: 365, price: 399000, active: true }
];

// Mua thêm lượt (chỉ gói Premium). Admin chỉnh giá / giới hạn trong trang Quản trị.
export const CREDITS = { enabled: true, price: 200, min: 20, max: 10000, presets: [50, 100, 200, 500] };

// Câu ghi nguồn tự thêm vào cuối mỗi file giọng đọc. {domain} = tên miền website (đã phiên âm để đọc đúng).
export const WATERMARK = { enabled: true, vi: 'File được tạo ra tại trang web {domain}.', en: 'This file was created at {domain}.', exemptPremium: true };

// Chặn tổng toàn hệ thống để không vượt gói free của Cloudflare (100.000 request/ngày).
export const GLOBAL_DAILY_TTS = 60000;
export const GLOBAL_SOFT_RATIO = 0.85;

// Chống spam đăng ký / đăng nhập / gửi mail theo IP mỗi ngày
export const AUTH_ACTIONS_PER_IP = 60;
export const MAIL_COOLDOWN_MS = 60 * 1000;
