/* TXA Voice - danh mục mô hình Giọng → Chữ chạy trong trình duyệt (Transformers.js, tải từ Hugging Face).
   Dùng chung cho giao diện (app.js) và stt-worker.js.

   family:  whisper  = Whisper và bản tinh chỉnh (có mốc thời gian, tự chia đoạn 30 giây)
            moonshine = chia đoạn ~25 giây thủ công, mốc thời gian theo từng đoạn
   gpu:     lượng tử hóa khi chạy WebGPU [encoder, decoder]
   gpuNoF16: thay thế khi GPU không hỗ trợ shader-f16
   cpu:     lượng tử hóa khi chạy CPU (WASM), mặc định q8
   gpuOnly: mô hình lớn, bắt buộc WebGPU
   cpuOnly: bản ONNX chạy sai trên WebGPU, luôn chạy CPU
   lang:    mô hình chỉ làm một ngôn ngữ -> ép ngôn ngữ này khi nhận diện
   noTimestamps: mô hình không học mốc thời gian, ước lượng theo độ dài câu
   Đã chạy thử từng mô hình: một số bản fp16 / q4f16 ra chữ lặp vô nghĩa nên ghi rõ dtype dùng được. */

self.STT_GROUPS = [
  ['vi', 'Tiếng Việt'],
  ['multi-free', 'Đa ngôn ngữ · Miễn phí cho mọi máy'],
  ['premium-pro', '👑 Model Độc Quyền (Gói Premium) · Siêu chính xác'],
  ['lang', 'Chuyên từng ngôn ngữ quốc tế']
];

