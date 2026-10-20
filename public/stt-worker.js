// Giọng → Chữ chạy hoàn toàn trong trình duyệt (Transformers.js) - miễn phí, không cần API key.
// Danh mục mô hình và cấu hình lượng tử hóa nằm trong stt-models.js.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm';
import './stt-models.js';

env.allowLocalModels = false;

// Trên website (Cloudflare Worker) tải mô hình qua proxy /hf/ cùng tên miền: tránh CORS và giới hạn tải của Hugging Face.
// Chạy bằng start.bat (không có proxy) thì giữ nguyên tải thẳng từ Hugging Face.
const hostReady = fetch('/hf/health', { cache: 'no-store' })
  .then(r => { if (r.ok) env.remoteHost = self.location.origin + '/hf/'; })
  .catch(() => {});

let asr = null;
let loadedKey = '';

const send = (msg) => self.postMessage(msg);
const modelCfg = (id) => self.STT_MODELS[id] || { family: 'whisper', gpu: ['fp16', 'q4'] };

async function detectDevice() {
  if (!self.navigator?.gpu) return { device: 'wasm', f16: false };
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return { device: 'wasm', f16: false };
    return { device: 'webgpu', f16: adapter.features.has('shader-f16') };
  } catch {
    return { device: 'wasm', f16: false };
  }
}

function pickDtype(cfg, device, f16) {
  if (device === 'wasm') {
    const c = cfg.cpu || 'q8';
    return { encoder_model: c, decoder_model_merged: c };
  }
  let [enc, dec] = !f16 && cfg.gpuNoF16 ? cfg.gpuNoF16 : cfg.gpu;
  if (!f16 && enc === 'fp16') enc = 'fp32';
  if (!f16 && dec === 'fp16') dec = 'fp32';
  return { encoder_model: enc, decoder_model_merged: dec };
}

async function load(modelId, forceWasm) {
  const cfg = modelCfg(modelId);
  const info = forceWasm || cfg.cpuOnly ? { device: 'wasm', f16: false } : await detectDevice();
  if (cfg.gpuOnly && info.device !== 'webgpu') {
    throw new Error('Mô hình này cần WebGPU (Chrome/Edge bản mới, bật tăng tốc phần cứng). Hãy chọn mô hình chạy được trên mọi máy.');
  }
  const key = `${modelId}|${info.device}`;
  if (asr && loadedKey === key) return info.device;

  const files = {};
  const progress_callback = (p) => {
    if (p.status === 'progress' && p.total) {
      files[p.file] = { loaded: p.loaded, total: p.total };
      let loaded = 0, total = 0;
      for (const f of Object.values(files)) { loaded += f.loaded; total += f.total; }
      send({ type: 'load-progress', loaded, total });
    } else if (p.status === 'ready') {
      send({ type: 'load-progress', loaded: 1, total: 1 });
    }
  };

  if (asr) { try { await asr.dispose(); } catch {} asr = null; }
  await hostReady;
  asr = await pipeline('automatic-speech-recognition', modelId, {
    device: info.device,
    dtype: pickDtype(cfg, info.device, info.f16),
    progress_callback
  });
  loadedKey = key;
  return info.device;
}

/** Cắt phần lặp vô nghĩa mà Whisper hay sinh ra ở cuối (".........", "S.S.S.S", "ha ha ha ha ha ...") */
function cleanRepeats(t) {
  return String(t || '')
    .replace(/([.,!?…。，！？-])\1{3,}/g, '$1')
    .replace(/(\S.{0,11}?)(?:\s*\1){4,}/g, (m, unit) => (/^[\d.,\s]+$/.test(unit) ? m : unit)) // giữ nguyên số như 1000000
    .trim();
}

/** Không có mốc thời gian: chia câu và ước lượng thời gian theo độ dài chữ */
function estimateSegments(text, start, end, firstId = 1) {
  const parts = (text.match(/[^.!?…。！？]+[.!?…。！？]*/g) || [text]).map(t => t.trim()).filter(Boolean);
  const total = parts.reduce((n, t) => n + t.length, 0) || 1;
  let t = start;
  return parts.map((p, i) => {
    const d = (end - start) * (p.length / total);
    const seg = { id: firstId + i, start: t, end: t + d, text: p };
    t += d;
    return seg;
  });
}

