'use strict';
/* =====================================================================
 * VieNeu-TTS (Việt Nam) & Supertonic 3 (Đa ngôn ngữ)
 * - 25 giọng tiếng Việt chuẩn Bắc - Trung - Nam, đa phong cách.
 * - 10 giọng Supertonic 3 hỗ trợ 31 ngôn ngữ quốc tế.
 * - Thẻ cảm xúc: [cười], [thở dài], [hắng giọng] / <laugh>, <breath>, <sigh>.
 * - Thẻ nghỉ thời lượng chính xác: [nghỉ 500ms], [nghỉ 2s] (tối đa 10s).
 * - Từ điển phát âm cá nhân hóa lưu vĩnh viễn (KTX -> ký túc xá, SGK -> sách giáo khoa...).
 * - Xuất file WAV chuẩn phòng thu 48 kHz hoặc MP3.
 * ===================================================================== */

const VIENEU_VOICES = [
  // --- Miền Bắc (14 giọng) ---
  { id: 'minh_quan', name: 'Minh Quân', gender: 'Nam', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nam truyền cảm, tự nhiên, đọc lưu loát, phù hợp mọi nội dung (Mặc định)',
    sample: 'Xin chào! Tôi là Minh Quân. Rất vui được đồng hành cùng bạn trong trải nghiệm giọng đọc VieNeu.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+0Hz', rateMod: 1.0 },
  { id: 'mai_anh', name: 'Mai Anh', gender: 'Nữ', region: 'Bắc', style: 'Tin tức',
    desc: 'Giọng nữ chuẩn Hà Nội, rõ ràng, đĩnh đạc, phong cách phát thanh viên thời sự',
    sample: 'Kính chào quý vị và các bạn. Sau đây là bản tin thời sự tổng hợp và dự báo phát triển kinh tế ngày hôm nay.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+4Hz', rateMod: 1.03 },
  { id: 'anh_khoi', name: 'Anh Khôi', gender: 'Nam', region: 'Bắc', style: 'Kể chuyện',
    desc: 'Giọng nam trầm ấm, nhấn nhá kịch tính, phù hợp podcast và sách nói',
    sample: 'Đêm hôm ấy, cả ngôi làng dường như chìm trong một sự tĩnh lặng đến rợn người, chỉ có tiếng gió xào xạc bên hiên.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-6Hz', rateMod: 0.94 },
  { id: 'minh_duc', name: 'Minh Đức', gender: 'Nam', region: 'Bắc', style: 'Tin tức',
    desc: 'Giọng nam truyền hình chính luận, dứt khoát, thuyết minh tài liệu khoa học',
    sample: 'Theo báo cáo mới nhất từ các chuyên gia, chỉ số ứng dụng trí tuệ nhân tạo trong sản xuất đã có bước nhảy vọt.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+2Hz', rateMod: 1.02 },
  { id: 'manh_dung', name: 'Mạnh Dũng', gender: 'Nam', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nam thanh niên hiện đại, trẻ trung, tự tin, phong cách vlog và mạng xã hội',
    sample: 'Chào cả nhà! Hôm nay mình sẽ chia sẻ cho các bạn một mẹo cực kỳ hay ho và tiết kiệm thời gian nhé.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+8Hz', rateMod: 1.05 },
  { id: 'ngoc_huyen', name: 'Ngọc Huyền', gender: 'Nữ', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nữ nhẹ nhàng, gần gũi, đời thường, thân thiện, trợ lý ảo',
    sample: 'Cảm ơn bạn đã lựa chọn sử dụng ứng dụng. Chúc bạn có một ngày làm việc thật nhiều năng lượng và niềm vui.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+2Hz', rateMod: 1.0 },
  { id: 'ngoc_linh', name: 'Ngọc Linh', gender: 'Nữ', region: 'Bắc', style: 'Đọc truyện',
    desc: 'Giọng nữ dịu dàng, biểu cảm phong phú, cuốn hút trong từng tình tiết truyện',
    sample: 'Ngày xửa ngày xưa, ở một vương quốc xa xôi nọ, có một nàng công chúa vô cùng nhân từ và thông minh.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '-2Hz', rateMod: 0.96 },
  { id: 'pham_tuyen', name: 'Phạm Tuyên', gender: 'Nam', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nam trung niên đằm thắm, chững chạc, tạo sự tin cậy cao',
    sample: 'Mỗi bài học trong cuộc sống đều mang lại cho chúng ta những trải nghiệm và giá trị vô giá cho tương lai.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-4Hz', rateMod: 0.97 },
  { id: 'quynh_anh', name: 'Quỳnh Anh', gender: 'Nữ', region: 'Bắc', style: 'Kể chuyện',
    desc: 'Giọng nữ giàu cảm xúc, ấm áp, sâu lắng cho những câu chuyện tâm sự',
    sample: 'Có những kỷ niệm dù thời gian có trôi qua bao lâu chăng nữa, vẫn vẹn nguyên trong ký ức của mỗi người.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '-1Hz', rateMod: 0.95 },
  { id: 'thanh_binh', name: 'Thanh Bình', gender: 'Nam', region: 'Bắc', style: 'Kể chuyện',
    desc: 'Giọng nam diễn cảm, nhịp điệu thong thả, ru ngủ và suy ngẫm',
    sample: 'Gió nhẹ thổi qua hàng cây rợp bóng, mang theo hương thơm thoang thoảng của cỏ dại ven con đường làng.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-8Hz', rateMod: 0.9 },
  { id: 'truc_ly', name: 'Trúc Ly', gender: 'Nữ', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nữ trong trẻo, vui tươi, lanh lợi, tràn đầy sức sống',
    sample: 'Chào mừng các bạn đã quay trở lại với chuyên mục khám phá công nghệ hàng ngày cùng Trúc Ly nhé!',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+8Hz', rateMod: 1.08 },
  { id: 'xuan_vinh', name: 'Xuân Vĩnh', gender: 'Nam', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nam mộc mạc, phát âm rõ ràng, chân thực',
    sample: 'Nội dung tiếp theo sau đây sẽ giúp quý khán giả hiểu rõ hơn về quy trình vận hành của hệ thống.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+0Hz', rateMod: 1.0 },
  { id: 'doan_trang', name: 'Đoan Trang', gender: 'Nữ', region: 'Bắc', style: 'Tự nhiên',
    desc: 'Giọng nữ thanh lịch, điềm đạm, trang nhã cho bài thuyết trình',
    sample: 'Sự kiên trì và nỗ lực không ngừng nghỉ chính là chìa khóa mở ra cánh cửa dẫn tới những thành công vững chắc.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+1Hz', rateMod: 0.98 },
  { id: 'huong_giang', name: 'Hương Giang', gender: 'Nữ', region: 'Bắc', style: 'Truyền cảm',
    desc: 'Giọng nữ ngọt ngào, giàu nhạc điệu, ngâm thơ và văn học nghệ thuật',
    sample: 'Mùa thu về mang theo những cơn gió heo may se lạnh, làm lòng người xao xuyến bao nỗi niềm bâng khuâng.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '-3Hz', rateMod: 0.92 },

  // --- Miền Trung (4 giọng) ---
  { id: 'quang_son', name: 'Quang Sơn', gender: 'Nam', region: 'Trung', style: 'Tự nhiên',
    desc: 'Giọng nam miền Trung hào sảng, chân chất, phong cách mộc mạc',
    sample: 'Xin chào bà con cô bác, bữa ni mình xin giới thiệu tới mọi người một cảnh đẹp quê hương xứ Trung rất bình dị.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+3Hz', rateMod: 1.04 },
  { id: 'ngoc_tran', name: 'Ngọc Trân', gender: 'Nữ', region: 'Trung', style: 'Tự nhiên',
    desc: 'Giọng nữ Huế dịu dàng, êm đềm, ngọt ngào, duyên dáng',
    sample: 'Dạ xin kính chào quý vị. Cung chúc quý vị một ngày an lành, tràn ngập tiếng cười và nhiều hạnh phúc.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '-2Hz', rateMod: 0.93 },
  { id: 'khanh_an', name: 'Khánh An', gender: 'Nữ', region: 'Trung', style: 'Dịu dàng',
    desc: 'Giọng nữ Đà Nẵng ngọt ngào, truyền cảm, trong sáng, dễ nghe',
    sample: 'Thành phố bên bờ sông Hàn luôn lung linh và tràn đầy sức sống mỗi khi màn đêm dần buông xuống.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+4Hz', rateMod: 0.99 },
  { id: 'van_hung', name: 'Văn Hùng', gender: 'Nam', region: 'Trung', style: 'Truyền cảm',
    desc: 'Giọng nam xứ Nghệ ấm áp, đậm đà tình quê hương sâu nặng',
    sample: 'Dù có đi đâu về đâu, tiếng gọi quê hương vẫn luôn là khúc ca da diết nhất khắc sâu trong lòng mỗi người.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-5Hz', rateMod: 0.95 },

  // --- Miền Nam (7 giọng) ---
  { id: 'thai_son', name: 'Thái Sơn', gender: 'Nam', region: 'Nam', style: 'Kể chuyện',
    desc: 'Giọng nam miền Tây chân thành, ấm áp, đọc truyện ngắn và hồi ức',
    sample: 'Buổi chiều miền Tây sông nước êm đềm, tiếng đờn ca tài tử vẳng lại từ mé sông làm bồi hồi ký ức tuổi thơ.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-7Hz', rateMod: 0.95 },
  { id: 'thuc_doan', name: 'Thục Đoan', gender: 'Nữ', region: 'Nam', style: 'Kể chuyện',
    desc: 'Giọng nữ miền Nam dịu ngọt, tình cảm, sâu lắng, đọc tiểu thuyết',
    sample: 'Có những yêu thương lặng lẽ như dòng sông quê mẹ, chảy hoài chảy mãi chẳng bao giờ vơi cạn.',
    voiceBase: 'vi_female_huong', pitch: '-3Hz', rateMod: 0.95 },
  { id: 'minh_triet', name: 'Minh Triết', gender: 'Nam', region: 'Nam', style: 'Tin tức',
    desc: 'Giọng nam thời sự miền Nam đĩnh đạc, phát âm chuẩn xác, phát thanh đài',
    sample: 'Bản tin kinh tế thị trường thành phố Hồ Chí Minh hôm nay ghi nhận nhiều chuyển biến tích cực trong các ngành dịch vụ.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+2Hz', rateMod: 1.02 },
  { id: 'my_duyen', name: 'Mỹ Duyên', gender: 'Nữ', region: 'Nam', style: 'Kể chuyện',
    desc: 'Giọng nữ miền Nam trẻ trung, dễ thương, review phim và kịch bản hoạt hình',
    sample: 'Hello cả nhà yêu! Cùng Mỹ Duyên theo dõi tập phim cực kỳ hấp dẫn và gay cấn ngày hôm nay nha.',
    voiceBase: 'vi_female_huong', pitch: '+5Hz', rateMod: 1.08 },
  { id: 'duc_tri', name: 'Đức Trí', gender: 'Nam', region: 'Nam', style: 'Đọc truyện',
    desc: 'Giọng nam Sài Gòn truyền cảm, phong cách radio đêm muộn và truyện trinh thám',
    sample: 'Đêm đã khuya, mời quý thính giả cùng lắng lòng lại với những giai điệu êm đềm và trang sách thân quen.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-4Hz', rateMod: 0.94 },
  { id: 'kim_thanh', name: 'Kim Thanh', gender: 'Nữ', region: 'Nam', style: 'Kể chuyện',
    desc: 'Giọng nữ Nam Bộ truyền thống, đọc truyện dân gian và cổ tích',
    sample: 'Thuở đó ở xứ Cù Lao, bà con lối xóm ai ai cũng thương mến hai đứa nhỏ hiền lành, chịu thương chịu khó.',
    voiceBase: 'vi_female_huong', pitch: '-1Hz', rateMod: 0.96 },
  { id: 'thuy_dung', name: 'Thùy Dung', gender: 'Nữ', region: 'Nam', style: 'Tin tức',
    desc: 'Giọng nữ miền Nam chuyên nghiệp, rõ ràng, dứt khoát, phong thái hiện đại',
    sample: 'Chào mừng quý vị đang theo dõi chuyên mục nhịp sống đô thị và phong cách sống hiện đại ngày hôm nay.',
    voiceBase: 'vi_female_huong', pitch: '+3Hz', rateMod: 1.04 }
];

// Định dạng nhãn hiển thị cho từng giọng VieNeu
VIENEU_VOICES.forEach(v => {
  v.label = `${v.name} (${v.gender} · ${v.region} · ${v.style})`;
});

// --- Supertonic 3: 10 giọng nam/nữ đa ngôn ngữ ---
const SUPERTONIC_VOICES = [
  { id: 'st_alex', name: 'Alex', gender: 'Nam', desc: 'Giọng nam tiếng Anh / quốc tế chuẩn, tự nhiên, tin cậy', sample: 'Hello, welcome to Supertonic multilingual speech synthesis system.' },
  { id: 'st_emma', name: 'Emma', gender: 'Nữ', desc: 'Giọng nữ tiếng Anh truyền cảm, phát âm trong trẻo, nhẹ nhàng', sample: 'Good morning! It is wonderful to explore new languages with you today.' },
  { id: 'st_david', name: 'David', gender: 'Nam', desc: 'Giọng nam trầm ấm, đọc truyện và podcast toàn cầu', sample: 'The evening silence was broken only by the gentle sound of falling rain.' },
  { id: 'st_sophia', name: 'Sophia', gender: 'Nữ', desc: 'Giọng nữ thanh lịch, bản tin tài chính và giáo dục quốc tế', sample: 'Latest international economic reports indicate a steady growth across tech sectors.' },
  { id: 'st_liam', name: 'Liam', gender: 'Nam', desc: 'Giọng nam trẻ trung, năng động, phong cách vlog và mạng xã hội', sample: 'Hey guys! Check out this incredible new speech feature we just built.' },
  { id: 'st_olivia', name: 'Olivia', gender: 'Nữ', desc: 'Giọng nữ ngọt ngào, hội thoại đời thường và trợ lý AI', sample: 'I would be happy to assist you with any questions you might have.' },
  { id: 'st_kenji', name: 'Kenji', gender: 'Nam', desc: 'Giọng nam châu Á (Nhật / Anh), đĩnh đạc, rõ nét', sample: 'こんにちは。本日のニュースをお伝えいたします。 (Konnichiwa, honjitsu no nyuusu o otsutae itashimasu)' },
  { id: 'st_yuki', name: 'Yuki', gender: 'Nữ', desc: 'Giọng nữ châu Á (Nhật / Anh), dịu dàng, trong sáng', sample: 'はじめまして、よろしくお願いします。 (Hajimemashite, yoroshiku onegai shimasu)' },
  { id: 'st_minjun', name: 'Min-jun', gender: 'Nam', desc: 'Giọng nam Hàn Quốc / đa ngữ, thời trang, hiện đại', sample: '안녕하세요, 오늘 하루도 행복한 시간 되세요. (Annyeonghaseyo, oneul harudo haengbokhan shigan doeseyo)' },
  { id: 'st_seoyeon', name: 'Seo-yeon', gender: 'Nữ', desc: 'Giọng nữ Hàn Quốc / đa ngữ, êm dịu, tình cảm', sample: '반갑습니다. 새로운 음성 서비스를 경험해 보세요. (Bangapseumnida. Saeroun eumseong seobiseureul gyeongheomhae boseyo)' }
];
SUPERTONIC_VOICES.forEach(v => {
  v.label = `${v.name} (${v.gender} · Đa ngôn ngữ)`;
});

// 31 ngôn ngữ hỗ trợ của Supertonic 3
const SUPERTONIC_LANGS = [
  { code: 'auto', name: '✨ Tự nhận theo văn bản (Auto)' },
  { code: 'en', name: '🇬🇧 Tiếng Anh (English)' },
  { code: 'ja', name: '🇯🇵 Tiếng Nhật (日本語)' },
  { code: 'ko', name: '🇰🇷 Tiếng Hàn (한국어)' },
  { code: 'fr', name: '🇫🇷 Tiếng Pháp (Français)' },
  { code: 'de', name: '🇩🇪 Tiếng Đức (Deutsch)' },
  { code: 'es', name: '🇪🇸 Tiếng Tây Ban Nha (Español)' },
  { code: 'ru', name: '🇷🇺 Tiếng Nga (Русский)' },
  { code: 'ar', name: '🇸🇦 Tiếng Ả Rập (العربية)' },
  { code: 'it', name: '🇮🇹 Tiếng Ý (Italiano)' },
  { code: 'pt', name: '🇵🇹 Tiếng Bồ Đào Nha (Português)' },
  { code: 'nl', name: '🇳🇱 Tiếng Hà Lan (Nederlands)' },
  { code: 'pl', name: '🇵🇱 Tiếng Ba Lan (Polski)' },
  { code: 'tr', name: '🇹🇷 Tiếng Thổ Nhĩ Kỳ (Türkçe)' },
  { code: 'hi', name: '🇮🇳 Tiếng Hindi (हिन्दी)' },
  { code: 'th', name: '🇹🇭 Tiếng Thái (ไทย)' },
  { code: 'id', name: '🇮🇩 Tiếng Indonesia (Bahasa)' },
  { code: 'vi', name: '🇻🇳 Tiếng Việt (Vietnamese)' },
  { code: 'sv', name: '🇸🇪 Tiếng Thụy Điển (Svenska)' },
  { code: 'cs', name: '🇨🇿 Tiếng Séc (Čeština)' },
  { code: 'el', name: '🇬🇷 Tiếng Hy Lạp (Ελληνικά)' },
  { code: 'he', name: '🇮🇱 Tiếng Do Thái (עברית)' },
  { code: 'da', name: '🇩🇰 Tiếng Đan Mạch (Dansk)' },
  { code: 'fi', name: '🇫🇮 Tiếng Phần Lan (Suomi)' },
  { code: 'no', name: '🇳🇴 Tiếng Na Uy (Norsk)' },
  { code: 'hu', name: '🇭🇺 Tiếng Hungary (Magyar)' },
  { code: 'ro', name: '🇷🇴 Tiếng Romania (Română)' },
  { code: 'uk', name: '🇺🇦 Tiếng Ukraina (Українська)' },
  { code: 'ms', name: '🇲🇾 Tiếng Mã Lai (Melayu)' },
  { code: 'fil', name: '🇵🇭 Tiếng Philippines (Tagalog)' },
  { code: 'fa', name: '🇮🇷 Tiếng Ba Tư (فارسی)' }
];

/* =====================================================================
 * TỪ ĐIỂN PHÁT ÂM (Pronunciation Dictionary)
 * ===================================================================== */
const vkDict = (() => {
  const STORAGE_KEY = 'vk-pronunciation-dict';
  const DEFAULTS = [
    { from: 'KTX', to: 'ký túc xá' },
    { from: 'SGK', to: 'sách giáo khoa' },
    { from: 'CIT', to: 'C I T' },
    { from: 'TP.HCM', to: 'thành phố Hồ Chí Minh' },
    { from: 'TPHCM', to: 'thành phố Hồ Chí Minh' },
    { from: 'HN', to: 'Hà Nội' },
    { from: 'km', to: 'ki lô mét' },
    { from: 'kg', to: 'ki lô gam' },
    { from: 'USD', to: 'đô la Mỹ' },
    { from: 'VND', to: 'đồng' },
    { from: 'VNĐ', to: 'đồng' },
    { from: 'AI', to: 'ây ai' },
    { from: 'TTS', to: 'tê tê ét' },
    { from: 'STT', to: 'ét tê tê' },
    { from: 'CEO', to: 'xi i ô' },
    { from: 'VTV', to: 'vê tê vê' },
    { from: 'HTV', to: 'hát tê vê' }
  ];

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [...DEFAULTS];
  }

  function save(list) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Không thể lưu từ điển:', e);
    }
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Áp dụng từ điển phát âm vào văn bản trước khi tổng hợp giọng
   */
  function apply(text) {
    if (!text) return '';
    const list = load();
    let res = String(text);
    for (const item of list) {
      if (!item.from || !item.to) continue;
      const pattern = new RegExp('(?<=^|[\\s.,!?;:()"\'-])' + escapeRegExp(item.from) + '(?=[\\s.,!?;:()"\'-]|$)', 'gi');
      res = res.replace(pattern, item.to);
    }
    return res;
  }

  return { load, save, apply, defaults: DEFAULTS };
})();

/* =====================================================================
 * THẺ NGHỈ & THẺ CẢM XÚC (Tags Processor)
 * ===================================================================== */
const vkTags = (() => {
  // Regex nhận diện thẻ nghỉ: [nghỉ 500ms], [nghỉ 2s], [nghi 1.5s], [pause 1s], [break 500ms]
  const PAUSE_REGEX = /\[(?:nghỉ|nghi|pause|break)\s*([0-9.]+)\s*(ms|s|giây|giay)?\]/gi;

  // Regex nhận diện thẻ cảm xúc: [cười], [thở dài], [hắng giọng] và thẻ Supertonic: <laugh>, <breath>, <sigh>
  const EMOTION_REGEX = /(\[cười\]|\[thở dài\]|\[hắng giọng\]|<laugh>|<breath>|<sigh>)/gi;

  /**
   * Phân tích văn bản thành chuỗi các đoạn âm thanh và khoảng lặng
   */
  function parsePauses(text) {
    const segments = [];
    let lastIndex = 0;
    const cleanText = text.replace(PAUSE_REGEX, (match, val, unit, offset) => {
      const before = text.slice(lastIndex, offset).trim();
      if (before) segments.push({ type: 'text', content: before });
      let sec = parseFloat(val) || 0;
      if (unit && unit.toLowerCase() === 'ms') sec = sec / 1000;
      sec = Math.max(0.1, Math.min(10, sec)); // Tối đa 10 giây mỗi thẻ
      segments.push({ type: 'pause', sec });
      lastIndex = offset + match.length;
      return '';
    });
    const remaining = text.slice(lastIndex).trim();
    if (remaining) segments.push({ type: 'text', content: remaining });
    return segments.length ? segments : [{ type: 'text', content: text }];
  }

  /**
   * Chuyển đổi qua lại giữa thẻ cảm xúc VieNeu và Supertonic tùy theo kho giọng
   */
  function normalizeEmotions(text, lib) {
    if (!text) return '';
    if (lib === 'supertonic') {
      return text
        .replace(/\[cười\]/gi, '<laugh>')
        .replace(/\[thở dài\]/gi, '<sigh>')
        .replace(/\[hắng giọng\]/gi, '<breath>');
    }
    // VieNeu & các kho khác:
    return text
      .replace(/<laugh>/gi, '[cười]')
      .replace(/<sigh>/gi, '[thở dài]')
      .replace(/<breath>/gi, '[thở dài]');
  }

  return { parsePauses, normalizeEmotions };
})();

/* =====================================================================
 * XỬ LÝ ÂM THANH 48 kHz & GHÉP NỐI KHOẢNG LẶNG (Audio Processor)
 * ===================================================================== */
const vkAudio = (() => {
  /**
   * Chuyển đổi Float32Array sang định dạng WAV 48.000 Hz, 16-bit PCM chất lượng cao
   */
  function f32ToWav48k(samples, sampleRate = 48000) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = samples.length * (bitsPerSample / 8);
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk descriptor
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
    view.setUint16(20, 1, true);  // AudioFormat (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data sub-chunk
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Ghi các mẫu PCM 16-bit
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Tạo mảng mẫu Float32 khoảng lặng (silence buffer)
   */
  function createSilence(durationSec, sampleRate = 48000) {
    const len = Math.round(durationSec * sampleRate);
    return new Float32Array(len);
  }

  /**
   * Giải mã blob âm thanh thành mảng Float32Array ở sampleRate 48 kHz
   */
  async function decodeTo48k(blob, targetRate = 48000) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: targetRate });
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      return audioBuffer.getChannelData(0);
    } finally {
      ctx.close();
    }
  }

  return { f32ToWav48k, createSilence, decodeTo48k };
})();

// Xuất ra môi trường trình duyệt
if (typeof window !== 'undefined') {
  window.VIENEU_VOICES = VIENEU_VOICES;
  window.SUPERTONIC_VOICES = SUPERTONIC_VOICES;
  window.SUPERTONIC_LANGS = SUPERTONIC_LANGS;
  window.vkDict = vkDict;
  window.vkTags = vkTags;
  window.vkAudio = vkAudio;
}

// Xuất ra môi trường module (Worker / Node)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { VIENEU_VOICES, SUPERTONIC_VOICES, SUPERTONIC_LANGS, vkDict, vkTags };
}
