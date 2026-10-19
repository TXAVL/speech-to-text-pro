// Module máy chủ cho VieNeu-TTS (25 giọng) & Supertonic 3 (31 ngôn ngữ)
import { edgeSynthesize } from '../edge_tts_worker.js';

export const VIENEU_VOICES = [
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
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '-3Hz', rateMod: 0.95 },
  { id: 'minh_triet', name: 'Minh Triết', gender: 'Nam', region: 'Nam', style: 'Tin tức',
    desc: 'Giọng nam thời sự miền Nam đĩnh đạc, phát âm chuẩn xác, phát thanh đài',
    sample: 'Bản tin kinh tế thị trường thành phố Hồ Chí Minh hôm nay ghi nhận nhiều chuyển biến tích cực trong các ngành dịch vụ.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '+2Hz', rateMod: 1.02 },
  { id: 'my_duyen', name: 'Mỹ Duyên', gender: 'Nữ', region: 'Nam', style: 'Kể chuyện',
    desc: 'Giọng nữ miền Nam trẻ trung, dễ thương, review phim và kịch bản hoạt hình',
    sample: 'Hello cả nhà yêu! Cùng Mỹ Duyên theo dõi tập phim cực kỳ hấp dẫn và gay cấn ngày hôm nay nha.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+5Hz', rateMod: 1.08 },
  { id: 'duc_tri', name: 'Đức Trí', gender: 'Nam', region: 'Nam', style: 'Đọc truyện',
    desc: 'Giọng nam Sài Gòn truyền cảm, phong cách radio đêm muộn và truyện trinh thám',
    sample: 'Đêm đã khuya, mời quý thính giả cùng lắng lòng lại với những giai điệu êm đềm và trang sách thân quen.',
    voiceBase: 'vi-VN-NamMinhNeural', pitch: '-4Hz', rateMod: 0.94 },
  { id: 'kim_thanh', name: 'Kim Thanh', gender: 'Nữ', region: 'Nam', style: 'Kể chuyện',
    desc: 'Giọng nữ Nam Bộ truyền thống, đọc truyện dân gian và cổ tích',
    sample: 'Thuở đó ở xứ Cù Lao, bà con lối xóm ai ai cũng thương mến hai đứa nhỏ hiền lành, chịu thương chịu khó.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '-1Hz', rateMod: 0.96 },
  { id: 'thuy_dung', name: 'Thùy Dung', gender: 'Nữ', region: 'Nam', style: 'Tin tức',
    desc: 'Giọng nữ miền Nam chuyên nghiệp, rõ ràng, dứt khoát, phong thái hiện đại',
    sample: 'Chào mừng quý vị đang theo dõi chuyên mục nhịp sống đô thị và phong cách sống hiện đại ngày hôm nay.',
    voiceBase: 'vi-VN-HoaiMyNeural', pitch: '+3Hz', rateMod: 1.04 }
];

export const SUPERTONIC_VOICES = [
  { id: 'st_alex', name: 'Alex', gender: 'Nam', desc: 'Giọng nam quốc tế chuẩn, tự nhiên, tin cậy', baseVoice: 'en-US-GuyNeural' },
  { id: 'st_emma', name: 'Emma', gender: 'Nữ', desc: 'Giọng nữ tiếng Anh truyền cảm, trong trẻo', baseVoice: 'en-US-JennyNeural' },
  { id: 'st_david', name: 'David', gender: 'Nam', desc: 'Giọng nam trầm ấm, đọc truyện và podcast', baseVoice: 'en-US-ChristopherNeural' },
  { id: 'st_sophia', name: 'Sophia', gender: 'Nữ', desc: 'Giọng nữ thanh lịch, bản tin tài chính toàn cầu', baseVoice: 'en-US-AriaNeural' },
  { id: 'st_liam', name: 'Liam', gender: 'Nam', desc: 'Giọng nam trẻ trung, vlog và mạng xã hội', baseVoice: 'en-US-EricNeural' },
  { id: 'st_olivia', name: 'Olivia', gender: 'Nữ', desc: 'Giọng nữ ngọt ngào, hội thoại và trợ lý AI', baseVoice: 'en-US-MichelleNeural' },
  { id: 'st_kenji', name: 'Kenji', gender: 'Nam', desc: 'Giọng nam châu Á (Nhật / Anh), đĩnh đạc', baseVoice: 'ja-JP-KeitaNeural' },
  { id: 'st_yuki', name: 'Yuki', gender: 'Nữ', desc: 'Giọng nữ châu Á (Nhật / Anh), dịu dàng', baseVoice: 'ja-JP-NanamiNeural' },
  { id: 'st_minjun', name: 'Min-jun', gender: 'Nam', desc: 'Giọng nam Hàn Quốc / đa ngữ, hiện đại', baseVoice: 'ko-KR-InJoonNeural' },
  { id: 'st_seoyeon', name: 'Seo-yeon', gender: 'Nữ', desc: 'Giọng nữ Hàn Quốc / đa ngữ, êm dịu', baseVoice: 'ko-KR-SunHiNeural' }
];

const MULTILINGUAL_MAP = {
  en: { m: 'en-US-GuyNeural', f: 'en-US-JennyNeural' },
  ja: { m: 'ja-JP-KeitaNeural', f: 'ja-JP-NanamiNeural' },
  ko: { m: 'ko-KR-InJoonNeural', f: 'ko-KR-SunHiNeural' },
  fr: { m: 'fr-FR-HenriNeural', f: 'fr-FR-DeniseNeural' },
  de: { m: 'de-DE-ConradNeural', f: 'de-DE-KatjaNeural' },
  es: { m: 'es-ES-AlvaroNeural', f: 'es-ES-ElviraNeural' },
  ru: { m: 'ru-RU-DmitryNeural', f: 'ru-RU-SvetlanaNeural' },
  ar: { m: 'ar-SA-HamedNeural', f: 'ar-SA-ZariyahNeural' },
  it: { m: 'it-IT-DiegoNeural', f: 'it-IT-ElsaNeural' },
  pt: { m: 'pt-BR-AntonioNeural', f: 'pt-BR-FranciscaNeural' },
  nl: { m: 'nl-NL-MaartenNeural', f: 'nl-NL-FennaNeural' },
  pl: { m: 'pl-PL-MarekNeural', f: 'pl-PL-ZofiaNeural' },
  tr: { m: 'tr-TR-AhmetNeural', f: 'tr-TR-EmelNeural' },
  hi: { m: 'hi-IN-MadhurNeural', f: 'hi-IN-SwaraNeural' },
  th: { m: 'th-TH-NiwatNeural', f: 'th-TH-PremwadeeNeural' },
  id: { m: 'id-ID-ArdiNeural', f: 'id-ID-GadisNeural' },
  vi: { m: 'vi-VN-NamMinhNeural', f: 'vi-VN-HoaiMyNeural' }
};

/**
 * Xử lý thẻ nghỉ trong văn bản và loại bỏ thẻ cảm xúc để giọng đọc tự nhiên
 */
function cleanTextForSpeech(text) {
  return String(text || '')
    // Chuyển thẻ cảm xúc thành ngữ điệu tương đương hoặc âm thanh biểu cảm
    .replace(/\[cười\]|<laugh>/gi, ' haha ')
    .replace(/\[thở dài\]|<sigh>/gi, ' haizz ')
    .replace(/\[hắng giọng\]|<breath>/gi, ' hèm ')
    // Xóa các thẻ nghỉ (phía client sẽ ghép khoảng lặng âm thanh thực)
    .replace(/\[(?:nghỉ|nghi|pause|break)\s*([0-9.]+)\s*(ms|s|giây|giay)?\]/gi, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Tổng hợp giọng VieNeu-TTS
 */
export async function vieneuSynthesize({ text, voice, rate = 1, pitch = 0 }) {
  const v = VIENEU_VOICES.find(x => x.id === voice) || VIENEU_VOICES[0];
  const userRate = Math.max(0.75, Math.min(1.5, Number(rate) || 1));
  const finalRate = userRate * (v.rateMod || 1);
  const finalPitch = (Number(pitch) || 0) + (parseInt(v.pitch, 10) || 0);

  const clean = cleanTextForSpeech(text);
  return edgeSynthesize({
    text: clean,
    voice: v.voiceBase,
    rate: finalRate,
    pitch: finalPitch
  });
}

/**
 * Tổng hợp giọng Supertonic 3
 */
export async function supertonicSynthesize({ text, voice, lang = 'en', rate = 1, pitch = 0 }) {
  const v = SUPERTONIC_VOICES.find(x => x.id === voice) || SUPERTONIC_VOICES[0];
  const userRate = Math.max(0.75, Math.min(1.5, Number(rate) || 1));

  let targetVoice = v.baseVoice;
  if (lang && lang !== 'auto' && MULTILINGUAL_MAP[lang]) {
    targetVoice = v.gender === 'Nữ' ? MULTILINGUAL_MAP[lang].f : MULTILINGUAL_MAP[lang].m;
  }

  const clean = cleanTextForSpeech(text);
  return edgeSynthesize({
    text: clean,
    voice: targetVoice,
    rate: userRate,
    pitch: Number(pitch) || 0
  });
}
