'use strict';
/* VoiceKit - Giọng nói <-> Văn bản. Whisper chạy trong trình duyệt, TTS Edge Neural qua server. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k, d = '') { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} }
};

/** Gói Premium (hoặc website không bật tài khoản như bản start.bat) */
function isPremium() {
  try { if (typeof vkAccount === 'undefined' || !vkAccount.state.enabled) return true; } catch { return true; }
  return vkAccount.state.plan?.id === 'premium';
}

/* API key chỉ dành cho người đã đăng nhập (khi website bật tài khoản) và lưu riêng theo từng tài khoản */
const keyGate = { allowed: false, userId: null };
const keyName = (k) => keyGate.userId ? `key-${k}:u${keyGate.userId}` : `key-${k}`;
const keyGet = (k) => keyGate.allowed ? store.get(keyName(k)) : '';
const KEY_RULES = {
  groq: { test: (v) => /^gsk_[A-Za-z0-9]{20,}$/.test(v), hint: 'Groq key phải bắt đầu bằng "gsk_" (lấy tại console.groq.com/keys).' },
  gemini: { test: (v) => /^AIza[A-Za-z0-9_\-]{30,}$/.test(v), hint: 'Gemini key phải bắt đầu bằng "AIza" (lấy tại aistudio.google.com/app/apikey).' }
};
/** '' nếu hợp lệ (hoặc để trống), ngược lại là câu báo lỗi. */
const keyProblem = (k, v) => !v || KEY_RULES[k].test(v) ? '' : KEY_RULES[k].hint + ' Đây không phải mật khẩu tài khoản.';
const keySet = (k, v) => { if (keyGate.allowed && !keyProblem(k, v)) store.set(keyName(k), v); };

/** Xóa giá trị đã lưu không giống API key (vd: trình duyệt từng tự điền mật khẩu vào ô key). */
function purgeBadKeys() {
  if (!keyGate.allowed) return;
  for (const k of ['gemini', 'groq']) {
    const v = store.get(keyName(k));
    if (v && keyProblem(k, v)) {
      store.set(keyName(k), '');
      toast(`Đã xóa giá trị không hợp lệ trong ô ${k === 'groq' ? 'Groq' : 'Gemini'} key (có thể trình duyệt đã tự điền mật khẩu vào đó). Hãy nhập lại đúng API key.`, 'err');
    }
  }
}

/** Gọi từ account.js: allowed = đã đăng nhập, hoặc website không bật tài khoản (chạy local bằng start.bat). */
function applyKeyGate(allowed, userId = null) {
  const changed = keyGate.allowed !== allowed || keyGate.userId !== userId;
  keyGate.allowed = allowed; keyGate.userId = userId;
  $('#btn-settings').hidden = !allowed;
  $$('[data-key-help]').forEach(el => el.hidden = !allowed);
  if (!allowed) {
    $('#modal-settings').hidden = true;
    if ($('#view-history').classList.contains('active')) showView('stt');
  } else if ($('#view-history').classList.contains('active')) renderHistory();
  if (changed || !keyGate.loaded) { keyGate.loaded = true; purgeBadKeys(); refreshModels(false); }
}

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
// --- BẢO MẬT TRAO ĐỔI KHÓA ĐỘNG ECDH (NIST P-256) ---
// Client chỉ lưu Server Public Key (không có private key nào trong JS).
// Mỗi request tự sinh một cặp khóa tạm thời (Ephemeral Keypair) ngẫu nhiên.
const SERVER_ECDH_PUB = {
  kty: 'EC', crv: 'P-256',
  x: 'a-IyUrWjcdxeRENFoFijtNaZaIYBcPEmrGVF8d1WLk8',
  y: 'Jn19zb4pzTQaMpr80DjJ1sEujee0hhgXujWrVqi1rqI'
};

