// Microsoft Edge Neural TTS cho Cloudflare Worker (chỉ dùng Web API chuẩn, không cần Node).
// Trình duyệt không tự gọi được Edge TTS (Microsoft chặn Origin lạ) nên Worker đóng vai proxy mỏng.

const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VOICES_URL = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TOKEN}`;
const WSS_URL = 'https://api.msedgeservices.com/tts/cognitiveservices/websocket/v1';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
const ORIGIN = 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold';

let voicesCache = null;

export async function edgeVoices() {
  if (!voicesCache) {
    const res = await fetch(VOICES_URL, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error('Không lấy được danh sách giọng (' + res.status + ')');
    voicesCache = (await res.json()).map(v => ({ name: v.ShortName, gender: v.Gender, locale: v.Locale, label: v.FriendlyName }));
  }
  return voicesCache;
}

async function secMsGec(clockOffsetMs = 0) {
  const ticks = Math.floor((Date.now() + clockOffsetMs) / 1000) + 11644473600;
  const rounded = ticks - (ticks % 300);
  const data = new TextEncoder().encode(`${rounded * 10000000}${TOKEN}`);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

const hex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

async function openSocket() {
  let offset = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const url = `${WSS_URL}?Ocp-Apim-Subscription-Key=${TOKEN}&Sec-MS-GEC=${await secMsGec(offset)}&Sec-MS-GEC-Version=1-143.0.3650.96&ConnectionId=${hex(16)}`;
    const res = await fetch(url, { headers: { Upgrade: 'websocket', 'User-Agent': UA, Origin: ORIGIN } });
    if (res.webSocket) return res.webSocket;
    // Lệch đồng hồ -> 403, lấy giờ server để thử lại
    const serverDate = Date.parse(res.headers.get('date') || '');
    if (res.status === 403 && Number.isFinite(serverDate)) { offset = serverDate - Date.now(); continue; }
    throw new Error('Edge TTS từ chối kết nối (' + res.status + ')');
  }
  throw new Error('Edge TTS từ chối kết nối.');
}

/** Trả về Uint8Array MP3. rate: 0.5-2, pitch: Hz (-50..50). */
export async function edgeSynthesize({ text, voice = 'vi-VN-HoaiMyNeural', rate = 1, pitch = 0 }) {
  const locale = (voice.match(/\b[a-z]{2,}-[A-Z]{2}\b/) || ['vi-VN'])[0];
  const pct = Math.round((Number(rate) - 1) * 100);
  const hz = Math.round(Number(pitch) || 0);
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${locale}">` +
    `<voice name="${xml(voice)}"><prosody pitch="${hz >= 0 ? '+' : ''}${hz}Hz" rate="${pct >= 0 ? '+' : ''}${pct}%" volume="+0%">${xml(text)}</prosody></voice></speak>`;

  const ws = await openSocket();
  ws.accept();
  const dec = new TextDecoder();
  const chunks = [];

  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Edge TTS quá thời gian chờ.')), 60000);
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string') {
        if (e.data.includes('Path:turn.end')) { clearTimeout(timer); resolve(); }
        return;
      }
      const buf = new Uint8Array(e.data);
      const headerLen = (buf[0] << 8) | buf[1];
      const header = dec.decode(buf.subarray(2, 2 + headerLen));
      if (header.includes('Path:audio')) chunks.push(buf.subarray(2 + headerLen));
    });
    ws.addEventListener('close', () => { clearTimeout(timer); resolve(); });
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Edge TTS lỗi kết nối WebSocket.')); });
  });

  ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
    JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-96kbitrate-mono-mp3' } } } }));
  ws.send(`X-RequestId:${hex(16)}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`);

  try { await done; } finally { try { ws.close(); } catch {} }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (!total) throw new Error('Edge TTS không trả về âm thanh.');
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
