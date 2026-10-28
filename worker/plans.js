// Cấu hình mặc định của gói dịch vụ. Admin có thể đổi giới hạn và giá ngay trong trang Quản trị (lưu ở D1),
// giá trị ở đây chỉ dùng khi admin chưa chỉnh gì.
// {calls} và {chars} trong perks được thay bằng giới hạn thực tế của gói.

export const PLANS = {
  guest: {
    id: 'guest', name: 'Khách', price: 'Miễn phí',
    ttsCalls: 5, maxChars: 500, srtCues: 0,
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
    ttsCalls: 50, maxChars: 3000, srtCues: 30,
    perks: [
      'Mọi thứ của gói Khách',
      '{calls} lượt giọng Edge Neural mỗi ngày, tối đa {chars} ký tự/lượt',
      'Điều chỉnh tốc độ đọc linh hoạt từ 0.75× đến 1.50×',
      'Từ điển phát âm cá nhân hóa lưu vĩnh viễn (KTX → ký túc xá...)',
      'Lưu lịch sử chuyển đổi giọng nói và file âm thanh',
      'Đọc phụ đề SRT thành giọng khớp mốc thời gian: tối đa {srt} câu mỗi file',
      'Dùng API key Gemini / Groq của bạn: nhận diện đám mây, Gemini TTS',
      'Cần xác minh email'
    ]
  },
  premium: {
    id: 'premium', name: 'Premium', price: '',
    ttsCalls: 500, maxChars: 20000, srtCues: null,
    perks: [
      'Mọi thứ của gói Miễn phí',
      'Mở khóa độc quyền Model STT Cao cấp: Whisper Large v3 Turbo, PhoWhisper (VinAI tiếng Việt), Kotoba SOTA, Moonshine...',
      'Mở khóa độc quyền VieNeu-TTS Studio Pro: 35 giọng 3 miền (bổ sung Review phim, Thuyết minh VTV, Kể chuyện trinh thám, MC Bán hàng, ASMR thiền...)',
      'Mở khóa độc quyền Supertonic 3 Pro: 20 giọng nam nữ quốc tế, 31 ngôn ngữ chuẩn xác',
      'Kho giọng CapCut / TikTok Global: 30+ giọng viral Việt Nam và Quốc tế (Mỹ, Thái, Trung, Indo...)',
      'Hạn mức vượt trội: {calls} lượt mỗi ngày, tối đa {chars} ký tự/lượt (gấp 10 lần Free, đọc cả chương truyện/kịch bản dài)',
      'Chế độ văn bản dài: tự chia đoạn và ghép thành một file, đọc tới 100.000 ký tự mỗi lần',
      'Tự tạo phụ đề SRT khớp với file giọng đọc, dùng ngay cho CapCut / Premiere',
      'Đọc phụ đề SRT thành giọng nói không giới hạn số câu, kèm nhạc nền tự nhỏ lại khi có giọng',
      'Tách giọng khỏi nhạc nền (MDX-Net) trước khi nhận diện: lời bài hát, video có nhạc to ra chữ chính xác hơn rõ rệt',
      'Studio phụ đề video: sửa thời gian từng dòng, kiểu chữ CapCut / tô từng từ, xuất video MP4 có in phụ đề',
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
// Ưu đãi tăng dần từ 10 lượt, làm tròn các mốc 20, 30, 50, 100 (tối đa 40% ở 100 lượt).
// Vượt quá 100 lượt, ưu đãi chỉ tăng nhẹ lắt nhắt (~115đ/lượt).
export const CREDITS = { enabled: true, price: 200, min: 10, max: 10000, presets: [10, 20, 30, 50, 100] };

/**
 * Tính giá mua thêm lượt có chiết khấu số lượng:
 * - Dưới 10 lượt: 200đ/lượt
 * - 10 lượt: 2.000đ (200đ/lượt)
 * - 20 lượt: 3.500đ (175đ/lượt, -12.5%)
 * - 30 lượt: 5.000đ (~167đ/lượt, -16.7%)
 * - 50 lượt: 7.500đ (150đ/lượt, -25%)
 * - 100 lượt: 12.000đ (120đ/lượt, -40% - ưu đãi kịch kim)
 * - Trên 100 lượt: 100 lượt đầu 12.000đ, các lượt tiếp theo tính 115đ/lượt (chỉ tăng lắt nhắt)
 */
export function calcCreditsPrice(qty, basePrice = 200) {
  qty = Math.floor(Number(qty)) || 0;
  if (qty <= 0) return 0;
  basePrice = Number(basePrice) > 0 ? Number(basePrice) : 200;

  let amount = 0;
  if (qty < 10) {
    amount = qty * 200;
  } else if (qty <= 20) {
    amount = 2000 + ((qty - 10) / 10) * 1500;
  } else if (qty <= 30) {
    amount = 3500 + ((qty - 20) / 10) * 1500;
  } else if (qty <= 50) {
    amount = 5000 + ((qty - 30) / 20) * 2500;
  } else if (qty <= 100) {
    amount = 7500 + ((qty - 50) / 50) * 4500;
  } else {
    amount = 12000 + (qty - 100) * 115;
  }

  // Tỷ lệ theo basePrice nếu admin chỉnh giá khác 200đ
  if (basePrice !== 200) {
    amount = (amount / 200) * basePrice;
  }

  // Làm tròn tiền thanh toán cho đẹp chuẩn giao dịch VNĐ
  const unit = amount >= 10000 ? 1000 : 500;
  return Math.max(2000, Math.round(amount / unit) * unit);
}

// Câu ghi nguồn tự thêm vào cuối mỗi file giọng đọc. {domain} = tên miền website (đã phiên âm để đọc đúng).
export const WATERMARK = { enabled: true, vi: 'File được tạo ra tại trang web {domain}.', en: 'This file was created at {domain}.', exemptPremium: true };

// Chặn tổng toàn hệ thống để không vượt gói free của Cloudflare (100.000 request/ngày).
export const GLOBAL_DAILY_TTS = 60000;
export const GLOBAL_SOFT_RATIO = 0.85;

// Chống spam đăng ký / đăng nhập / gửi mail theo IP mỗi ngày
export const AUTH_ACTIONS_PER_IP = 60;
export const MAIL_COOLDOWN_MS = 60 * 1000;
