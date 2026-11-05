// VieNeu-TTS v3 Turbo (model thật, mã nguồn mở trên Hugging Face: pnnbao-ump/VieNeu-TTS-v3-Turbo, 48 kHz)
// Chạy miễn phí qua Space ZeroGPU chính chủ bằng Gradio API. v4 là bản độc quyền chỉ có qua API vieneu.io nên không dùng ở đây.
// Tùy chọn: đặt secret HF_TOKEN (npx wrangler secret put HF_TOKEN) để được hạn mức ZeroGPU cao hơn.

const SPACE = 'https://pnnbao-ump-vieneu-tts-v3-turbo.hf.space';

// Tên giọng dựng sẵn của Space; id có tiền tố vi_ để hệ thống nhận ra là tiếng Việt
export const VIENEU3_VOICES = [
  { id: 'vi_hai_dang', space: 'Hải Đăng', name: 'Hải Đăng', gender: 'Nam', label: 'Hải Đăng (Nam)' },
  { id: 'vi_thien_minh', space: 'Thiện Minh', name: 'Thiện Minh', gender: 'Nam', label: 'Thiện Minh (Nam)' },
  { id: 'vi_quang_son', space: 'Quang Sơn', name: 'Quang Sơn', gender: 'Nam', label: 'Quang Sơn (Nam)' },
  { id: 'vi_thien_tam_duc', space: 'Thiền Tâm Đức', name: 'Thiền Tâm Đức', gender: 'Nam', label: 'Thiền Tâm Đức (Nam)' },
  { id: 'vi_adam_bua', space: 'Adam bựa', name: 'Adam bựa', gender: 'Nam', label: 'Adam bựa (Nam, vui nhộn)' },
  { id: 'vi_mai_anh', space: 'Mai Anh', name: 'Mai Anh', gender: 'Nữ', label: 'Mai Anh (Nữ)' },
  { id: 'vi_truc_ly', space: 'Trúc Ly', name: 'Trúc Ly', gender: 'Nữ', label: 'Trúc Ly (Nữ)' },
  { id: 'vi_thuy_dung', space: 'Thùy Dung', name: 'Thùy Dung', gender: 'Nữ', label: 'Thùy Dung (Nữ)' },
  { id: 'vi_ngoc_huyen', space: 'Ngọc Huyền', name: 'Ngọc Huyền', gender: 'Nữ', label: 'Ngọc Huyền (Nữ)' },
  { id: 'vi_ngoc_tran', space: 'Ngọc Trân', name: 'Ngọc Trân', gender: 'Nữ', label: 'Ngọc Trân (Nữ)' }
];

export const VIENEU3_MAX_CHARS = 800; // mỗi lượt gọi; trình duyệt tự chia đoạn dài (xem app.js)

// Lỗi có phân loại để giao diện hiện đúng thông báo: busy = Space đang đông / đang khởi động, quota = hết hạn mức ZeroGPU
function fail(kind, msg, retryAfter) { const e = new Error(msg); e.kind = kind; e.retryAfter = retryAfter; return e; }

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Đọc luồng SSE của Gradio đến khi có "complete" hoặc "error"
async function readResult(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', event = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (event === 'complete') { reader.cancel().catch(() => {}); return JSON.parse(data); }
        if (event === 'error') { reader.cancel().catch(() => {}); throw fail(/quota|gpu|exceeded|limit/i.test(data) ? 'quota' : 'busy', data && data !== 'null' ? data : 'máy chủ báo lỗi', 60); }
      }
    }
  }
  throw fail('busy', 'máy chủ không trả kết quả', 20);
}

export function vieneu3Synthesizer(env) {
  return async function vieneu3Synthesize({ text, voice }) {
    const v = VIENEU3_VOICES.find(x => x.id === voice) || VIENEU3_VOICES[0];
    const clean = String(text || '')
      .replace(/\[(?:nghỉ|nghi|pause|break)\s*[0-9.]+\s*(?:ms|s|giây|giay)?\]/gi, '. ')
      .replace(/<laugh>/gi, '[cười]').replace(/<sigh>/gi, '[thở dài]').replace(/<breath>/gi, '[hắng giọng]')
      .replace(/\s+/g, ' ').trim();
    if (clean.length > VIENEU3_MAX_CHARS) throw new Error(`Mỗi lượt VieNeu v3 tối đa ${VIENEU3_MAX_CHARS} ký tự.`);

    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'TXA-Voice-Worker' };
    if (env.HF_TOKEN) headers.Authorization = `Bearer ${env.HF_TOKEN}`;

    // Space có thể đang ngủ: thử lại vài lần
    let eventId = null, lastErr = '';
    for (let k = 0; k < 4 && !eventId; k++) {
      const r = await fetch(`${SPACE}/gradio_api/call/synthesize`, {
        method: 'POST', headers,
        body: JSON.stringify({ data: [clean, v.space, null, 0.8, 25, 0.95, 1.2, 300, 256] })
      });
      if (r.ok) eventId = (await r.json()).event_id;
      else { lastErr = `HTTP ${r.status}`; await sleep(2500 * (k + 1)); }
    }
    if (!eventId) throw fail(/429/.test(lastErr) ? 'quota' : 'busy', `Không kết nối được máy chủ giọng VieNeu (${lastErr}).`, 45);

    const sse = await fetch(`${SPACE}/gradio_api/call/synthesize/${eventId}`, { signal: AbortSignal.timeout(110000), headers: { ...headers, Accept: 'text/event-stream' } });
    if (!sse.ok) throw fail('busy', `máy chủ trả về HTTP ${sse.status}`, 30);
    const out = await readResult(sse);
    const file = Array.isArray(out) ? out[0] : null;
    const url = file?.url || (file?.path ? `${SPACE}/gradio_api/file=${file.path}` : '');
    if (!url) throw new Error('máy chủ không trả file âm thanh');
    const a = await fetch(url, { headers: env.HF_TOKEN ? { Authorization: `Bearer ${env.HF_TOKEN}` } : {} });
    if (!a.ok) throw new Error(`Không tải được âm thanh (HTTP ${a.status})`);
    return a.arrayBuffer();
  };
}
