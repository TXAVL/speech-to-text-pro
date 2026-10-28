/* =====================================================================
 * ĐỌC PHỤ ĐỀ SRT THÀNH GIỌNG NÓI (Premium)
 * Mỗi câu phụ đề đọc riêng rồi đặt đúng mốc thời gian. Câu đọc dài hơn khung
 * giờ được tăng tốc (giữ nguyên cao độ), nhạc nền tự nhỏ lại khi có giọng.
 * Toàn bộ xử lý âm thanh chạy trong trình duyệt.
 * ===================================================================== */
const vkSrt = (() => {
  const RATE = 24000; // giọng Edge / CapCut gốc là 24 kHz, đủ cho lồng tiếng và nhẹ RAM khi phụ đề dài

  /** "00:01:02,500" / "01:02.5" -> giây */
  function toSec(s) {
    const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?$/);
    if (!m) return NaN;
    return (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] + (m[4] ? Number('0.' + m[4].padEnd(3, '0')) : 0);
  }

  /** Bỏ thẻ định dạng phụ đề (<i>, <font>, {\an8}) và gộp dòng */
  const cleanCue = (t) => t.replace(/<[^>]+>|\{[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();

  /** Đọc nội dung SRT / VTT thành danh sách câu { start, end, text }, sắp theo thời gian */
  function parse(text) {
    const cues = [];
    const blocks = String(text).replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/);
    for (const b of blocks) {
      const lines = b.split('\n');
      const i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const [a, z] = lines[i].split('-->');
      const start = toSec(a), end = toSec((z || '').trim().split(/\s+/)[0]);
      const t = cleanCue(lines.slice(i + 1).join(' '));
      if (!isFinite(start) || !isFinite(end) || !t) continue;
      cues.push({ start, end: Math.max(end, start), text: t });
    }
    return cues.sort((x, y) => x.start - y.start);
  }

  /** Văn bản có phải phụ đề không: dòng đầu có nội dung (sau số thứ tự / WEBVTT) là mốc thời gian */
  function looks(text) {
    const head = String(text).replace(/^﻿/, '').trimStart().split('\n', 4);
    return head.some(l => /^\s*(?:\d+:)?\d{1,2}:\d{1,2}[,.]\d{1,3}\s*-->\s*/.test(l));
  }

  function build(cues) {
    const p = (n, l = 2) => String(n).padStart(l, '0');
    const stamp = (sec) => {
      const ms = Math.max(0, Math.round(sec * 1000));
      return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
    };
    return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
  }

  /** Cắt khoảng lặng đầu/cuối của câu vừa đọc, chừa 30 ms cho tự nhiên */
  function trim(f) {
    const th = 0.008, pad = Math.round(RATE * 0.03);
    let a = 0, z = f.length - 1;
    while (a < z && Math.abs(f[a]) < th) a++;
    while (z > a && Math.abs(f[z]) < th) z--;
    return f.subarray(Math.max(0, a - pad), Math.min(f.length, z + pad + 1));
  }

  /**
   * Tăng tốc giữ nguyên cao độ (WSOLA): ghép các khung 30 ms chồng nhau,
   * mỗi khung dời trong ±10 ms tới chỗ khớp sóng nhất với khung trước để không bị rè.
   */
  function stretch(x, speed) {
    if (speed <= 1.01) return x;
    const N = Math.round(RATE * 0.03), Hs = N >> 1, Ha = Hs * speed, tol = Math.round(RATE * 0.01);
    const win = new Float32Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    const outLen = Math.round(x.length / speed);
    const out = new Float32Array(outLen + N), norm = new Float32Array(outLen + N);
    let prev = 0;
    for (let k = 0; ; k++) {
      const ideal = Math.round(k * Ha), o = k * Hs;
      if (ideal + N + tol >= x.length || o + N > out.length) break;
      let best = ideal;
      if (k > 0) {
        const ref = prev + Hs;
        let bestScore = -Infinity;
        for (let c = Math.max(0, ideal - tol); c <= ideal + tol; c += 2) {
          let s = 0;
          for (let i = 0; i < N; i += 4) s += x[c + i] * x[ref + i];
          if (s > bestScore) { bestScore = s; best = c; }
        }
      }
      for (let i = 0; i < N; i++) { out[o + i] += x[best + i] * win[i]; norm[o + i] += win[i]; }
      prev = best;
    }
    for (let i = 0; i < outLen; i++) out[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
    return out.subarray(0, outLen);
  }

  /** Chạy fn cho từng phần tử với tối đa `limit` việc cùng lúc, giữ đúng thứ tự kết quả */
  async function pool(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const run = async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); } };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
    return out;
  }

  /**
   * Tạo file giọng đọc khớp phụ đề.
   * opts: synth(text) -> Blob, decode(blob, rate) -> Float32Array, concurrency, fit, maxSpeed,
   *       music (Blob | null), musicVol (0..1), tail (Blob | null: câu ghi nguồn đọc sau câu cuối), onStatus(text, pct)
   * Trả về { blob (WAV), srt, overflow (số câu vẫn tràn khung), sped (số câu phải tăng tốc) }
   */
  async function render(cues, opts) {
    const { synth, decode, onStatus = () => {} } = opts;
    let done = 0;
    const clips = await pool(cues, opts.concurrency || 1, async (c) => {
      const f = trim(await decode(await synth(c.text), RATE));
      onStatus(`Đang đọc câu ${++done}/${cues.length}`, Math.round(done / cues.length * 90));
      return f;
    });

    onStatus('Đang khớp thời gian', 92);
    const placed = [];
    let cursor = 0, overflow = 0, sped = 0;
    for (let i = 0; i < cues.length; i++) {
      const c = cues[i], start = Math.max(c.start, cursor);
      // Câu được phép đọc lấn sang khoảng trống trước câu kế tiếp
      const limit = (i + 1 < cues.length ? Math.max(cues[i + 1].start, c.end) : Infinity) - start;
      let f = clips[i];
      const need = f.length / RATE / limit;
      if (opts.fit && need > 1.02) {
        f = stretch(f, Math.min(need, opts.maxSpeed || 1.5));
        sped++;
      }
      const d = f.length / RATE;
      if (d > limit + 0.05) overflow++;
      placed.push({ start, end: start + d, f, text: c.text });
      cursor = start + d;
      clips[i] = null;
    }

    let tail = null;
    if (opts.tail) tail = trim(await decode(opts.tail, RATE));
    const tailAt = cursor + 0.6;
    const endSec = Math.max(cursor, cues.at(-1).end) + (tail ? 0.6 + tail.length / RATE : 0) + 0.5;
    const total = Math.ceil(endSec * RATE);
    const out = new Float32Array(total);
    for (const p of placed) {
      out.set(p.f.subarray(0, total - Math.round(p.start * RATE)), Math.round(p.start * RATE));
      p.f = null;
    }
    if (tail) out.set(tail, Math.round(tailAt * RATE));

    if (opts.music) {
      onStatus('Đang trộn nhạc nền', 96);
      mixMusic(out, await decode(opts.music, RATE), placed, opts.musicVol ?? 0.25);
    }

    onStatus('Đang xuất file', 99);
    return {
      blob: vkAudio.f32ToWav48k(out, RATE),
      srt: build(placed.map(p => ({ start: p.start, end: p.end, text: p.text }))),
      overflow, sped
    };
  }

  /**
   * Trộn nhạc nền lặp lại cho hết độ dài, tự nhỏ còn 30% khi có giọng (ducking)
   * với độ trễ lên/xuống mượt, mờ dần ở đầu và cuối.
   */
  function mixMusic(out, music, placed, vol) {
    if (!music.length) return;
    const B = Math.round(RATE * 0.01), blocks = Math.ceil(out.length / B);
    const speaking = new Uint8Array(blocks);
    for (const p of placed) {
      const a = Math.max(0, Math.floor((p.start - 0.15) * 100)), z = Math.min(blocks, Math.ceil((p.end + 0.25) * 100));
      speaking.fill(1, a, z);
    }
    const env = new Float32Array(blocks);
    let g = 1;
    for (let b = 0; b < blocks; b++) {
      const target = speaking[b] ? 0.3 : 1;
      g += (target - g) * (target < g ? 0.25 : 0.05); // xuống nhanh ~40 ms, lên chậm ~200 ms
      env[b] = g;
    }
    const fadeIn = RATE, fadeOut = RATE * 2;
    for (let i = 0; i < out.length; i++) {
      let m = music[i % music.length] * vol * env[(i / B) | 0];
      if (i < fadeIn) m *= i / fadeIn;
      if (i > out.length - fadeOut) m *= (out.length - i) / fadeOut;
      out[i] += m;
    }
  }

  return { parse, looks, build, render, stretch, RATE };
})();

if (typeof window !== 'undefined') window.vkSrt = vkSrt;
