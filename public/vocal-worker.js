// Tách giọng hát / giọng nói khỏi nhạc nền ngay trong trình duyệt (MDX-Net "UVR-MDX-NET Voc FT" qua ONNX Runtime Web).
// Chạy trước bước nhận diện để Whisper chỉ nghe giọng, không bị nhạc đè. Tiền xử lý STFT / hậu xử lý iSTFT nằm ở vocal-dsp.js.
import * as ort from 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/ort.webgpu.min.mjs';
import './vocal-dsp.js';

ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';
ort.env.wasm.proxy = false;

const REPO_PATH = 'Politrees/UVR_resources/resolve/main/models/MDXNet/UVR-MDX-NET-Voc_FT.onnx';
// Thông số theo bảng model_data của UVR (đã thử so với n_fft 6144: 7680 tách sạch hơn ~3 dB)
const MODEL = { nFft: 7680, hop: 1024, dimF: 3072, dimT: 256, compensate: 1.021 };
const CACHE = 'vk-models-v1';

const send = (msg, transfer) => self.postMessage(msg, transfer || []);

// Trên website tải qua proxy /hf/ cùng tên miền (nhanh, có cache); chạy riêng thì tải thẳng từ Hugging Face
async function modelUrl() {
  try {
    const r = await fetch('/hf/health', { cache: 'no-store' });
    if (r.ok) return `${self.location.origin}/hf/${REPO_PATH}`;
  } catch {}
  return `https://huggingface.co/${REPO_PATH}`;
}

/** Tải mô hình (~67 MB) kèm tiến độ, lưu vào Cache Storage để lần sau không phải tải lại */
async function fetchModel() {
  const url = await modelUrl();
  let cache = null;
  try { cache = await caches.open(CACHE); } catch {}
  const hit = cache && await cache.match(url);
  if (hit) { send({ type: 'load-progress', loaded: 1, total: 1 }); return new Uint8Array(await hit.arrayBuffer()); }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được mô hình tách giọng (HTTP ${res.status}).`);
  const total = Number(res.headers.get('Content-Length')) || 66762490;
  const reader = res.body.getReader(), parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length;
    send({ type: 'load-progress', loaded, total: Math.max(total, loaded) });
  }
  const buf = new Uint8Array(loaded);
  let o = 0;
  for (const p of parts) { buf.set(p, o); o += p.length; }
  if (cache) { try { await cache.put(url, new Response(buf, { headers: { 'Content-Type': 'application/octet-stream' } })); } catch {} }
  return buf;
}

let session = null, device = '';
async function loadSession(cpuOnly) {
  const want = cpuOnly ? 'wasm' : '';
  if (session && (!want || device === want)) return;
  session = null;
  const bytes = await fetchModel();
  send({ type: 'status', message: 'Đang khởi động mô hình tách giọng…' });
  const hasGpu = !!self.navigator?.gpu && !cpuOnly;
  const providers = hasGpu ? [['webgpu'], ['wasm']] : [['wasm']];
  let lastErr;
  for (const p of providers) {
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: p, graphOptimizationLevel: 'all' });
      device = p[0];
      return;
    } catch (e) { lastErr = e; }
  }
  throw new Error('Không khởi động được mô hình tách giọng: ' + (lastErr?.message || lastErr));
}

async function separate({ left, right, params, cpuOnly }) {
  await loadSession(cpuOnly);
  const cfg = { ...MODEL, ...(params || {}) };
  const mdx = self.vkDsp.makeMdx(cfg);
  const n = left.length;
  const chunks = Math.ceil(n / mdx.gen);
  const vocals = new Float32Array(n);
  const oL = new Float32Array(mdx.chunk), oR = new Float32Array(mdx.chunk);
  const inName = session.inputNames[0], outName = session.outputNames[0];
  const t0 = performance.now();

  for (let c = 0; c < chunks; c++) {
    // Đoạn c phủ [c*gen - trim, c*gen - trim + chunk); chỉ giữ phần giữa gen mẫu, phần rìa (trim) bỏ để tránh lỗi biên
    const start = c * mdx.gen - mdx.trim;
    const spec = mdx.stft(left, right, start);
    const out = await session.run({ [inName]: new ort.Tensor('float32', spec, [1, 4, cfg.dimF, cfg.dimT]) });
    const pred = out[outName].data;
    mdx.istft(pred, oL, oR);
    out[outName].dispose?.();
    const from = c * mdx.gen, len = Math.min(mdx.gen, n - from);
    for (let i = 0; i < len; i++) vocals[from + i] = (oL[mdx.trim + i] + oR[mdx.trim + i]) / 2 * cfg.compensate;

    const done = c + 1, el = (performance.now() - t0) / 1000;
    send({ type: 'progress', ratio: done / chunks, done, total: chunks, eta: el / done * (chunks - done) });
  }
  return vocals;
}

self.onmessage = async (e) => {
  if (e.data.type !== 'separate') return;
  try {
    send({ type: 'status', message: 'Đang tải mô hình tách giọng (chỉ lần đầu, sau đó lưu cache)…' });
    const started = performance.now();
    const vocals = await separate(e.data);
    send({ type: 'result', vocals, device, elapsed: (performance.now() - started) / 1000 }, [vocals.buffer]);
  } catch (err) {
    send({ type: 'error', message: err?.message || String(err) });
  }
};
