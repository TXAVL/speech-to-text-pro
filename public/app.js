'use strict';
/* VoiceKit - Giọng nói <-> Văn bản. Whisper chạy trong trình duyệt, TTS Edge Neural qua server. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

const state = {
  media: null,          // { blob, name, size, duration }
  raw: [],              // segments gốc từ mô hình
  view: [],             // segments hiển thị (đã chia theo độ dài phụ đề)
  text: '',
  meta: {},
  viewMode: 'timeline',
  worker: null,
  busy: false,
  server: { online: false, hasGemini: false, hasGroq: false }
};

/* ---------------- Tiện ích ---------------- */
function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
const pad = (n, l = 2) => String(n).padStart(l, '0');
function clock(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60);
  return (h ? pad(h) + ':' : '') + pad(m) + ':' + pad(s);
}
function stamp(sec, sep) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60);
  const ms = Math.round((sec % 1) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(s)}${sep}${pad(Math.min(ms, 999), 3)}`;
}
function fmtSize(b) { return b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB'; }
function download(name, data, type) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
async function api(path, opts) {
  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  const body = ct.includes('json') ? await res.json() : null;
  if (!res.ok) throw new Error(body?.error || `Lỗi máy chủ (${res.status})`);
  return body ?? res;
}

/* ---------------- Điều hướng ---------------- */
function showView(name) {
  $$('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'history') renderHistory();
  if (name === 'tts') initTts();
  window.scrollTo({ top: 0 });
}
$$('.main-tab').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

$$('#source-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
  $$('#source-seg .seg-btn').forEach(x => x.classList.toggle('active', x === b));
  $$('.src-panel').forEach(p => p.classList.toggle('active', p.id === 'src-' + b.dataset.src));
}));

function openModal(id) { $(id).hidden = false; }
$$('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m || e.target.hasAttribute('data-close')) m.hidden = true; });
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.modal').forEach(m => m.hidden = true); });

/* ---------------- Âm thanh đầu vào ---------------- */
async function decodeTo16kMono(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx({ sampleRate: 16000 });
  try {
    const audio = await ctx.decodeAudioData(buf);
    const ch = audio.numberOfChannels;
    const out = new Float32Array(audio.length);
    for (let c = 0; c < ch; c++) {
      const data = audio.getChannelData(c);
      for (let i = 0; i < out.length; i++) out[i] += data[i] / ch;
    }
    return { data: out, duration: audio.duration };
  } finally { ctx.close(); }
}

async function setMedia(blob, name) {
  state.media = { blob, name, size: blob.size, duration: 0 };
  const player = $('#player');
  player.src = URL.createObjectURL(blob);
  $('#media-name').textContent = name;
  $('#media-meta').textContent = fmtSize(blob.size) + ' · đang đọc…';
  $('#media-card').hidden = false;
  $('#btn-run').disabled = false;
  try {
    const { duration } = await decodeTo16kMono(blob);
    state.media.duration = duration;
    $('#media-meta').textContent = `${fmtSize(blob.size)} · ${clock(duration)}`;
  } catch {
    $('#media-meta').textContent = fmtSize(blob.size);
  }
}
function clearMedia() {
  state.media = null;
  $('#player').removeAttribute('src');
  $('#media-card').hidden = true;
  $('#btn-run').disabled = true;
  $('#file-input').value = '';
}
$('#btn-clear-media').addEventListener('click', clearMedia);

const dz = $('#dropzone');
$('#file-input').addEventListener('change', e => { const f = e.target.files[0]; if (f) setMedia(f, f.name); });
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) setMedia(f, f.name); });

$('#btn-fetch-url').addEventListener('click', async () => {
  const url = $('#url-input').value.trim();
  if (!url) return toast('Hãy dán link file âm thanh/video.', 'err');
  const btn = $('#btn-fetch-url'); btn.disabled = true; btn.textContent = 'Đang tải…';
  try {
    let blob, name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'audio');
    try { const r = await fetch(url); if (!r.ok) throw 0; blob = await r.blob(); }
    catch {
      const info = await api('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
        .catch(() => { throw new Error('Không tải được link này (trang chặn CORS). Hãy tải file về rồi kéo thả vào.'); });
      blob = await (await fetch(info.url)).blob(); name = info.originalName || name;
    }
    await setMedia(blob, name);
    toast('Đã tải file từ link.', 'ok');
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; btn.textContent = 'Tải';
});

/* ---------------- Ghi âm ---------------- */
const rec = { mr: null, chunks: [], stream: null, timer: null, t0: 0, raf: 0, actx: null };
async function startRec() {
  try {
    rec.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch { return toast('Không truy cập được micro. Hãy cho phép quyền micro (cần HTTPS hoặc localhost).', 'err'); }
  rec.chunks = [];
  rec.mr = new MediaRecorder(rec.stream);
  rec.mr.ondataavailable = e => e.data.size && rec.chunks.push(e.data);
  rec.mr.onstop = async () => {
    cancelAnimationFrame(rec.raf);
    rec.stream.getTracks().forEach(t => t.stop());
    rec.actx?.close();
    clearInterval(rec.timer);
    const blob = new Blob(rec.chunks, { type: rec.mr.mimeType || 'audio/webm' });
    await setMedia(blob, `ghi-am-${new Date().toLocaleTimeString('vi-VN').replace(/:/g, '-')}.webm`);
    $('#mic-hint').textContent = 'Đã ghi xong. Bấm để ghi lại hoặc chuyển đổi bên dưới.';
  };
  rec.mr.start(250);
  rec.t0 = Date.now();
  rec.timer = setInterval(() => { $('#mic-time').textContent = clock((Date.now() - rec.t0) / 1000); }, 250);
  $('#btn-rec').classList.add('recording');
  $('#mic-hint').textContent = 'Đang ghi… bấm lần nữa để dừng';
  drawMic();
}
function stopRec() { rec.mr?.state !== 'inactive' && rec.mr.stop(); $('#btn-rec').classList.remove('recording'); }
$('#btn-rec').addEventListener('click', () => (rec.mr && rec.mr.state === 'recording') ? stopRec() : startRec());

function drawMic() {
  const canvas = $('#mic-canvas'), g = canvas.getContext('2d');
  rec.actx = new AudioContext();
  const an = rec.actx.createAnalyser(); an.fftSize = 128;
  rec.actx.createMediaStreamSource(rec.stream).connect(an);
  const data = new Uint8Array(an.frequencyBinCount);
  const loop = () => {
    an.getByteFrequencyData(data);
    g.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width / data.length;
    const grad = g.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#7c6cff'); grad.addColorStop(1, '#22d3ee');
    g.fillStyle = grad;
    data.forEach((v, i) => {
      const h = Math.max(4, v / 255 * canvas.height);
      g.beginPath(); g.roundRect(i * w + 1, (canvas.height - h) / 2, w - 3, h, 3); g.fill();
    });
    rec.raf = requestAnimationFrame(loop);
  };
  loop();
}

/* ---------------- API đám mây gọi thẳng từ trình duyệt (không qua server) ---------------- */
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const cloudApi = {
  async gjson(key, path, body) {
    const res = await fetch(GEMINI_API + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data?.error?.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  },
  versionScore(id) { const m = id.match(/gemini-(\d+)(?:\.(\d+))?/); return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0; },

  async models(kind, key) {
    if (kind === 'groq') {
      const res = await fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
      return { stt: (data.data || []).filter(m => /whisper/i.test(m.id)).map(m => ({ id: m.id, name: m.id })).sort((a, b) => b.id.localeCompare(a.id)), tts: [] };
    }
    const all = []; let token = '';
    for (let i = 0; i < 10; i++) {
      const data = await this.gjson(key, `/models?pageSize=1000${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
      all.push(...(data.models || [])); token = data.nextPageToken; if (!token) break;
    }
    const items = all.map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name }));
    const newest = (a, b) => this.versionScore(b.id) - this.versionScore(a.id) || a.id.localeCompare(b.id);
    const tts = items.filter(m => /tts/i.test(m.id)).sort(newest);
    const stt = items
      .filter(m => /^gemini-/.test(m.id) && !/tts|live|image|embedding|robotics|computer-use|native-audio|veo|imagen|aqa/i.test(m.id) && /transcribe|flash|pro/i.test(m.id))
      .sort((a, b) => (/transcribe/i.test(b.id) - /transcribe/i.test(a.id)) || newest(a, b));
    return { stt, tts };
  },

  toBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
  },
  textOf(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (typeof node.text === 'string') out.push(node.text);
    if (typeof node.output_text === 'string') out.push(node.output_text);
    Object.values(node).forEach(v => v && typeof v === 'object' && this.textOf(v, out));
    return out;
  },
  audioOf(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    const data = node.data || node.inlineData?.data || node.inline_data?.data;
    const mime = node.mime_type || node.mimeType || node.inlineData?.mimeType || node.inline_data?.mime_type || '';
    if (typeof data === 'string' && data.length > 500 && (/audio|l16|pcm/i.test(mime) || !mime)) out.push({ data, mime });
    Object.values(node).forEach(v => v && typeof v === 'object' && this.audioOf(v, out));
    return out;
  },

  async transcribe(kind, key, model, blob, name, language, duration) {
    if (kind === 'groq') {
      const fd = new FormData();
      fd.append('file', blob, name); fd.append('model', model); fd.append('response_format', 'verbose_json');
      fd.append('timestamp_granularities[]', 'segment');
      if (language !== 'auto') fd.append('language', language);
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error?.message || `Groq lỗi HTTP ${res.status}`);
      return { text: d.text, segments: (d.segments || []).map((s, i) => ({ id: i + 1, start: s.start, end: s.end, text: s.text.trim() })), duration: d.duration || duration };
    }
    if (blob.size > 14 * 1024 * 1024) throw new Error('File quá lớn cho Gemini (tối đa ~14 MB). Hãy dùng Whisper chạy trên máy để xử lý file lớn.');
    const b64 = await this.toBase64(blob);
    const mime = (blob.type || 'audio/mp3').replace(/^video\//, 'audio/').split(';')[0];
    const lang = language === 'auto' ? 'tự nhận diện ngôn ngữ' : `ngôn ngữ: ${language}`;
    const prompt = `Chép lại chính xác toàn bộ lời nói trong audio (${lang}), giữ nguyên ngôn ngữ gốc, thêm dấu câu đúng. ` +
      'Chỉ trả về JSON hợp lệ dạng {"text":"toàn văn","segments":[{"start":giây,"end":giây,"text":"..."}]} với các đoạn ngắn 3-8 giây, không thêm giải thích.';
    let data, firstErr;
    try {
      data = await this.gjson(key, `/models/${model}:generateContent`, { contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }], generationConfig: { responseMimeType: 'application/json' } });
    } catch (e) { firstErr = e; }
    if (!data) {
      try { data = await this.gjson(key, '/interactions', { model, input: [{ type: 'text', text: prompt }, { type: 'audio', data: b64, mime_type: mime }] }); }
      catch { throw firstErr; }
    }
    const raw = this.textOf(data).join('\n').trim();
    let parsed = null;
    try { parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch {}
    const segments = Array.isArray(parsed?.segments) ? parsed.segments.map((s, i) => ({ id: i + 1, start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() })).filter(s => s.text) : [];
    const text = parsed?.text || segments.map(s => s.text).join(' ') || raw;
    if (!text) throw new Error('Gemini không trả về văn bản.');
    return { text, segments, duration };
  },

  pcmToWav(pcm, rate = 24000) {
    const h = new DataView(new ArrayBuffer(44));
    const w = (o, s) => [...s].forEach((c, i) => h.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); h.setUint32(4, 36 + pcm.length, true); w(8, 'WAVEfmt '); h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
    h.setUint32(24, rate, true); h.setUint32(28, rate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true); w(36, 'data'); h.setUint32(40, pcm.length, true);
    return new Blob([h, pcm], { type: 'audio/wav' });
  },
  async tts(key, model, text, voice, style) {
    const input = style && style.trim() ? `${style.trim()}: ${text}` : text;
    let data, firstErr;
    try { data = await this.gjson(key, '/interactions', { model, input, response_format: { type: 'audio' }, generation_config: { speech_config: [{ voice }] } }); } catch (e) { firstErr = e; }
    if (!data || !this.audioOf(data).length) {
      try {
        data = await this.gjson(key, `/models/${model}:generateContent`, { contents: [{ parts: [{ text: input }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } });
      } catch (e) { throw new Error(e.message + (firstErr ? ` (Interactions: ${firstErr.message})` : '')); }
    }
    const a = this.audioOf(data)[0];
    if (!a) throw new Error('Gemini không trả về âm thanh.');
    const bin = Uint8Array.from(atob(a.data), c => c.charCodeAt(0));
    if (String.fromCharCode(...bin.slice(0, 4)) === 'RIFF') return new Blob([bin], { type: 'audio/wav' });
    if (/mpeg|mp3/i.test(a.mime)) return new Blob([bin], { type: 'audio/mpeg' });
    return this.pcmToWav(bin, Number((a.mime.match(/rate=(\d+)/) || [])[1]) || 24000);
  },
  async chat(prompt) {
    const gKey = store.get('key-gemini'), grKey = store.get('key-groq');
    if (gKey) {
      const model = (cloud.gemini.stt.find(m => !/transcribe/i.test(m.id)) || { id: 'gemini-3.8-flash' }).id;
      const d = await this.gjson(gKey, `/models/${model}:generateContent`, { contents: [{ parts: [{ text: prompt }] }] });
      return this.textOf(d).join('\n');
    }
    if (grKey) {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + grKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] }) });
      const d = await res.json(); if (!res.ok) throw new Error(d?.error?.message || 'Groq lỗi');
      return d.choices[0].message.content;
    }
    throw new Error('Cần Gemini hoặc Groq API key (⚙ Cài đặt).');
  }
};

