// Whisper chạy hoàn toàn trong trình duyệt (Transformers.js) - miễn phí, không cần API key.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2/+esm';

env.allowLocalModels = false;

let asr = null;
let loadedKey = '';

const send = (msg) => self.postMessage(msg);

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

function pickDtype(modelId, device, f16) {
  if (device === 'wasm') return { encoder_model: 'q8', decoder_model_merged: 'q8' };
  if (modelId.includes('large-v3-turbo')) {
    return f16
      ? { encoder_model: 'q4f16', decoder_model_merged: 'q4f16' }
      : { encoder_model: 'q4', decoder_model_merged: 'q4' };
  }
  return { encoder_model: f16 ? 'fp16' : 'fp32', decoder_model_merged: 'q4' };
}

async function load(modelId, forceWasm) {
  const info = forceWasm ? { device: 'wasm', f16: false } : await detectDevice();
  if (modelId.includes('large-v3-turbo') && info.device !== 'webgpu') {
    throw new Error('Mô hình "Chính xác" cần WebGPU (Chrome/Edge mới). Hãy chọn mô hình Cân bằng hoặc Nhanh.');
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
  asr = await pipeline('automatic-speech-recognition', modelId, {
    device: info.device,
    dtype: pickDtype(modelId, info.device, info.f16),
    progress_callback
  });
  loadedKey = key;
  return info.device;
}

self.onmessage = async (e) => {
  const { type } = e.data;
  if (type !== 'transcribe') return;
  const { audio, modelId, language, duration } = e.data;

  try {
    send({ type: 'status', message: 'Đang tải mô hình (chỉ lần đầu, sau đó lưu cache)...' });
    let device;
    try {
      device = await load(modelId, false);
    } catch (err) {
      if (/WebGPU/.test(err.message)) throw err;
      send({ type: 'status', message: 'WebGPU lỗi, chuyển sang chế độ CPU...' });
      device = await load(modelId, true);
    }
    send({ type: 'device', device });
    send({ type: 'status', message: 'Đang nhận diện giọng nói...' });

    const totalChunks = Math.max(1, Math.ceil((duration || 30) / 20));
    let done = 0;
    const started = performance.now();

    const output = await asr(audio, {
      language: language && language !== 'auto' ? language : null,
      task: 'transcribe',
      return_timestamps: true,
      chunk_length_s: 30,
      stride_length_s: 5,
      chunk_callback: () => {
        done++;
        send({ type: 'progress', ratio: Math.min(0.99, done / totalChunks) });
      }
    });

    const segments = (output.chunks || []).map((c, i) => ({
      id: i + 1,
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
      text: c.text.trim()
    })).filter(s => s.text);

    send({
      type: 'result',
      text: output.text.trim(),
      segments,
      elapsed: (performance.now() - started) / 1000,
      device
    });
  } catch (err) {
    send({ type: 'error', message: err?.message || String(err) });
  }
};
