'use strict';
/* TXA Voice - tải âm thanh từ link (file trực tiếp hoặc playlist HLS .m3u8).
   HLS: đọc playlist (master -> chọn luồng nhẹ nhất / luồng chỉ có tiếng), tải các đoạn song song,
   giải mã AES-128 nếu có, rồi ghép thành một file trình duyệt giải mã được:
   - .ts (MPEG-TS): tách luồng tiếng AAC/MP3 ra file .aac/.mp3
   - fMP4 (.m4s + EXT-X-MAP): nối init + các đoạn thành .mp4
   - .aac/.mp3 rời: bỏ thẻ ID3 đầu mỗi đoạn rồi nối lại
   Link bị chặn CORS sẽ đi qua /api/fetch-proxy của website. */

const vkLink = (() => {
  const MAX_SEGMENTS = 5000;
  const MAX_BYTES = 600 * 1024 * 1024;
  const PARALLEL = 6;

  let viaProxy = false; // đã biết host chặn CORS thì đi proxy luôn cho các đoạn sau

  const rangeHeader = (range) => range ? { Range: `bytes=${range.start}-${range.start + range.length - 1}` } : {};

  async function proxied(url, range) {
    const r = await fetch('/api/fetch-proxy?url=' + encodeURIComponent(url), { headers: rangeHeader(range) });
    if (r.ok) return r;
    if (r.status === 404) {
      // Bản chạy bằng start.bat: dùng API tải hộ cũ của server Node
      const info = await api('/api/fetch-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
      return fetch(info.url);
    }
    const msg = await r.text().catch(() => '');
    throw new Error(msg || `Máy chủ không tải được link (lỗi ${r.status}).`);
  }

  /** fetch thẳng, lỗi CORS / mạng thì đi qua proxy của website */
  async function get(url, range) {
    if (!viaProxy) {
      try {
        const r = await fetch(url, { credentials: 'omit', headers: rangeHeader(range) });
        if (r.ok) return r;
        if (r.status === 403 || r.status === 404) throw new Error(`Link trả về lỗi ${r.status}. Link HLS thường có hạn dùng, hãy lấy link mới.`);
      } catch (e) {
        if (e.message.startsWith('Link trả về')) throw e;
        viaProxy = true;
      }
    }
    return proxied(url, range);
  }

  const isPlaylistText = (t) => t.trimStart().startsWith('#EXTM3U');
  const attrs = (line) => {
    const out = {};
    line.replace(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g, (_, k, v) => { out[k] = v.replace(/^"|"$/g, ''); });
    return out;
  };

  /**
   * Playlist master: chọn luồng nhẹ nhất có tiếng AAC/MP3 (trình duyệt không giải mã được AC-3 / E-AC-3).
   * Luồng đó khai báo nhóm tiếng riêng (AUDIO="...") thì lấy luồng chỉ có tiếng của nhóm đó cho nhẹ.
   */
  function pickVariant(text, base) {
    const lines = text.split(/\r?\n/);
    const variants = [];
    lines.forEach((l, i) => {
      if (!l.startsWith('#EXT-X-STREAM-INF:')) return;
      const uri = lines.slice(i + 1).find(x => x.trim() && !x.startsWith('#'));
      const a = attrs(l);
      if (uri) variants.push({ bw: Number(a.BANDWIDTH) || Infinity, codecs: a.CODECS || '', audio: a.AUDIO, url: new URL(uri.trim(), base).href });
    });
    const playable = variants.filter(v => !v.codecs || /mp4a|mp3/i.test(v.codecs));
    const list = (playable.length ? playable : variants).sort((a, b) => a.bw - b.bw);
    const media = lines.filter(l => l.startsWith('#EXT-X-MEDIA:')).map(attrs).filter(a => a.TYPE === 'AUDIO' && a.URI);
    for (const v of list) {
      if (!v.audio) continue;
      const group = media.filter(m => m['GROUP-ID'] === v.audio);
      const pick = group.find(m => m.DEFAULT === 'YES') || group[0];
      if (pick) return new URL(pick.URI, base).href;
    }
    if (list[0]) return list[0].url;
    return media[0] ? new URL(media[0].URI, base).href : null;
  }

  /** "#EXT-X-BYTERANGE:<len>[@<offset>]" -> { start, length, end }; thiếu offset thì nối tiếp đoạn trước cùng file */
  function byteRange(value, prev, url) {
    const [len, off] = value.split('@').map(Number);
    const start = Number.isFinite(off) ? off : (prev && prev.url === url ? prev.end : 0);
    return { start, length: len, end: start + len };
  }

  function parseMedia(text, base) {
    const lines = text.split(/\r?\n/);
    let key = null, map = null, range = null, last = null, seq =Number((text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/) || [])[1] || 0);
    const segs = [];
    for (const raw of lines) {
      const l = raw.trim();
      if (!l) continue;
      if (l.startsWith('#EXT-X-KEY:')) {
        const a = attrs(l);
        if (a.METHOD === 'NONE') key = null;
        else if (a.METHOD === 'AES-128') key = { uri: new URL(a.URI, base).href, iv: a.IV || null };
        else throw new Error(`Luồng này được mã hóa bản quyền (${a.METHOD}), không tải được.`);
      } else if (l.startsWith('#EXT-X-MAP:')) {
        const a = attrs(l), mapUrl = new URL(a.URI, base).href;
        map = { url: mapUrl, range: a.BYTERANGE ? byteRange(a.BYTERANGE, null, mapUrl) : null };
      } else if (l.startsWith('#EXT-X-BYTERANGE:')) {
        range = l.slice('#EXT-X-BYTERANGE:'.length);
      } else if (!l.startsWith('#')) {
        const url = new URL(l, base).href;
        const r = range ? byteRange(range, last, url) : null;
        segs.push({ url, range: r, key, seq: seq++ });
        last = r ? { url, end: r.end } : null;
        range = null;
      }
    }
    return { segs, map, live: !/#EXT-X-ENDLIST/.test(text) };
  }

  const keyCache = new Map();
  async function decrypt(buf, key, seq) {
    if (!keyCache.has(key.uri)) {
      keyCache.set(key.uri, get(key.uri).then(r => r.arrayBuffer())
        .then(raw => crypto.subtle.importKey('raw', raw, 'AES-CBC', false, ['decrypt'])));
    }
    const k = await keyCache.get(key.uri);
    let iv = new Uint8Array(16);
    if (key.iv) {
      const hex = key.iv.replace(/^0x/i, '').padStart(32, '0');
      for (let i = 0; i < 16; i++) iv[i] = parseInt(hex.substr(i * 2, 2), 16);
    } else {
      new DataView(iv.buffer).setUint32(12, seq);
    }
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, k, buf));
  }

  /* ---------- Tách tiếng từ MPEG-TS ---------- */
  function tsDemuxer() {
    let pmtPid = -1, audioPid = -1, audioType = 0;
    const out = [];
    let pes = null;
    const flushPes = () => {
      if (!pes) return;
      const b = concat(pes);
      pes = null;
      if (b.length < 9 || b[0] !== 0 || b[1] !== 0 || b[2] !== 1) return;
      const start = 9 + b[8];
      if (start < b.length) out.push(b.subarray(start));
    };
    function push(data) {
      for (let p = 0; p + 188 <= data.length; p += 188) {
        if (data[p] !== 0x47) { // mất đồng bộ: tìm byte 0x47 kế tiếp
          const next = data.indexOf(0x47, p + 1);
          if (next < 0) break;
          p = next - 188;
          continue;
        }
        const pusi = data[p + 1] & 0x40;
        const pid = ((data[p + 1] & 0x1f) << 8) | data[p + 2];
        const afc = (data[p + 3] >> 4) & 3;
        let o = p + 4;
        if (afc === 2) continue;
        if (afc === 3) o += 1 + data[o];
        if (o >= p + 188) continue;
        const payload = data.subarray(o, p + 188);
        if (pid === 0 && pusi) {
          const s = payload.subarray(1 + payload[0]);
          const len = ((s[1] & 0x0f) << 8) | s[2];
          for (let i = 8; i + 4 <= 3 + len - 4; i += 4) {
            const prog = (s[i] << 8) | s[i + 1];
            if (prog !== 0) { pmtPid = ((s[i + 2] & 0x1f) << 8) | s[i + 3]; break; }
          }
        } else if (pid === pmtPid && pusi && audioPid < 0) {
          const s = payload.subarray(1 + payload[0]);
          const len = ((s[1] & 0x0f) << 8) | s[2];
          const infoLen = ((s[10] & 0x0f) << 8) | s[11];
          for (let i = 12 + infoLen; i + 5 <= 3 + len - 4;) {
            const type = s[i], esPid = ((s[i + 1] & 0x1f) << 8) | s[i + 2], esLen = ((s[i + 3] & 0x0f) << 8) | s[i + 4];
            if ([0x0f, 0x03, 0x04].includes(type)) { audioPid = esPid; audioType = type; break; }
            i += 5 + esLen;
          }
        } else if (pid === audioPid) {
          if (pusi) { flushPes(); pes = []; }
          if (pes) pes.push(payload);
        }
      }
    }
    function finish() {
      flushPes();
      if (audioPid < 0) throw new Error('Không tìm thấy luồng tiếng AAC/MP3 trong các đoạn .ts.');
      return audioType === 0x0f ? { parts: out, type: 'audio/aac', ext: 'aac' } : { parts: out, type: 'audio/mpeg', ext: 'mp3' };
    }
    return { push, finish };
  }

  function concat(list) {
    const n = list.reduce((s, b) => s + b.length, 0), out = new Uint8Array(n);
    let o = 0;
    for (const b of list) { out.set(b, o); o += b.length; }
    return out;
  }

  /** Bỏ thẻ ID3 đầu đoạn (HLS packed audio gắn ID3 timestamp vào từng đoạn) */
  function stripId3(b) {
    while (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
      const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
      b = b.subarray(10 + size + (b[5] & 0x10 ? 10 : 0));
    }
    return b;
  }

  function nameFrom(url, ext) {
    const parts = new URL(url).pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const generic = /^(index|playlist|master|prog_index|chunklist.*|media.*|mono|stream.*|\d+p?)(\.m3u8)?$/i;
    const pick = [...parts].reverse().find(p => !generic.test(p)) || new URL(url).hostname;
    return pick.replace(/\.m3u8$/i, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) + '.' + ext;
  }

  async function loadHls(url, text, onProgress) {
    let playlistUrl = url;
    if (/#EXT-X-STREAM-INF|#EXT-X-MEDIA:/.test(text)) {
      playlistUrl = pickVariant(text, url);
      if (!playlistUrl) throw new Error('Playlist không có luồng nào.');
      text = await (await get(playlistUrl)).text();
      if (!isPlaylistText(text)) throw new Error('Luồng con không phải playlist HLS hợp lệ.');
    }
    const { segs, map, live } = parseMedia(text, playlistUrl);
    if (!segs.length) throw new Error('Playlist không có đoạn nào.');
    if (segs.length > MAX_SEGMENTS) throw new Error(`Playlist quá dài (${segs.length} đoạn, tối đa ${MAX_SEGMENTS}).`);

    const bufs = new Array(segs.length);
    let done = 0, bytes = 0, next = 0;
    onProgress?.(0, segs.length);
    async function worker() {
      while (next < segs.length) {
        const i = next++, s = segs[i];
        let b = new Uint8Array(await (await get(s.url, s.range)).arrayBuffer());
        if (s.key) b = await decrypt(b, s.key, s.seq);
        bytes += b.length;
        if (bytes > MAX_BYTES) throw new Error('Luồng quá lớn (hơn 600 MB). Hãy tải file về máy rồi kéo thả vào.');
        bufs[i] = b;
        onProgress?.(++done, segs.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, segs.length) }, worker));

    let result;
    if (map) {
      const init = new Uint8Array(await (await get(map.url, map.range)).arrayBuffer());
      result = { parts: [init, ...bufs], type: 'audio/mp4', ext: 'm4a' };
    } else if (bufs[0][0] === 0x47) {
      const dm = tsDemuxer();
      bufs.forEach((b, i) => { dm.push(b); bufs[i] = null; });
      result = dm.finish();
    } else {
      const first = stripId3(bufs[0]);
      const isAac = first[0] === 0xff && (first[1] & 0xf6) === 0xf0;
      result = { parts: bufs.map(stripId3), type: isAac ? 'audio/aac' : 'audio/mpeg', ext: isAac ? 'aac' : 'mp3' };
    }
    return { blob: new Blob(result.parts, { type: result.type }), name: nameFrom(url, result.ext), segments: segs.length, live };
  }

  /** Tải link: file âm thanh/video trực tiếp hoặc playlist .m3u8 */
  async function load(url, onProgress) {
    viaProxy = false;
    keyCache.clear();
    const res = await get(url);
    const type = res.headers.get('Content-Type') || '';
    const looksHls = /mpegurl/i.test(type) || /\.m3u8(\?|$)/i.test(url);
    if (looksHls || /^text\//i.test(type)) {
      const text = await res.text();
      if (isPlaylistText(text)) return loadHls(url, text, onProgress);
      if (looksHls) throw new Error('Link .m3u8 không trả về playlist hợp lệ.');
      throw new Error('Link này là trang web, không phải file âm thanh/video. Hãy dán link file trực tiếp hoặc link .m3u8.');
    }
    const blob = await res.blob();
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'audio');
    return { blob, name };
  }

  return { load };
})();