self.STT_MODELS = {
  'onnx-community/PhoWhisper-base-ONNX': {
    group: 'vi', name: 'PhoWhisper Base (VinAI) — tinh chỉnh riêng cho tiếng Việt', size: '~200–300 MB', lang: 'vietnamese',
    family: 'whisper', gpu: ['fp32', 'fp32'], noTimestamps: true, premium: true,
    hint: 'PhoWhisper của VinAI, huấn luyện trên 844 giờ tiếng Việt nhiều vùng miền. Nhận diện chuẩn xác ngữ cảnh tiếng Việt (dành riêng cho gói Premium). Tải ~180 MB (CPU) hoặc ~290 MB (WebGPU).'
  },

  'onnx-community/whisper-small': {
    group: 'multi-free', name: 'Whisper Small — cân bằng, ổn định (Khuyên dùng)', size: '~250 MB', family: 'whisper', gpu: ['fp16', 'q4'], default: true,
    hint: 'Mô hình cân bằng tốt giữa tốc độ và độ chính xác, miễn phí cho mọi tài khoản. Tải một lần ~250 MB rồi lưu cache offline.'
  },
  'onnx-community/whisper-base': {
    group: 'multi-free', name: 'Whisper Base — nhẹ, hợp tiếng Anh', size: '~80 MB', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Rất nhẹ (~80 MB) nhưng tiếng Việt dễ nhầm từ. Miễn phí cho mọi tài khoản; khuyên dùng cho tiếng Anh hoặc máy cấu hình vừa.'
  },
  'onnx-community/whisper-tiny': {
    group: 'multi-free', name: 'Whisper Tiny — siêu nhẹ, nháp nhanh', size: '~40 MB', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Siêu nhẹ (~40 MB), nhận diện siêu tốc trên mọi thiết bị. Phù hợp nghe nháp nhanh.'
  },
  'onnx-community/moonshine-tiny-ONNX': {
    group: 'multi-free', name: 'Moonshine Tiny — siêu tốc 5x, tiếng Anh', size: '~35 MB', lang: 'english', family: 'moonshine', gpu: ['fp32', 'fp32'],
    hint: 'Mô hình Moonshine Tiny của Useful Sensors: cực nhẹ ~35 MB, tốc độ xử lý nhanh gấp 5 lần Whisper.'
  },

  'onnx-community/whisper-large-v3-turbo': {
    group: 'premium-pro', name: 'Whisper Large v3 Turbo — nhanh & chuẩn xác nhất (OpenAI)', size: '~600 MB', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Đỉnh cao AI nhận diện giọng nói từ OpenAI thế hệ v3 Turbo. Độ chuẩn xác cao nhất hiện nay, tốc độ siêu tốc. Độc quyền gói Premium (cần WebGPU).'
  },
  'onnx-community/whisper-large-v3-ONNX': {
    group: 'premium-pro', name: 'Whisper Large v3 — độ chính xác tối đa SOTA', size: '~1 GB', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Bản Whisper Large v3 đầy đủ 1.55B tham số, nhận diện âm thanh nhiễu và từ chuyên ngành xuất sắc nhất. Độc quyền gói Premium.'
  },
  'onnx-community/whisper-medium-ONNX': {
    group: 'premium-pro', name: 'Whisper Medium — nhận diện sâu, chính xác cao', size: '~680 MB', family: 'whisper',
    gpu: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Chính xác vượt trội với tiếng Việt phức tạp và từ ngữ học thuật. Độc quyền gói Premium (cần WebGPU).'
  },
  'onnx-community/kotoba-whisper-v2.2-ONNX': {
    group: 'premium-pro', name: '日本語 · Kotoba-Whisper v2.2 (SOTA Tiếng Nhật)', size: '~730 MB', lang: 'japanese', family: 'whisper',
    gpu: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Kotoba-Whisper v2.2 tinh chỉnh từ Large v3 chuyên sâu tiếng Nhật, độ chuẩn xác hàng đầu thế giới. Độc quyền gói Premium.'
  },
  'onnx-community/whisper-large-v3-turbo-korean-ONNX': {
    group: 'premium-pro', name: '한국어 · Whisper Large v3 Turbo Korean', size: '~600 MB', lang: 'korean', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Whisper Large v3 Turbo chuyên biệt cho tiếng Hàn Quốc, tốc độ và độ chính xác vượt trội. Độc quyền gói Premium.'
  },
  'onnx-community/whisper-large-v3-turbo-spanish-ONNX': {
    group: 'premium-pro', name: 'Español · Whisper Large v3 Turbo Spanish', size: '~600 MB', lang: 'spanish', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Whisper Large v3 Turbo tinh chỉnh riêng cho tiếng Tây Ban Nha. Độc quyền gói Premium.'
  },
  'onnx-community/whisper-large-v3-turbo-german-ONNX': {
    group: 'premium-pro', name: 'Deutsch · Whisper Large v3 Turbo German', size: '~565 MB', lang: 'german', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Whisper Large v3 Turbo tinh chỉnh cho tiếng Đức. Độc quyền gói Premium (cần WebGPU).'
  },
  'onnx-community/whisper-large-v3-turbo-russian-ONNX': {
    group: 'premium-pro', name: 'Русский · Whisper Large v3 Turbo Russian', size: '~800 MB', lang: 'russian', family: 'whisper',
    gpu: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Whisper Large v3 Turbo tinh chỉnh cho tiếng Nga. Độc quyền gói Premium (cần WebGPU).'
  },
  'onnx-community/whisper-large-v3-turbo-cantonese-ONNX': {
    group: 'premium-pro', name: '粤语 · Whisper Large v3 Turbo Cantonese', size: '~600 MB', lang: 'chinese', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true, premium: true,
    hint: 'Whisper Large v3 Turbo chuyên biệt cho tiếng Quảng Đông (Cantonese). Độc quyền gói Premium.'
  },

  'onnx-community/moonshine-base-ONNX': {
    group: 'lang', name: 'English · Moonshine Base — rất nhanh, nhẹ', size: '~65 MB', lang: 'english', family: 'moonshine', gpu: ['fp32', 'fp32'],
    hint: 'Moonshine (Useful Sensors) chỉ cho tiếng Anh: nhẹ ~65 MB, chạy nhanh hơn Whisper nhiều lần và chính xác hơn Whisper Base.'
  },
  'onnx-community/whisper-small-cv11-french-ONNX': {
    group: 'lang', name: 'Français · Whisper Small (Common Voice 11)', size: '~400 MB', lang: 'french', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Whisper Small tinh chỉnh cho tiếng Pháp trên Common Voice 11.'
  },
  'onnx-community/whisper-small-ita-ONNX': {
    group: 'lang', name: 'Italiano · Whisper Small', size: '~400 MB', lang: 'italian', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Whisper Small tinh chỉnh cho tiếng Ý.'
  },
  'onnx-community/whisper-small-fa-ONNX': {
    group: 'lang', name: 'فارسی · Whisper Small Persian', size: '~400 MB', lang: 'persian', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Whisper Small tinh chỉnh cho tiếng Ba Tư.'
  },
  'onnx-community/kb-whisper-small-ONNX': {
    group: 'lang', name: 'Svenska · KB-Whisper Small', size: '~400 MB', lang: 'swedish', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'KB-Whisper của Thư viện Quốc gia Thụy Điển, huấn luyện trên 50.000 giờ tiếng Thụy Điển.'
  },
  'onnx-community/nb-whisper-small-ONNX': {
    group: 'lang', name: 'Norsk · NB-Whisper Small', size: '~400 MB', lang: 'norwegian', family: 'whisper', gpu: ['fp16', 'q4'], cpuOnly: true,
    hint: 'NB-Whisper của Thư viện Quốc gia Na Uy, tinh chỉnh cho tiếng Na Uy (Bokmål).'
  }
};