/** Cắt âm thanh thành các đoạn ~25 giây, ưu tiên cắt ở chỗ lặng nhất trong 4 giây cuối mỗi đoạn */
function windows(audio, sr = 16000, len = 25, seek = 4) {
  const out = [];
  let pos = 0;
  while (pos < audio.length) {
    let end = Math.min(audio.length, pos + len * sr);
    if (end < audio.length) {
      const from = end - seek * sr, step = sr / 50;
      let best = end, bestE = Infinity;
      for (let i = from; i + step <= end; i += step) {
        let e = 0;
        for (let k = i; k < i + step; k++) e += audio[k] * audio[k];
        if (e < bestE) { bestE = e; best = i + step / 2; }
      }
      end = Math.round(best);
    }
    out.push({ start: pos / sr, end: end / sr, data: audio.subarray(pos, end) });
    pos = end;
  }
  return out;
}

/** Moonshine / wav2vec2: chạy từng đoạn ngắn, mốc thời gian theo đoạn */
async function transcribeWindows(audio) {
  const parts = windows(audio);
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    const w = parts[i];
    const out = await asr(w.data);
    const text = cleanRepeats(out.text);
    if (text) segments.push(...estimateSegments(text, w.start, w.end, segments.length + 1));
    send({ type: 'progress', ratio: Math.min(0.99, (i + 1) / parts.length) });
  }
  return { text: segments.map(s => s.text).join(' '), segments };
}

async function transcribeWhisper(audio, cfg, language, duration) {
  const totalChunks = Math.max(1, Math.ceil((duration || 30) / 20));
  const run = async (timestamps) => {
    let done = 0;
    return asr(audio, {
      language: language && language !== 'auto' ? language : null,
      task: 'transcribe',
      return_timestamps: timestamps,
      chunk_length_s: 30,
      stride_length_s: 5,
      chunk_callback: () => send({ type: 'progress', ratio: Math.min(0.99, ++done / totalChunks) })
    });
  };
  let timestamps = !cfg.noTimestamps;
  let output = await run(timestamps);
  output.text = cleanRepeats(output.text);
  // Một số bản tinh chỉnh không học mốc thời gian: bật timestamps ra rỗng -> chạy lại không mốc thời gian
  if (timestamps && !output.text.trim()) { timestamps = false; output = await run(false); }
  const segments = timestamps
    ? (output.chunks || []).map((c, i) => ({
      id: i + 1,
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
      text: cleanRepeats(c.text)
    })).filter(s => s.text)
    : estimateSegments(output.text.trim(), 0, duration || 0);
  return { text: output.text.trim(), segments };
}

self.onmessage = async (e) => {
  if (e.data.type !== 'transcribe') return;
  const { audio, modelId, duration } = e.data;
  const cfg = modelCfg(modelId);
  const language = cfg.lang || e.data.language;

  try {
    send({ type: 'status', message: 'Đang tải mô hình (chỉ lần đầu, sau đó lưu cache)...' });
    let device;
    try {
      device = await load(modelId, !!e.data.cpuOnly);
    } catch (err) {
      if (/WebGPU/.test(err.message) || e.data.cpuOnly) throw err;
      send({ type: 'status', message: 'WebGPU lỗi, chuyển sang chế độ CPU...' });
      device = await load(modelId, true);
    }
    send({ type: 'device', device });
    send({ type: 'status', message: 'Đang nhận diện giọng nói...' });

    const started = performance.now();
    const out = cfg.family === 'whisper' ? await transcribeWhisper(audio, cfg, language, duration) : await transcribeWindows(audio);
    send({ type: 'result', text: out.text, segments: out.segments, elapsed: (performance.now() - started) / 1000, device });
  } catch (err) {
    send({ type: 'error', message: err?.message || String(err) });
  }
};