let _cachedServerPubKey = null;
async function getServerPubKey() {
  if (!_cachedServerPubKey) {
    _cachedServerPubKey = await crypto.subtle.importKey('jwk', SERVER_ECDH_PUB, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  }
  return _cachedServerPubKey;
}

function toB64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function api(path, opts = {}) {
  opts = { ...opts };
  const headers = new Headers(opts.headers || {});

  // Sinh cặp khóa ECDH tạm thời cho request này (ngẫu nhiên hoàn toàn)
  let sharedKey = null;
  try {
    const clientPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
    const clientPubRaw = await crypto.subtle.exportKey('raw', clientPair.publicKey);
    headers.set('X-Client-ECDH', toB64(new Uint8Array(clientPubRaw)));

    const serverPubKey = await getServerPubKey();
    sharedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: serverPubKey },
      clientPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (err) {
    console.warn('Lỗi sinh khóa ECDH:', err);
  }

  // Nếu có sharedKey và body là JSON: mã hóa dữ liệu gửi lên
  if (sharedKey && opts.body && typeof opts.body === 'string' && (headers.get('Content-Type') || '').includes('json')) {
    try {
      const raw = JSON.parse(opts.body);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(raw));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sharedKey, encoded);
      const buf = new Uint8Array(iv.length + cipher.byteLength);
      buf.set(iv, 0);
      buf.set(new Uint8Array(cipher), iv.length);
      opts.body = JSON.stringify({ payload: toB64(buf) });
    } catch {}
  }
  opts.headers = headers;

  const res = await fetch(path, opts);
  const ct = res.headers.get('content-type') || '';
  let body = ct.includes('json') ? await res.json().catch(() => null) : null;

  // Nếu response được mã hóa: giải mã ngay tại RAM trình duyệt bằng sharedKey của phiên này
  if (sharedKey && body && body.payload) {
    try {
      const raw = fromB64(body.payload);
      const iv = raw.slice(0, 12);
      const cipher = raw.slice(12);
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, sharedKey, cipher);
      body = JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      console.warn('Lỗi giải mã payload ECDH:', e);
    }
  }

  if (!res.ok) {
    const err = new Error(body?.error || `Lỗi máy chủ (${res.status})`);
    if (body && typeof body === 'object') Object.assign(err, body);
    err.status = res.status;
    throw err;
  }
  return body ?? res;
}

