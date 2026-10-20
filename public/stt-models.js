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
  ['multi', 'Đa ngôn ngữ · chạy được trên mọi máy'],
  ['multi-gpu', 'Đa ngôn ngữ · độ chính xác cao · cần WebGPU'],
  ['lang', 'Chuyên một ngôn ngữ']
];

self.STT_MODELS = {
  'onnx-community/PhoWhisper-base-ONNX': {
    group: 'vi', name: 'PhoWhisper Base (VinAI) — tinh chỉnh riêng cho tiếng Việt', size: '~200–300 MB', lang: 'vietnamese',
    family: 'whisper', gpu: ['fp32', 'fp32'], noTimestamps: true,
    hint: 'PhoWhisper của VinAI, huấn luyện thêm trên 844 giờ tiếng Việt nhiều vùng miền. Nhận tiếng Việt tốt hơn hẳn Whisper cùng cỡ. Tải ~180 MB (CPU) hoặc ~290 MB (WebGPU). Kết quả thường viết thường, ít dấu câu và mốc thời gian chỉ là ước lượng.'
  },

  'onnx-community/whisper-tiny': {
    group: 'multi', name: 'Whisper Tiny — siêu nhẹ, nháp nhanh', size: '~40 MB', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Siêu nhẹ (~40 MB), chạy nhanh trên mọi máy nhưng sai nhiều. Hợp để nghe nháp hoặc tiếng Anh rõ ràng.'
  },
  'onnx-community/whisper-base': {
    group: 'multi', name: 'Whisper Base — nhẹ, hợp tiếng Anh', size: '~80 MB', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Rất nhẹ (~80 MB) nhưng tiếng Việt thường sai hoặc lặp từ. Chỉ nên dùng cho tiếng Anh; tiếng Việt hãy chọn PhoWhisper hoặc Small trở lên.'
  },
  'onnx-community/whisper-small': {
    group: 'multi', name: 'Whisper Small — cân bằng', size: '~250 MB', family: 'whisper', gpu: ['fp16', 'q4'], default: true,
    hint: 'Lần đầu mô hình tải về một lần (~250 MB) rồi lưu cache, các lần sau chạy ngay, kể cả offline.'
  },

  'onnx-community/whisper-medium-ONNX': {
    group: 'multi-gpu', name: 'Whisper Medium — chính xác hơn Small', size: '~680 MB', family: 'whisper', gpu: ['q4', 'q4'], gpuOnly: true,
    hint: 'Chính xác hơn Small rõ rệt với tiếng Việt. Cần WebGPU, tải ~680 MB lần đầu.'
  },
  'onnx-community/whisper-large-v3-turbo': {
    group: 'multi-gpu', name: 'Whisper Large v3 Turbo — nhanh & chính xác', size: '~600 MB', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true,
    hint: 'Nhanh và chính xác, cần trình duyệt có WebGPU (Chrome/Edge mới) và ~600 MB tải lần đầu.'
  },
  'onnx-community/whisper-large-v3-ONNX': {
    group: 'multi-gpu', name: 'Whisper Large v3 — chính xác nhất, rất nặng', size: '~1 GB', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true,
    hint: 'Bản Large v3 đầy đủ, chính xác nhất nhưng chậm hơn Turbo và tải ~1 GB. Cần WebGPU và máy có nhiều RAM/VRAM.'
  },

  'onnx-community/moonshine-base-ONNX': {
    group: 'lang', name: 'English · Moonshine Base — rất nhanh, nhẹ', size: '~65 MB', lang: 'english', family: 'moonshine', gpu: ['fp32', 'fp32'],
    hint: 'Moonshine (Useful Sensors) chỉ cho tiếng Anh: nhẹ ~65 MB, chạy nhanh hơn Whisper nhiều lần và chính xác hơn Whisper Base.'
  },
  'onnx-community/kotoba-whisper-v2.2-ONNX': {
    group: 'lang', name: '日本語 · Kotoba-Whisper v2.2', size: '~730 MB', lang: 'japanese', family: 'whisper',
    gpu: ['q4', 'q4'], gpuOnly: true,
    hint: 'Kotoba-Whisper (Kotoba Technologies) tinh chỉnh từ Whisper Large v3 cho tiếng Nhật. Cần WebGPU.'
  },
  'onnx-community/whisper-small-cv11-french-ONNX': {
    group: 'lang', name: 'Français · Whisper Small (Common Voice 11)', size: '~400 MB', lang: 'french', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Whisper Small tinh chỉnh cho tiếng Pháp trên Common Voice 11.'
  },
  'onnx-community/whisper-large-v3-turbo-german-ONNX': {
    group: 'lang', name: 'Deutsch · Whisper Large v3 Turbo German', size: '~565 MB', lang: 'german', family: 'whisper',
    gpu: ['q4f16', 'q4f16'], gpuNoF16: ['q4', 'q4'], gpuOnly: true,
    hint: 'Whisper Large v3 Turbo tinh chỉnh cho tiếng Đức. Cần WebGPU.'
  },
  'onnx-community/whisper-small-ita-ONNX': {
    group: 'lang', name: 'Italiano · Whisper Small', size: '~400 MB', lang: 'italian', family: 'whisper', gpu: ['fp16', 'q4'],
    hint: 'Whisper Small tinh chỉnh cho tiếng Ý.'
  },
  'onnx-community/whisper-large-v3-turbo-russian-ONNX': {
    group: 'lang', name: 'Русский · Whisper Large v3 Turbo Russian', size: '~800 MB', lang: 'russian', family: 'whisper',
    gpu: ['q4', 'q4'], gpuOnly: true,
    hint: 'Whisper Large v3 Turbo tinh chỉnh cho tiếng Nga. Cần WebGPU, tải ~800 MB.'
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