/* ---------------- Chuyển đổi ---------------- */
function setProgress(title, sub = '', ratio = null) {
  $('#empty').hidden = true; $('#result').hidden = true; $('#progress-box').hidden = false;
  $('#progress-title').textContent = title;
  $('#progress-sub').textContent = sub;
  const fill = $('#bar-fill');
  if (ratio == null) { fill.classList.add('indeterminate'); }
  else { fill.classList.remove('indeterminate'); fill.style.width = Math.round(ratio * 100) + '%'; }
}
function setBusy(b) {
  state.busy = b;
  $('#btn-run').disabled = b || !state.media;
  $('#btn-run span').textContent = b ? 'Đang xử lý…' : 'Bắt đầu chuyển đổi';
}

async function runTranscribe() {
  if (!state.media || state.busy) return;
  const [kind, model] = $('#engine').value.split(/:(.+)/);
  const language = $('#language').value;
  setBusy(true);
  try {
    let out;
    if (kind === 'local') out = await runLocal(model, language);
    else out = await runCloud(kind, model, language);
    finishResult(out);
  } catch (e) {
    $('#progress-box').hidden = true; $('#empty').hidden = false;
    toast(e.message || 'Có lỗi xảy ra.', 'err');
  }
  setBusy(false);
}

async function runLocal(modelId, language) {
  setProgress('Đang đọc âm thanh…');
  const { data, duration } = await decodeTo16kMono(state.media.blob);
  state.media.duration = duration;
  if (!state.worker) state.worker = new Worker('stt-worker.js', { type: 'module' });
  const worker = state.worker;
  return new Promise((resolve, reject) => {
    const cleanup = () => { worker.onmessage = null; worker.onerror = null; };
    worker.onerror = e => { cleanup(); reject(new Error('Không khởi chạy được mô hình: ' + (e.message || 'lỗi worker'))); };
    worker.onmessage = ({ data: m }) => {
      if (m.type === 'status') setProgress(m.message, 'Đừng đóng tab này.');
      else if (m.type === 'load-progress') {
        setProgress('Đang tải mô hình về máy…', `${(m.loaded / 1e6).toFixed(0)} / ${(m.total / 1e6).toFixed(0)} MB (chỉ tải lần đầu)`, m.loaded / m.total);
      } else if (m.type === 'progress') setProgress('Đang nhận diện giọng nói…', `${Math.round(m.ratio * 100)}%`, m.ratio);
      else if (m.type === 'result') { cleanup(); resolve({ text: m.text, segments: m.segments, duration, model: modelId.split('/').pop() + (m.device === 'webgpu' ? ' · GPU' : ' · CPU'), elapsed: m.elapsed }); }
      else if (m.type === 'error') { cleanup(); reject(new Error(m.message)); }
    };
    worker.postMessage({ type: 'transcribe', audio: data, modelId, language, duration }, [data.buffer]);
  });
}