/* ---------------- Điều hướng ---------------- */
function showView(name) {
  $$('.main-tab').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'history' && typeof renderHistory === 'function') renderHistory();
  if (name === 'tts') initTts();
  if (typeof vkAccount !== 'undefined') {
    if (name === 'plans') vkAccount.renderPlans();
    if (name === 'admin' && typeof vkAdmin !== 'undefined') vkAdmin.open();
  }
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
    if (keyProblem('gemini', key)) throw new Error(KEY_RULES.gemini.hint);
    const res = await this.net('Google', GEMINI_API + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-goog-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data?.error?.message || `HTTP ${res.status}`); e.status = res.status; throw e; }
    return data;
  },
  versionScore(id) { const m = id.match(/gemini-(\d+)(?:\.(\d+))?/); return m ? Number(m[1]) * 100 + Number(m[2] || 0) : 0; },

  /** fetch có câu báo lỗi rõ ràng khi bị chặn mạng / CORS / tiện ích chặn quảng cáo */
  async net(who, url, opts) {
    try { return await fetch(url, opts); }
    catch { throw new Error(`Không kết nối được tới ${who}. Kiểm tra mạng, tắt tiện ích chặn quảng cáo cho trang này rồi thử lại.`); }
  },
  async models(kind, key) {
    if (keyProblem(kind, key)) throw new Error(KEY_RULES[kind].hint);
    if (kind === 'groq') {
      const res = await this.net('Groq', 'https://api.groq.com/openai/v1/models', { headers: { Authorization: 'Bearer ' + key } });
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
      const res = await this.net('Groq', 'https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd });
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
    const gKey = keyGet('gemini'), grKey = keyGet('groq');
    if (gKey) {
      const model = (cloud.gemini.stt.find(m => !/transcribe/i.test(m.id)) || { id: 'gemini-3.8-flash' }).id;
      const d = await this.gjson(gKey, `/models/${model}:generateContent`, { contents: [{ parts: [{ text: prompt }] }] });
      return this.textOf(d).join('\n');
    }
    if (grKey) {
      const res = await this.net('Groq', 'https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + grKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: prompt }] }) });
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
  const d = await cloudApi.transcribe(kind, keyGet(kind), model, state.media.blob, state.media.name, iso, state.media.duration);
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
  $('#ai-row').hidden = !(isPremium() && (keyGet('gemini') || keyGet('groq')));
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
function historyKey() { return keyGate.userId ? `vk-history:u${keyGate.userId}` : 'vk-history'; }

/* ---------------- Chữ -> Giọng: nhiều kho giọng ---------------- */
const SAMPLE = 'Xin chào! Đây là giọng đọc trí tuệ nhân tạo. Bạn có thể dán bất kỳ đoạn văn bản nào vào đây để nghe thử.';
const GEMINI_VOICES = [['Zephyr', 'Sáng'], ['Puck', 'Sôi nổi'], ['Charon', 'Thông tin'], ['Kore', 'Chắc chắn'], ['Fenrir', 'Hào hứng'], ['Leda', 'Trẻ trung'], ['Orus', 'Chắc chắn'], ['Aoede', 'Nhẹ nhàng'], ['Callirrhoe', 'Dễ chịu'], ['Autonoe', 'Sáng'], ['Enceladus', 'Thì thầm'], ['Iapetus', 'Rõ ràng'], ['Umbriel', 'Dễ chịu'], ['Algieba', 'Mượt'], ['Despina', 'Mượt'], ['Erinome', 'Rõ ràng'], ['Algenib', 'Khàn'], ['Rasalgethi', 'Thông tin'], ['Laomedeia', 'Sôi nổi'], ['Achernar', 'Êm'], ['Alnilam', 'Chắc chắn'], ['Schedar', 'Đều'], ['Gacrux', 'Trưởng thành'], ['Pulcherrima', 'Mạnh mẽ'], ['Achird', 'Thân thiện'], ['Zubenelgenubi', 'Tự nhiên'], ['Vindemiatrix', 'Dịu dàng'], ['Sadachbia', 'Sống động'], ['Sadaltager', 'Am hiểu'], ['Sulafat', 'Ấm áp']];
const LIBS = {
  edge:       { title: 'Microsoft Edge Neural — miễn phí', badge: 'Microsoft Edge Neural', free: true, needs: 'api', desc: '2 giọng Việt (HoaiMy, NamMinh) và 300+ giọng đa ngôn ngữ · miễn phí cho mọi tài khoản' },
  vieneu:     { title: 'VieNeu-TTS (Việt Nam) — 25 giọng 3 miền (Premium)', badge: 'VieNeu-TTS (Việt Nam)', free: false, premium: true, needs: 'api', desc: '25 giọng chuẩn Bắc/Trung/Nam (tin tức, kể chuyện, tự nhiên...), đọc tiếng Anh xen kẽ, xuất WAV 48 kHz · dành cho gói Premium' },
  supertonic: { title: 'Supertonic 3 — Đa ngôn ngữ (31 thứ tiếng) (Premium)', badge: 'Supertonic 3 (Đa ngôn ngữ)', free: false, premium: true, needs: 'api', desc: 'Đọc 31 ngôn ngữ quốc tế (Anh, Nhật, Hàn, Pháp, Đức...), 10 giọng nam nữ, thẻ cảm xúc <laugh>, <breath>, <sigh> · dành cho gói Premium' },
  capcut:     { title: 'CapCut / TikTok — Premium', badge: 'CapCut / TikTok', free: false, premium: true, needs: 'api', desc: '24 giọng Việt kiểu TikTok, review phim · dành cho gói Premium' },
  piper:      { title: 'Piper — chạy trên máy bạn, miễn phí', badge: 'Piper (trong trình duyệt)', free: true, needs: '', desc: '1 giọng Việt (vais1000) · chạy 100% trong trình duyệt, tải ~63 MB lần đầu rồi dùng offline được' },
  mms:        { title: 'Meta MMS — chạy trên máy bạn, miễn phí', badge: 'Meta MMS (trong trình duyệt)', free: true, needs: '', desc: '1 giọng Việt · chạy 100% trong trình duyệt, tải ~114 MB lần đầu · giọng hơi máy' },
  browser:    { title: 'Giọng có sẵn của trình duyệt / hệ điều hành', badge: 'Trình duyệt / Hệ điều hành', free: true, needs: '', desc: 'Tùy máy bạn (Edge có giọng "Natural" rất tự nhiên) · chỉ nghe trực tiếp, không tải file được' },
  gemini:     { title: 'Google Gemini TTS — dùng key của bạn', badge: 'Google Gemini TTS', free: false, needs: '', desc: '30 giọng đa ngôn ngữ (có tiếng Việt), đọc theo phong cách bạn mô tả · gọi thẳng Google bằng key của bạn' }
};
const tts = { lib: 'edge', format: 'mp3', edgeVoices: null, capcutVoices: null, mms: null, piper: null, speaking: false, previewAudio: null };

function updateCount() { $('#tts-count').textContent = $('#tts-text').value.length.toLocaleString('vi-VN') + ' ký tự'; }
$('#tts-text').addEventListener('input', updateCount);
$('#tts-sample').addEventListener('click', () => { $('#tts-text').value = SAMPLE; updateCount(); });
$('#tts-clear').addEventListener('click', () => { $('#tts-text').value = ''; updateCount(); });
$('#tts-rate').addEventListener('input', e => { $('#rate-val').textContent = Number(e.target.value).toFixed(2) + '×'; });
$('#tts-pitch').addEventListener('input', e => { $('#pitch-val').textContent = e.target.value + ' Hz'; });

/* Chuyển đổi định dạng xuất: MP3 hoặc WAV 48 kHz */
$$('#tts-format-seg .seg-btn').forEach(b => b.addEventListener('click', () => {
  $$('#tts-format-seg .seg-btn').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  tts.format = b.dataset.fmt;
  const dl = $('#tts-download span');
  if (dl) dl.textContent = tts.format === 'wav' ? 'Tải WAV (48 kHz)' : 'Tải MP3';
}));

/* Chèn thẻ cảm xúc / thẻ nghỉ vào vị trí con trỏ trong ô văn bản */
function insertTagIntoText(tag) {
  const ta = $('#tts-text');
  const s = ta.selectionStart ?? ta.value.length;
  const e = ta.selectionEnd ?? ta.value.length;
  const val = ta.value;
  const insert = (s > 0 && !/\s$/.test(val.slice(0, s)) ? ' ' : '') + tag + (e < val.length && !/^\s/.test(val.slice(e)) ? ' ' : '');
  ta.value = val.slice(0, s) + insert + val.slice(e);
  ta.focus();
  const nextPos = s + insert.length;
  ta.setSelectionRange(nextPos, nextPos);
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

$$('.tts-ctrl-bar [data-tag]').forEach(b => b.addEventListener('click', () => {
  insertTagIntoText(b.dataset.tag);
}));

$('#btn-custom-pause')?.addEventListener('click', () => {
  const input = prompt('Nhập số giây nghỉ mong muốn (ví dụ 1.5 hoặc 3, tối đa 10 giây):', '2');
  if (input === null) return;
  const sec = Math.max(0.1, Math.min(10, parseFloat(input) || 1));
  insertTagIntoText(`[nghỉ ${sec}s]`);
});

/* Modal Từ điển phát âm */
function renderDictTable() {
  const tbody = $('#dict-table-rows');
  if (!tbody || typeof vkDict === 'undefined') return;
  const list = vkDict.load();
  tbody.innerHTML = list.map((item, i) => `
    <tr data-idx="${i}">
      <td><input type="text" class="d-from" value="${String(item.from).replace(/"/g, '&quot;')}" placeholder="Từ gốc (vd: KTX)"></td>
      <td><input type="text" class="d-to" value="${String(item.to).replace(/"/g, '&quot;')}" placeholder="Cách đọc (vd: ký túc xá)"></td>
      <td style="text-align:center"><button type="button" class="dict-del-btn" title="Xóa dòng này">✕</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.dict-del-btn').forEach(b => b.addEventListener('click', () => {
    b.closest('tr').remove();
  }));
}

$('#btn-open-dict')?.addEventListener('click', () => {
  renderDictTable();
  openModal('#modal-dict');
});

$('#btn-dict-add')?.addEventListener('click', () => {
  const tbody = $('#dict-table-rows');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="d-from" placeholder="Từ gốc (vd: KTX)"></td>
    <td><input type="text" class="d-to" placeholder="Cách đọc (vd: ký túc xá)"></td>
    <td style="text-align:center"><button type="button" class="dict-del-btn" title="Xóa dòng này">✕</button></td>
  `;
  tr.querySelector('.dict-del-btn').onclick = () => tr.remove();
  tbody.appendChild(tr);
  tr.querySelector('.d-from').focus();
});

$('#btn-dict-reset')?.addEventListener('click', () => {
  if (!confirm('Khôi phục danh sách từ điển về mặc định?')) return;
  vkDict.save(vkDict.defaults);
  renderDictTable();
  toast('Đã khôi phục từ điển phát âm mặc định.', 'ok');
});

$('#btn-dict-save')?.addEventListener('click', () => {
  const rows = $$('#dict-table-rows tr');
  const list = [];
  rows.forEach(tr => {
    const from = tr.querySelector('.d-from')?.value?.trim();
    const to = tr.querySelector('.d-to')?.value?.trim();
    if (from && to) list.push({ from, to });
  });
  vkDict.save(list);
  $('#modal-dict').hidden = true;
  toast(`Đã lưu ${list.length} từ trong từ điển phát âm.`, 'ok');
});

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
  sel.innerHTML = libs.map(k => `<option value="${k}">${LIBS[k].premium && !isPremium() ? '🔒 ' : ''}${LIBS[k].title}</option>`).join('');
  sel.value = libs.includes(keep) ? keep : libs[0];
  $('#tts-model').innerHTML = cloud.gemini.tts.map(m => `<option value="${m.id}">${m.name && m.name !== m.id ? m.name + ' — ' : ''}${m.id}</option>`).join('');
  if (ttsReady && sel.value !== tts.lib) applyLib();
}

function setVoiceOptions(list) {
  $('#tts-voice').innerHTML = list.map(v => `<option value="${v.id || v.name}">${v.label || v.name}</option>`).join('');
  updateVoiceDetail();
}
function browserVoices() {
  const all = speechSynthesis.getVoices();
  const vi = all.filter(v => /^vi/i.test(v.lang)), rest = all.filter(v => !/^vi/i.test(v.lang));
  return [...vi, ...rest].map(v => ({ name: v.voiceURI || v.name, label: `${/^vi/i.test(v.lang) ? '🇻🇳 ' : ''}${v.name} (${v.lang})${v.localService ? '' : ' · online'}` }));
}

function updateVoiceDetail() {
  const lib = tts.lib, val = $('#tts-voice').value;
  const card = $('#voice-detail-card');
  if (!card) return;
  if (lib === 'vieneu' && typeof VIENEU_VOICES !== 'undefined') {
    card.hidden = false;
    const v = VIENEU_VOICES.find(x => x.id === val) || VIENEU_VOICES[0];
    if (v) {
      $('#vd-name').textContent = v.name;
      $('#vd-tag').textContent = `${v.gender} · ${v.region} · ${v.style}`;
      $('#vd-desc').textContent = v.desc;
    }
  } else if (lib === 'supertonic' && typeof SUPERTONIC_VOICES !== 'undefined') {
    card.hidden = false;
    const v = SUPERTONIC_VOICES.find(x => x.id === val) || SUPERTONIC_VOICES[0];
    if (v) {
      $('#vd-name').textContent = v.name;
      $('#vd-tag').textContent = `${v.gender} · Đa ngôn ngữ`;
      $('#vd-desc').textContent = v.desc;
    }
  } else {
    card.hidden = true;
  }
}
$('#tts-voice').addEventListener('change', updateVoiceDetail);

/* Nghe thử từng giọng trực tiếp */
$('#btn-voice-preview')?.addEventListener('click', async () => {
  const btn = $('#btn-voice-preview');
  if (tts.previewAudio) {
    tts.previewAudio.pause();
    tts.previewAudio = null;
    btn.textContent = '▶ Nghe thử giọng';
    return;
  }
  const lib = tts.lib, val = $('#tts-voice').value;
  let sampleText = 'Xin chào, đây là câu đọc thử của giọng này.';
  if (lib === 'vieneu' && typeof VIENEU_VOICES !== 'undefined') {
    const v = VIENEU_VOICES.find(x => x.id === val) || VIENEU_VOICES[0];
    sampleText = v.sample || sampleText;
  } else if (lib === 'supertonic' && typeof SUPERTONIC_VOICES !== 'undefined') {
    const v = SUPERTONIC_VOICES.find(x => x.id === val) || SUPERTONIC_VOICES[0];
    sampleText = v.sample || sampleText;
  }
  btn.textContent = 'Đang tải…';
  try {
    const url = lib === 'vieneu' ? '/api/vieneu/tts' : (lib === 'supertonic' ? '/api/supertonic/tts' : '/api/edge/tts');
    const body = { text: sampleText, voice: val, rate: 1.0, pitch: 0 };
    if (lib === 'supertonic') body.lang = $('#tts-st-lang')?.value || 'auto';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('Không thể tải giọng thử');
    const blob = await res.blob();
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    tts.previewAudio = audio;
    btn.textContent = '⏸ Đang nghe thử…';
    audio.onended = () => {
      btn.textContent = '▶ Nghe thử giọng';
      tts.previewAudio = null;
    };
    audio.onerror = () => {
      btn.textContent = '▶ Nghe thử giọng';
      tts.previewAudio = null;
    };
    await audio.play();
  } catch (err) {
    toast(err.message, 'err');
    btn.textContent = '▶ Nghe thử giọng';
    tts.previewAudio = null;
  }
});

async function applyLib() {
  tts.lib = $('#tts-lib').value;
  const lib = tts.lib, info = LIBS[lib];
  $('#lib-badge').innerHTML = `<span class="pill ${info.free ? 'free' : ''}">Kho giọng: ${info.badge}</span><span>${info.desc}</span>`;
  $('#row-model').hidden = lib !== 'gemini';
  $('#row-style').hidden = lib !== 'gemini';
  $('#row-locale').hidden = lib !== 'edge';
  $('#row-st-lang').hidden = lib !== 'supertonic';
  $('#row-rate').hidden = !['vieneu', 'supertonic', 'edge', 'capcut', 'browser'].includes(lib);
  $('#row-pitch').hidden = lib !== 'edge';
  $('#row-format').hidden = !['vieneu', 'supertonic', 'edge', 'capcut', 'piper', 'mms'].includes(lib);
  $('#tts-note').textContent = '';
  $('#tts-result').hidden = true;
  if (lib !== 'browser') speechSynthesis?.cancel?.();

  // Cập nhật thẻ cảm xúc tương ứng trên thanh công cụ
  const emotionBtns = $$('.tts-ctrl-bar [data-tag^="[cười]"], .tts-ctrl-bar [data-tag^="<laugh>"]');
  if (lib === 'supertonic') {
    $$('.tts-ctrl-bar [data-tag]').forEach(b => {
      if (b.dataset.tag === '[cười]') { b.dataset.tag = '<laugh>'; b.textContent = '<laugh>'; }
      if (b.dataset.tag === '[thở dài]') { b.dataset.tag = '<sigh>'; b.textContent = '<sigh>'; }
      if (b.dataset.tag === '[hắng giọng]') { b.dataset.tag = '<breath>'; b.textContent = '<breath>'; }
    });
  } else {
    $$('.tts-ctrl-bar [data-tag]').forEach(b => {
      if (b.dataset.tag === '<laugh>') { b.dataset.tag = '[cười]'; b.textContent = '[cười]'; }
      if (b.dataset.tag === '<sigh>') { b.dataset.tag = '[thở dài]'; b.textContent = '[thở dài]'; }
      if (b.dataset.tag === '<breath>') { b.dataset.tag = '[hắng giọng]'; b.textContent = '[hắng giọng]'; }
    });
  }

  try {
    if (lib === 'vieneu') {
      const list = typeof VIENEU_VOICES !== 'undefined' ? VIENEU_VOICES : (await api('/api/vieneu/voices')).voices;
      setVoiceOptions(list);
      $('#tts-voice').value = 'minh_quan';
      updateVoiceDetail();
    } else if (lib === 'supertonic') {
      const list = typeof SUPERTONIC_VOICES !== 'undefined' ? SUPERTONIC_VOICES : (await api('/api/supertonic/voices')).voices;
      setVoiceOptions(list);
      if (typeof SUPERTONIC_LANGS !== 'undefined') {
        $('#tts-st-lang').innerHTML = SUPERTONIC_LANGS.map(l => `<option value="${l.code}">${l.name}</option>`).join('');
      }
      $('#tts-voice').value = 'st_alex';
      updateVoiceDetail();
    } else if (lib === 'edge') {
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
  if (typeof vkAccount !== 'undefined') vkAccount.renderQuota();
  updateLibLock();
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
/** Câu ghi nguồn đã phiên âm (lấy từ máy chủ theo tên miền đang truy cập); không có máy chủ thì bỏ qua */
const suffixCache = {};
async function ttsSuffix(lang) {
  if (suffixCache[lang] !== undefined) return suffixCache[lang];
  try {
    const r = await fetch('/api/tts-suffix?lang=' + lang, { cache: 'no-store' });
    const d = r.ok ? await r.json() : null;
    return (suffixCache[lang] = d?.enabled ? d.text : '');
  } catch { return ''; }
}
function sourceLang(lib, voice, text) {
  if (lib === 'piper' || lib === 'mms') return 'vi';
  if (lib === 'browser') { const v = speechSynthesis.getVoices().find(x => (x.voiceURI || x.name) === voice); return /^vi/i.test(v?.lang || '') ? 'vi' : 'en'; }
  return /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text) ? 'vi' : 'en';
}

/** Thời lượng file âm thanh (giây), không chặn nếu lỗi */
function audioDuration(blob) {
  return new Promise((ok) => { const a = new Audio(); a.preload = 'metadata'; a.onloadedmetadata = () => ok(isFinite(a.duration) ? a.duration : 0); a.onerror = () => ok(0); a.src = URL.createObjectURL(blob); setTimeout(() => ok(0), 3000); });
}

/** Tên file theo nội dung đã nhập, bỏ dấu tiếng Việt. Dài hơn 50 ký tự: lấy 50 ký tự đầu + mốc thời gian. */
function slugVi(str) {
  return String(str).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
function ttsFileName(text, ext) {
  const plain = String(text).replace(/\s+/g, ' ').trim();
  const long = plain.length > 50;
  let base = slugVi(long ? plain.slice(0, 50) : plain) || 'giong-doc';
  if (long) {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    base = base.replace(/-+$/, '') + '_' + `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
  return base + '.' + ext;
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

/** Kho giọng chỉ dành cho Premium: đổi nút thành lời mời nâng cấp */
function updateLibLock() {
  const locked = !!LIBS[tts.lib]?.premium && !isPremium();
  const label = $('#btn-tts-run span');
  if (!tts.speaking && !$('#btn-tts-run').disabled) label.textContent = locked ? 'Nâng cấp Premium để dùng' : 'Tạo giọng đọc';
  if (locked) {
    const libTitle = LIBS[tts.lib]?.badge || 'này';
    $('#tts-note').textContent = `🔒 Kho giọng ${libTitle} chỉ dành cho gói Premium. Bạn vẫn dùng được Edge Neural, Piper, Meta MMS miễn phí.`;
  } else if ($('#tts-note').textContent.startsWith('🔒')) {
    $('#tts-note').textContent = '';
  }
  return locked;
}

$('#btn-tts-run').addEventListener('click', async () => {
  if (updateLibLock()) { showView('plans'); return; }
  const lib = tts.lib, btn = $('#btn-tts-run'), label = btn.querySelector('span');
  if (lib === 'browser' && tts.speaking) { speechSynthesis.cancel(); tts.speaking = false; label.textContent = 'Tạo giọng đọc'; return; }
  const rawText = $('#tts-text').value.trim();
  if (!rawText) return toast('Hãy nhập văn bản cần đọc.', 'err');
  const voice = $('#tts-voice').value, rate = $('#tts-rate').value;

  // 1. Áp dụng từ điển phát âm cá nhân hóa
  let processedText = rawText;
  if (typeof vkDict !== 'undefined' && vkDict.apply) {
    processedText = vkDict.apply(processedText);
  }

  // 2. Chuẩn hóa thẻ cảm xúc phù hợp với từng mô hình
  if (typeof vkTags !== 'undefined' && vkTags.normalizeEmotions) {
    processedText = vkTags.normalizeEmotions(processedText, lib);
  }

  // Kho chạy trong trình duyệt: tự nối câu ghi nguồn (Edge / CapCut do máy chủ nối)
  let spoken = processedText;
  if (['piper', 'mms', 'gemini', 'browser'].includes(lib)) {
    const sfx = await ttsSuffix(sourceLang(lib, voice, processedText));
    if (sfx) spoken = processedText.replace(/[\s.!?…]*$/, '') + '. ' + sfx;
  }
  if (lib === 'browser') {
    // Xóa các thẻ nghỉ khi đọc trên trình duyệt
    const browserSpoken = spoken.replace(/\[(?:nghỉ|nghi|pause|break)\s*[^\]]+\]/gi, '. ');
    speakBrowser(browserSpoken, voice, rate);
    $('#tts-result').hidden = true;
    return;
  }

  const status = s => { label.textContent = s; };
  btn.disabled = true; label.textContent = 'Đang tạo giọng…';

  try {
    let blob = null;
    const post = async (url, body) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const account = typeof vkAccount !== 'undefined' ? vkAccount : null;
      account?.onTtsResponse(res);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (err.quota) account?.onQuotaError(err);
        throw new Error(err.error || 'Lỗi tạo giọng đọc');
      }
      return res.blob();
    };

    const synthOne = async (t) => {
      if (lib === 'vieneu') return post('/api/vieneu/tts', { text: t, voice, rate, pitch: $('#tts-pitch').value });
      if (lib === 'supertonic') return post('/api/supertonic/tts', { text: t, voice, lang: $('#tts-st-lang')?.value || 'auto', rate, pitch: $('#tts-pitch').value });
      if (lib === 'edge') return post('/api/edge/tts', { text: t, voice, rate, pitch: $('#tts-pitch').value });
      if (lib === 'capcut') return post('/api/capcut/tts', { text: t, voice, rate });
      if (lib === 'piper') return synthPiper(t, status);
      if (lib === 'mms') return synthMms(t, status);
      if (lib === 'gemini') return cloudApi.tts(keyGet('gemini'), $('#tts-model').value, t, voice, $('#tts-style').value);
      throw new Error('Kho giọng không hợp lệ');
    };

    // 3. Phân tích các thẻ nghỉ [nghỉ 2s], [nghỉ 500ms]
    const segments = typeof vkTags !== 'undefined' && vkTags.parsePauses
      ? vkTags.parsePauses(spoken)
      : [{ type: 'text', content: spoken }];

    const hasPauses = segments.some(s => s.type === 'pause');

    if (!hasPauses) {
      blob = await synthOne(spoken);
      // Chuyển sang chuẩn phòng thu WAV 48 kHz nếu người dùng chọn định dạng WAV
      if (tts.format === 'wav' && typeof vkAudio !== 'undefined' && !blob.type.includes('wav')) {
        label.textContent = 'Đang chuyển đổi 48 kHz…';
        const samples = await vkAudio.decodeTo48k(blob, 48000);
        blob = vkAudio.f32ToWav48k(samples, 48000);
      }
    } else {
      // Ghép nối âm thanh đa đoạn với khoảng lặng thời lượng chính xác
      const audioChunks = [];
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (seg.type === 'text') {
          label.textContent = `Đang đọc đoạn ${i + 1}/${segments.length}…`;
          const subBlob = await synthOne(seg.content);
          if (subBlob && typeof vkAudio !== 'undefined') {
            const f32 = await vkAudio.decodeTo48k(subBlob, 48000);
            audioChunks.push(f32);
          }
        } else if (seg.type === 'pause' && typeof vkAudio !== 'undefined') {
          const silence = vkAudio.createSilence(seg.sec, 48000);
          audioChunks.push(silence);
        }
      }

      if (typeof vkAudio !== 'undefined' && audioChunks.length) {
        label.textContent = 'Đang ghép nối âm thanh 48 kHz…';
        const totalLen = audioChunks.reduce((acc, c) => acc + c.length, 0);
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of audioChunks) {
          merged.set(chunk, offset);
          offset += chunk.length;
        }
        blob = vkAudio.f32ToWav48k(merged, 48000);
      }
    }

    if (!blob) throw new Error('Không tạo được file âm thanh');

    const ext = blob.type.includes('wav') ? 'wav' : (tts.format === 'wav' ? 'wav' : 'mp3');
    const url = URL.createObjectURL(blob);
    $('#tts-player').src = url;
    $('#tts-download').href = url;
    $('#tts-download').download = ttsFileName(rawText, ext);
    const dlSpan = $('#tts-download span');
    if (dlSpan) dlSpan.textContent = ext === 'wav' ? 'Tải WAV (48 kHz)' : 'Tải MP3';
    $('#tts-result').hidden = false;
    $('#tts-player').play().catch(() => {});

    if (typeof saveTtsHistory === 'function') {
      const voiceOpt = $('#tts-voice').selectedOptions[0];
      saveTtsHistory(blob, {
        text: rawText, fileName: $('#tts-download').download, lib, libLabel: LIBS[lib]?.badge || lib,
        voiceLabel: voiceOpt ? voiceOpt.textContent : voice, duration: await audioDuration(blob)
      });
    }
  } catch (e) { toast(e.message, 'err'); }
  btn.disabled = false; label.textContent = 'Tạo giọng đọc';
  updateLibLock();
});

/* ---------------- Cài đặt / chia sẻ ---------------- */
$('#btn-settings').addEventListener('click', () => {
  if (!keyGate.allowed) return;
  $('#key-groq').value = keyGet('groq'); $('#key-gemini').value = keyGet('gemini');
  $$('.secret-input').forEach(i => i.classList.remove('revealed'));
  openModal('#modal-settings');
});
$('#btn-save-keys').addEventListener('click', async () => {
  let bad = false;
  for (const k of ['gemini', 'groq']) {
    const v = $('#key-' + k).value.trim(), problem = keyProblem(k, v), st = $('#status-' + k);
    if (problem) { bad = true; st.className = 'key-status err'; st.textContent = '✗ ' + problem; continue; }
    store.set(keyName(k), v);
  }
  if (bad) return;
  const btn = $('#btn-save-keys'); btn.disabled = true;
  await refreshModels(true);
  btn.disabled = false;
  if (state.raw.length) renderResult();
});
// Chỉ báo lỗi định dạng khi gõ, không gửi key đi đâu cho tới khi bấm Lưu
['gemini', 'groq'].forEach(k => $('#key-' + k).addEventListener('input', () => {
  const v = $('#key-' + k).value.trim(), problem = keyProblem(k, v), st = $('#status-' + k);
  st.className = 'key-status' + (problem ? ' err' : '');
  st.textContent = problem ? '✗ ' + problem : '';
}));
$$('[data-reveal]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.reveal).classList.toggle('revealed')));

/* Dò model theo API key: chỉ hiện lên danh sách khi key hợp lệ */
const cloud = { gemini: { stt: [], tts: [] }, groq: { stt: [] } };
async function refreshModels(announce = false, only) {
  const jobs = [];
  for (const k of ['gemini', 'groq']) {
    if (only && only !== k) continue;
    const key = keyGet(k), st = $('#status-' + k);
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
  $('#engine-extra').textContent = !keyGate.allowed ? ''
    : n ? `Đã thêm ${n} model đám mây từ API key của bạn.` : 'Muốn dùng Gemini / Groq? Nhập API key ở ⚙ Cài đặt, danh sách model mới nhất sẽ tự hiện ở đây.';
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
  'onnx-community/whisper-large-v3-turbo': 'Chính xác nhất, cần trình duyệt có WebGPU (Chrome/Edge mới) và ~600 MB tải lần đầu.'
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
})();