async function runCloud(kind, model, language) {
  setProgress(kind === 'gemini' ? 'Gemini đang nhận diện…' : 'Groq đang nhận diện…', 'Âm thanh được gửi thẳng tới ' + (kind === 'gemini' ? 'Google' : 'Groq') + ' bằng key của bạn.');
  const t0 = performance.now();
  const iso = { vietnamese: 'vi', english: 'en', chinese: 'zh', japanese: 'ja', korean: 'ko', french: 'fr', spanish: 'es', german: 'de', russian: 'ru', thai: 'th' }[language] || 'auto';
  const d = await cloudApi.transcribe(kind, store.get('key-' + kind), model, state.media.blob, state.media.name, iso, state.media.duration);
  return {
    text: d.text, segments: d.segments, duration: d.duration || state.media.duration,
    model: (kind === 'gemini' ? 'Gemini · ' : 'Groq · ') + model, elapsed: (performance.now() - t0) / 1000
  };
}

/* ---------------- Hiển thị kết quả ---------------- */
function splitSegments(segs, maxChars) {
  if (!maxChars) return segs.map(s => ({ ...s }));
  const out = [];
  for (const s of segs) {
    if (s.text.length <= maxChars * 1.25) { out.push({ ...s }); continue; }
    const words = s.text.split(/\s+/);
    const lines = []; let cur = '';
    for (const w of words) {
      if (cur && (cur + ' ' + w).length > maxChars) { lines.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w;
    }
    if (cur) lines.push(cur);
    const total = lines.reduce((a, l) => a + l.length, 0) || 1;
    let t = s.start;
    for (const l of lines) {
      const d = (s.end - s.start) * l.length / total;
      out.push({ start: t, end: t + d, text: l });
      t += d;
    }
  }
  return out.map((s, i) => ({ ...s, id: i + 1 }));
}

function finishResult(r) {
  state.raw = r.segments.length ? r.segments : [{ id: 1, start: 0, end: r.duration || 0, text: r.text }];
  state.text = r.text;
  state.meta = { model: r.model, duration: r.duration, elapsed: r.elapsed, name: state.media?.name || '' };
  $('#progress-box').hidden = true;
  $('#result').hidden = false;
  $('#result-tools').hidden = false;
  const sum = $('#summary');
  if (r.summary) { sum.textContent = r.summary; sum.hidden = false; } else sum.hidden = true;
  renderResult();
  saveHistory();
  toast(`Xong trong ${r.elapsed.toFixed(1)} giây.`, 'ok');
}

function renderResult() {
  state.view = splitSegments(state.raw, Number($('#sub-len').value));
  const words = state.text.trim().split(/\s+/).filter(Boolean).length;
  $('#stats').innerHTML = [
    `<span class="stat"><b>${words}</b> từ</span>`,
    `<span class="stat"><b>${state.view.length}</b> dòng</span>`,
    state.meta.duration ? `<span class="stat">⏱ <b>${clock(state.meta.duration)}</b></span>` : '',
    `<span class="stat">${state.meta.model || ''}</span>`
  ].join('');

  const tl = $('#timeline'); tl.textContent = '';
  state.view.forEach((s, i) => {
    const row = document.createElement('div'); row.className = 'seg-row'; row.dataset.i = i;
    const t = document.createElement('div'); t.className = 'seg-time'; t.textContent = clock(s.start);
    const x = document.createElement('div'); x.className = 'seg-text'; x.contentEditable = 'true'; x.spellcheck = false; x.textContent = s.text;
    x.addEventListener('input', () => { s.text = x.textContent; syncRaw(); });
    row.addEventListener('click', e => { if (e.target === x && document.activeElement === x) return; seekTo(s.start); });
    row.append(t, x); tl.appendChild(row);
  });
  $('#plain').value = state.text;
  applyViewMode();
  $('#ai-row').hidden = !(store.get('key-gemini') || store.get('key-groq') || state.server.hasGemini || state.server.hasGroq);
}
function syncRaw() {
  state.raw = state.view.map(s => ({ ...s }));
  state.text = state.view.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
  $('#plain').value = state.text;
}
function applyViewMode() {
  const plain = state.viewMode === 'plain';
  $('#timeline').hidden = plain; $('#plain').hidden = !plain;
  $$('#view-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.v === state.viewMode));
}
$$('#view-seg .seg-btn').forEach(b => b.addEventListener('click', () => { state.viewMode = b.dataset.v; applyViewMode(); }));
$('#plain').addEventListener('input', e => { state.text = e.target.value; });
$('#sub-len').addEventListener('change', () => state.raw.length && renderResult());

function seekTo(t) { const p = $('#player'); p.currentTime = t; p.play().catch(() => {}); }
$('#player').addEventListener('timeupdate', () => {
  const t = $('#player').currentTime;
  const idx = state.view.findIndex(s => t >= s.start && t < s.end);
  $$('.seg-row').forEach((r, i) => {
    const on = i === idx;
    if (on !== r.classList.contains('playing')) {
      r.classList.toggle('playing', on);
      if (on && !r.matches(':hover')) r.scrollIntoView({ block: 'nearest' });
    }
  });
});

/* ---------------- Xuất file ---------------- */
function build(fmt) {
  const segs = state.view;
  switch (fmt) {
    case 'txt': return [state.text, 'text/plain'];
    case 'srt': return [segs.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text}\n`).join('\n'), 'text/plain'];
    case 'vtt': return ['WEBVTT\n\n' + segs.map(s => `${stamp(s.start, '.')} --> ${stamp(s.end, '.')}\n${s.text}\n`).join('\n'), 'text/vtt'];
    case 'json': return [JSON.stringify({ text: state.text, ...state.meta, segments: segs }, null, 2), 'application/json'];
  }
}
$('#btn-dl').addEventListener('click', e => { e.stopPropagation(); $('#dl-menu').hidden = !$('#dl-menu').hidden; });
document.addEventListener('click', () => { $('#dl-menu').hidden = true; });
$$('#dl-menu button').forEach(b => b.addEventListener('click', () => {
  const [data, type] = build(b.dataset.fmt);
  const base = (state.meta.name || 'ket-qua').replace(/\.[^.]+$/, '');
  download(`${base}.${b.dataset.fmt}`, data, type);
}));
$('#btn-copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(state.text); toast('Đã sao chép văn bản.', 'ok'); }
  catch { toast('Không sao chép được.', 'err'); }
});
$('#btn-to-tts').addEventListener('click', () => { showView('tts'); $('#tts-text').value = state.text; updateCount(); });

/* ---------------- AI tiện ích (cần key tùy chọn) ---------------- */
$$('#ai-row .chip').forEach(b => b.addEventListener('click', async () => {
  const action = b.dataset.ai;
  b.disabled = true;
  try {
    const prompts = {
      summarize: 'Tóm tắt ngắn gọn ý chính (gạch đầu dòng) của bản ghi lời nói sau bằng tiếng Việt:\n\n',
      clean: 'Làm sạch bản ghi lời nói sau: sửa lỗi chính tả, dấu câu, xóa từ đệm (ờ, ừm, à...) nhưng giữ nguyên ý. Chỉ trả về văn bản đã sửa:\n\n',
      translate: 'Translate the following text into English. Preserve tone and formatting. Return only the translation:\n\n'
    };
    const r = { result: await cloudApi.chat(prompts[action] + state.text) };
    if (action === 'clean') { state.raw = [{ id: 1, start: 0, end: state.meta.duration || 0, text: r.result }]; state.text = r.result; renderResult(); }
    else { const s = $('#summary'); s.textContent = r.result; s.hidden = false; }
  } catch (e) { toast(e.message, 'err'); }
  b.disabled = false;
}));

/* ---------------- Lịch sử ---------------- */
function loadHistory() { try { return JSON.parse(store.get('vk-history', '[]')); } catch { return []; } }
function saveHistory() {
  const list = loadHistory();
  list.unshift({ id: Date.now(), name: state.meta.name, model: state.meta.model, duration: state.meta.duration, text: state.text, segments: state.raw, at: new Date().toISOString() });
  while (list.length > 30 || JSON.stringify(list).length > 4e6) list.pop();
  store.set('vk-history', JSON.stringify(list));
}
function renderHistory() {
  const list = loadHistory(), box = $('#history-list');
  $('#history-count').textContent = list.length ? `${list.length} mục` : '';
  box.textContent = '';
  if (!list.length) { box.innerHTML = '<div class="empty"><strong>Chưa có lịch sử</strong><span class="muted">Các lần chuyển đổi sẽ hiện ở đây.</span></div>'; return; }
  list.forEach(h => {
    const el = document.createElement('div'); el.className = 'h-item';
    el.innerHTML = '<div class="h-body"><strong></strong><p></p></div>';
    el.querySelector('strong').textContent = `${h.name || 'Không tên'} · ${new Date(h.at).toLocaleString('vi-VN')}`;
    el.querySelector('p').textContent = h.text;
    const open = Object.assign(document.createElement('button'), { className: 'btn sm', textContent: 'Mở' });
    open.onclick = () => {
      state.media = state.media || null;
      state.meta = { model: h.model, duration: h.duration, name: h.name };
      state.text = h.text; state.raw = h.segments;
      showView('stt'); $('#empty').hidden = true; $('#progress-box').hidden = true; $('#result').hidden = false; $('#result-tools').hidden = false;
      renderResult();
    };
    const del = Object.assign(document.createElement('button'), { className: 'btn sm danger', textContent: 'Xóa' });
    del.onclick = () => { store.set('vk-history', JSON.stringify(loadHistory().filter(x => x.id !== h.id))); renderHistory(); };
    el.append(open, del); box.appendChild(el);
  });
}
$('#history-clear').addEventListener('click', () => { if (confirm('Xóa toàn bộ lịch sử?')) { store.set('vk-history', '[]'); renderHistory(); } });

/* ---------------- Chữ -> Giọng: nhiều kho giọng ---------------- */
const SAMPLE = 'Xin chào! Đây là giọng đọc trí tuệ nhân tạo. Bạn có thể dán bất kỳ đoạn văn bản nào vào đây để nghe thử.';
const GEMINI_VOICES = [['Zephyr', 'Sáng'], ['Puck', 'Sôi nổi'], ['Charon', 'Thông tin'], ['Kore', 'Chắc chắn'], ['Fenrir', 'Hào hứng'], ['Leda', 'Trẻ trung'], ['Orus', 'Chắc chắn'], ['Aoede', 'Nhẹ nhàng'], ['Callirrhoe', 'Dễ chịu'], ['Autonoe', 'Sáng'], ['Enceladus', 'Thì thầm'], ['Iapetus', 'Rõ ràng'], ['Umbriel', 'Dễ chịu'], ['Algieba', 'Mượt'], ['Despina', 'Mượt'], ['Erinome', 'Rõ ràng'], ['Algenib', 'Khàn'], ['Rasalgethi', 'Thông tin'], ['Laomedeia', 'Sôi nổi'], ['Achernar', 'Êm'], ['Alnilam', 'Chắc chắn'], ['Schedar', 'Đều'], ['Gacrux', 'Trưởng thành'], ['Pulcherrima', 'Mạnh mẽ'], ['Achird', 'Thân thiện'], ['Zubenelgenubi', 'Tự nhiên'], ['Vindemiatrix', 'Dịu dàng'], ['Sadachbia', 'Sống động'], ['Sadaltager', 'Am hiểu'], ['Sulafat', 'Ấm áp']];
const LIBS = {
  edge:    { title: 'Microsoft Edge Neural — miễn phí', badge: 'Microsoft Edge Neural', free: true, needs: 'api', desc: '2 giọng Việt (HoaiMy, NamMinh) và 300+ giọng đa ngôn ngữ · tạo qua Cloudflare Worker / server của app' },
  capcut:  { title: 'CapCut / TikTok — miễn phí', badge: 'CapCut / TikTok', free: true, needs: 'api', desc: '24 giọng Việt kiểu TikTok, review phim · tạo qua Cloudflare Worker / server của app' },
  piper:   { title: 'Piper — chạy trên máy bạn, miễn phí', badge: 'Piper (trong trình duyệt)', free: true, needs: '', desc: '1 giọng Việt (vais1000) · chạy 100% trong trình duyệt, tải ~63 MB lần đầu rồi dùng offline được' },
  mms:     { title: 'Meta MMS — chạy trên máy bạn, miễn phí', badge: 'Meta MMS (trong trình duyệt)', free: true, needs: '', desc: '1 giọng Việt · chạy 100% trong trình duyệt, tải ~114 MB lần đầu · giọng hơi máy' },
  browser: { title: 'Giọng có sẵn của trình duyệt / hệ điều hành', badge: 'Trình duyệt / Hệ điều hành', free: true, needs: '', desc: 'Tùy máy bạn (Edge có giọng "Natural" rất tự nhiên) · chỉ nghe trực tiếp, không tải file được' },
  gemini:  { title: 'Google Gemini TTS — dùng key của bạn', badge: 'Google Gemini TTS', free: false, needs: '', desc: '30 giọng đa ngôn ngữ (có tiếng Việt), đọc theo phong cách bạn mô tả · gọi thẳng Google bằng key của bạn' }
};
const tts = { lib: 'edge', edgeVoices: null, capcutVoices: null, mms: null, piper: null, speaking: false };

function updateCount() { $('#tts-count').textContent = $('#tts-text').value.length.toLocaleString('vi-VN') + ' ký tự'; }
$('#tts-text').addEventListener('input', updateCount);
$('#tts-sample').addEventListener('click', () => { $('#tts-text').value = SAMPLE; updateCount(); });
$('#tts-clear').addEventListener('click', () => { $('#tts-text').value = ''; updateCount(); });
$('#tts-rate').addEventListener('input', e => { $('#rate-val').textContent = Number(e.target.value).toFixed(2).replace(/0$/, '') + '×'; });
$('#tts-pitch').addEventListener('input', e => { $('#pitch-val').textContent = e.target.value + ' Hz'; });

function availableLibs() {
  return Object.keys(LIBS).filter(k => {
    if (LIBS[k].needs === 'api' && !state.server.online) return false;
    if (k === 'browser' && !('speechSynthesis' in window)) return false;
    if (k === 'gemini' && !cloud.gemini.tts.length) return false;
    return true;
  });
}
function renderLibOptions() {
  const sel = $('#tts-lib'), keep = sel.value || tts.lib, libs = availableLibs();
  sel.innerHTML = libs.map(k => `<option value="${k}">${LIBS[k].title}</option>`).join('');
  sel.value = libs.includes(keep) ? keep : libs[0];
  $('#tts-model').innerHTML = cloud.gemini.tts.map(m => `<option value="${m.id}">${m.name && m.name !== m.id ? m.name + ' — ' : ''}${m.id}</option>`).join('');
  if (ttsReady && sel.value !== tts.lib) applyLib();
}

function setVoiceOptions(list) {
  $('#tts-voice').innerHTML = list.map(v => `<option value="${v.name}">${v.label}</option>`).join('');
}
function browserVoices() {
  const all = speechSynthesis.getVoices();
  const vi = all.filter(v => /^vi/i.test(v.lang)), rest = all.filter(v => !/^vi/i.test(v.lang));
  return [...vi, ...rest].map(v => ({ name: v.voiceURI || v.name, label: `${/^vi/i.test(v.lang) ? '🇻🇳 ' : ''}${v.name} (${v.lang})${v.localService ? '' : ' · online'}` }));
}

async function applyLib() {
  tts.lib = $('#tts-lib').value;
  const lib = tts.lib, info = LIBS[lib];
  $('#lib-badge').innerHTML = `<span class="pill ${info.free ? 'free' : ''}">Kho giọng: ${info.badge}</span><span>${info.desc}</span>`;
  $('#row-model').hidden = lib !== 'gemini';
  $('#row-style').hidden = lib !== 'gemini';
  $('#row-locale').hidden = lib !== 'edge';
  $('#row-rate').hidden = !['edge', 'capcut', 'browser'].includes(lib);
  $('#row-pitch').hidden = lib !== 'edge';
  $('#tts-note').textContent = '';
  $('#tts-result').hidden = true;
  if (lib !== 'browser') speechSynthesis?.cancel?.();
  try {
    if (lib === 'edge') {
      if (!tts.edgeVoices) tts.edgeVoices = (await api('/api/edge/voices')).voices;
      const locales = [...new Set(tts.edgeVoices.map(v => v.locale))].sort((a, b) => (b.startsWith('vi') - a.startsWith('vi')) || (b.startsWith('en-US') - a.startsWith('en-US')) || a.localeCompare(b));
      const dn = new Intl.DisplayNames(['vi'], { type: 'language' }), rn = new Intl.DisplayNames(['vi'], { type: 'region' });
      const keep = $('#tts-locale').value;
      $('#tts-locale').innerHTML = locales.map(l => {
        const [lang, region] = l.split('-'); let label = l; try { label = `${dn.of(lang)} (${rn.of(region)})`; } catch {}
        return `<option value="${l}">${label}</option>`;
      }).join('');
      $('#tts-locale').value = locales.includes(keep) ? keep : (locales.includes('vi-VN') ? 'vi-VN' : locales[0]);
      fillEdgeVoices();
    } else if (lib === 'capcut') {
      if (!tts.capcutVoices) tts.capcutVoices = (await api('/api/capcut/voices')).voices;
      setVoiceOptions(tts.capcutVoices);
    } else if (lib === 'piper') {
      setVoiceOptions([{ name: 'vi_VN-vais1000-medium', label: 'Vais1000 — Nữ (Piper)' }]);
    } else if (lib === 'mms') {
      setVoiceOptions([{ name: 'mms-vie', label: 'Tiếng Việt — Meta MMS' }]);
    } else if (lib === 'browser') {
      const fill = () => {
        const list = browserVoices();
        setVoiceOptions(list);
        const hasVi = list.some(v => v.label.startsWith('🇻🇳'));
        $('#tts-note').textContent = !list.length ? 'Trình duyệt này chưa cung cấp giọng đọc nào.'
          : hasVi ? '' : 'Máy bạn chưa có giọng tiếng Việt. Dùng trình duyệt Edge (có giọng Natural HoaiMy/NamMinh), hoặc thêm giọng Việt trong Windows: Cài đặt → Thời gian & ngôn ngữ → Giọng nói.';
      };
      fill(); speechSynthesis.onvoiceschanged = fill;
    } else {
      setVoiceOptions(GEMINI_VOICES.map(([n, st]) => ({ name: n, label: `${n} — ${st}` })));
      $('#tts-voice').value = 'Kore';
    }
  } catch (e) { toast('Không tải được danh sách giọng: ' + e.message, 'err'); }
}
function fillEdgeVoices() {
  const loc = $('#tts-locale').value;
  setVoiceOptions(tts.edgeVoices.filter(v => v.locale === loc).map(v => ({
    name: v.name, label: `${v.name.split('-').pop().replace('Neural', '').replace('Multilingual', ' (Đa ngôn ngữ)')} — ${v.gender === 'Female' ? 'Nữ' : 'Nam'}`
  })));
}
$('#tts-locale').addEventListener('change', fillEdgeVoices);
$('#tts-lib').addEventListener('change', applyLib);

let ttsReady = false;
function initTts() { if (ttsReady) return; ttsReady = true; renderLibOptions(); applyLib(); }

/* Chia câu ngắn để mô hình chạy trong trình duyệt không bị quá tải */
function splitSentences(text, max = 160) {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…;])\s+/);
  const out = [];
  for (let p of parts) {
    while (p.length > max) {
      let cut = p.lastIndexOf(',', max); if (cut < 40) cut = p.lastIndexOf(' ', max); if (cut < 1) cut = max;
      out.push(p.slice(0, cut + 1).trim()); p = p.slice(cut + 1).trim();
    }
    if (p) out.push(p);
  }
  return out;
}
function f32ToWav(f, rate) {
  const buf = new ArrayBuffer(44 + f.length * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + f.length * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, f.length * 2, true);
  for (let i = 0; i < f.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, f[i])) * 32767, true);
  return new Blob([buf], { type: 'audio/wav' });
}
function joinWithGaps(parts, rate, gapSec = 0.22) {
  const gap = new Float32Array(Math.round(rate * gapSec));
  const total = parts.reduce((n, p) => n + p.length + gap.length, 0);
  const out = new Float32Array(total); let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length + gap.length; }
  return out;
}
async function wavToF32(blob, rate) {
  const ctx = new AudioContext({ sampleRate: rate });
  try { return (await ctx.decodeAudioData(await blob.arrayBuffer())).getChannelData(0).slice(); } finally { ctx.close(); }
}

async function synthPiper(text, onStatus) {
  const voiceId = 'vi_VN-vais1000-medium';
  tts.piper ||= await import('https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/+esm');
  let have = []; try { have = await tts.piper.stored(); } catch {}
  if (!have.includes(voiceId)) {
    await tts.piper.download(voiceId, p => onStatus(`Đang tải giọng về máy… ${Math.round(p.loaded / p.total * 100)}% (chỉ lần đầu)`));
  }
  const sentences = splitSentences(text), parts = [];
  for (let i = 0; i < sentences.length; i++) {
    onStatus(`Đang đọc… ${i + 1}/${sentences.length}`);
    parts.push(await wavToF32(await tts.piper.predict({ text: sentences[i], voiceId }), 22050));
  }
  return f32ToWav(joinWithGaps(parts, 22050), 22050);
}

function synthMms(text, onStatus) {
  tts.mms ||= new Worker('tts-worker.js', { type: 'module' });
  const worker = tts.mms, id = Date.now(), texts = splitSentences(text);
  return new Promise((resolve, reject) => {
    worker.onerror = e => reject(new Error('Không chạy được MMS: ' + (e.message || 'lỗi worker')));
    worker.onmessage = ({ data: m }) => {
      if (m.id !== id) return;
      if (m.type === 'load') onStatus(`Đang tải giọng về máy… ${Math.round(m.ratio * 100)}% (chỉ lần đầu)`);
      else if (m.type === 'progress') onStatus(`Đang đọc… ${Math.round(m.ratio * 100)}%`);
      else if (m.type === 'done') resolve(f32ToWav(joinWithGaps(m.parts, m.rate), m.rate));
      else if (m.type === 'error') reject(new Error(m.message));
    };
    worker.postMessage({ id, texts });
  });
}

function speakBrowser(text, voiceURI, rate) {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  const v = speechSynthesis.getVoices().find(x => (x.voiceURI || x.name) === voiceURI);
  if (v) { u.voice = v; u.lang = v.lang; }
  u.rate = Number(rate) || 1;
  tts.speaking = true;
  const btn = $('#btn-tts-run');
  const reset = () => { tts.speaking = false; btn.querySelector('span').textContent = 'Tạo giọng đọc'; };
  u.onend = reset; u.onerror = reset;
  btn.querySelector('span').textContent = 'Dừng đọc';
  speechSynthesis.speak(u);
}

$('#btn-tts-run').addEventListener('click', async () => {
  const lib = tts.lib, btn = $('#btn-tts-run'), label = btn.querySelector('span');
  if (lib === 'browser' && tts.speaking) { speechSynthesis.cancel(); tts.speaking = false; label.textContent = 'Tạo giọng đọc'; return; }
  const text = $('#tts-text').value.trim();
  if (!text) return toast('Hãy nhập văn bản cần đọc.', 'err');
  const voice = $('#tts-voice').value, rate = $('#tts-rate').value;
  const status = s => { label.textContent = s; };
  btn.disabled = true; label.textContent = 'Đang tạo giọng…';
  try {
    let blob = null;
    const post = async (url, body) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Lỗi tạo giọng đọc');
      return res.blob();
    };
    if (lib === 'edge') blob = await post('/api/edge/tts', { text, voice, rate, pitch: $('#tts-pitch').value });
    else if (lib === 'capcut') blob = await post('/api/capcut/tts', { text, voice, rate });
    else if (lib === 'piper') blob = await synthPiper(text, status);
    else if (lib === 'mms') blob = await synthMms(text, status);
    else if (lib === 'gemini') blob = await cloudApi.tts(store.get('key-gemini'), $('#tts-model').value, text, voice, $('#tts-style').value);
    else if (lib === 'browser') { speakBrowser(text, voice, rate); $('#tts-result').hidden = true; btn.disabled = false; return; }

    const url = URL.createObjectURL(blob);
    $('#tts-player').src = url; $('#tts-download').href = url;
    $('#tts-download').download = 'voice.' + (blob.type.includes('wav') ? 'wav' : 'mp3');
    $('#tts-result').hidden = false;
    $('#tts-player').play().catch(() => {});
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; label.textContent = 'Tạo giọng đọc';
});

/* ---------------- Cài đặt / chia sẻ ---------------- */
$('#btn-settings').addEventListener('click', () => {
  $('#key-groq').value = store.get('key-groq'); $('#key-gemini').value = store.get('key-gemini');
  openModal('#modal-settings');
});
$('#btn-save-keys').addEventListener('click', async () => {
  store.set('key-groq', $('#key-groq').value.trim()); store.set('key-gemini', $('#key-gemini').value.trim());
  const btn = $('#btn-save-keys'); btn.disabled = true;
  await refreshModels(true);
  btn.disabled = false;
  if (state.raw.length) renderResult();
});
['gemini', 'groq'].forEach(k => $('#key-' + k).addEventListener('change', () => {
  store.set('key-' + k, $('#key-' + k).value.trim()); refreshModels(true, k);
}));

/* Dò model theo API key: chỉ hiện lên danh sách khi key hợp lệ */
const cloud = { gemini: { stt: [], tts: [] }, groq: { stt: [] } };
async function refreshModels(announce = false, only) {
  const jobs = [];
  for (const k of ['gemini', 'groq']) {
    if (only && only !== k) continue;
    const key = store.get('key-' + k), st = $('#status-' + k);
    if (!key) { cloud[k] = { stt: [], tts: [] }; st.textContent = ''; st.className = 'key-status'; continue; }
    st.className = 'key-status'; st.textContent = 'Đang dò model của key này…';
    jobs.push(cloudApi.models(k, key)
      .then(r => {
        cloud[k] = { stt: r.stt || [], tts: r.tts || [] };
        st.className = 'key-status ok';
        st.textContent = k === 'gemini'
          ? `✓ Key hợp lệ · ${cloud[k].stt.length} model nhận diện, ${cloud[k].tts.length} model giọng đọc (gọi thẳng từ trình duyệt)`
          : `✓ Key hợp lệ · ${cloud[k].stt.length} model Whisper`;
      })
      .catch(e => { cloud[k] = { stt: [], tts: [] }; st.className = 'key-status err'; st.textContent = '✗ ' + e.message; }));
  }
  await Promise.all(jobs);
  renderEngineOptions(); renderLibOptions();
  if (announce) toast('Đã cập nhật danh sách model theo key.', 'ok');
}
function renderEngineOptions() {
  const sel = $('#engine'), cur = sel.value;
  $$('#engine optgroup[data-cloud]').forEach(g => g.remove());
  const add = (label, kind, list) => {
    if (!list.length) return;
    const g = document.createElement('optgroup'); g.label = label; g.dataset.cloud = kind;
    list.forEach(m => { const o = document.createElement('option'); o.value = kind + ':' + m.id; o.textContent = m.name && m.name !== m.id ? `${m.name} (${m.id})` : m.id; g.appendChild(o); });
    sel.appendChild(g);
  };
  add('Google Gemini · key của bạn (model mới nhất ở trên)', 'gemini', cloud.gemini.stt);
  add('Groq · key của bạn', 'groq', cloud.groq.stt);
  if ([...sel.options].some(o => o.value === cur)) sel.value = cur;
  const n = cloud.gemini.stt.length + cloud.groq.stt.length;
  $('#engine-extra').textContent = n ? `Đã thêm ${n} model đám mây từ API key của bạn.` : 'Muốn dùng Gemini / Groq? Nhập API key ở ⚙ Cài đặt, danh sách model mới nhất sẽ tự hiện ở đây.';
}

$('#btn-share').addEventListener('click', async () => {
  openModal('#modal-share');
  try {
    const s = await api('/api/status');
    if (s.publicUrl) {
      $('#share-url').value = s.publicUrl;
      if (s.qrCode) { $('#qr-img').src = s.qrCode; $('#qr-img').hidden = false; $('#qr-wait').hidden = true; }
    } else { $('#qr-wait').textContent = 'Link công khai chưa sẵn sàng, thử lại sau vài giây.'; }
  } catch { $('#qr-wait').textContent = 'Không lấy được link.'; }
});
$('#btn-copy-share').addEventListener('click', () => { navigator.clipboard.writeText($('#share-url').value); toast('Đã chép link.', 'ok'); });

/* ---------------- Gợi ý theo công cụ + khởi động ---------------- */
const HINTS = {
  'onnx-community/whisper-small': 'Lần đầu mô hình tải về một lần (~250 MB) rồi lưu cache, các lần sau chạy ngay, kể cả offline.',
  'onnx-community/whisper-base': 'Rất nhẹ (~80 MB) nhưng tiếng Việt thường sai hoặc lặp từ. Chỉ nên dùng cho tiếng Anh; tiếng Việt hãy chọn Small trở lên.',
  'onnx-community/whisper-large-v3-turbo': 'Chính xác nhất, cần trình duyệt có WebGPU (Chrome/Edge mới) và ~600 MB tải lần đầu.',
  'whisper-large-v3-turbo': 'Groq chạy trên đám mây, cực nhanh. Cần Groq key miễn phí trong Cài đặt và server đang chạy.',
  'gemini-2.5-flash': 'Gemini hiểu ngữ cảnh, có tóm tắt. Cần Gemini key miễn phí trong Cài đặt và server đang chạy.'
};
$('#engine').addEventListener('change', () => {
  const [kind, id] = $('#engine').value.split(/:(.+)/);
  $('#engine-hint').textContent = kind === 'gemini'
    ? 'Gemini xử lý trên máy chủ Google bằng key của bạn (gọi thẳng từ trình duyệt). File tối đa ~14 MB; file lớn hãy dùng Whisper trên máy.'
    : kind === 'groq' ? 'Groq chạy trên đám mây, rất nhanh. Gọi thẳng từ trình duyệt bằng key của bạn.' : (HINTS[id] || '');
});
$('#btn-run').addEventListener('click', runTranscribe);

(async function boot() {
  try {
    const st = await api('/api/status');
    state.server = { online: true, hasGemini: !!st.hasServerGeminiKey, hasGroq: !!st.hasServerGroqKey };
    if (st.qrCode || st.publicUrl) $('#btn-share').hidden = false;
  } catch {
    // Chạy tĩnh thuần: chỉ có các tính năng chạy trong trình duyệt.
    state.server = { online: false, hasGemini: false, hasGroq: false };
  }
  updateCount();
  renderLibOptions();
  refreshModels(false);
})();
