'use strict';
/* VoiceKit - công cụ nâng cao cho Giọng → Chữ:
   - Trình sửa transcript: tách / gộp / xóa dòng, sửa mốc giờ, tìm & thay, hoàn tác
   - Phân biệt người nói (dùng Gemini / Groq key của người dùng)
   - Hàng đợi nhiều file, tải tất cả bằng một file ZIP
   - Lấy transcript + tóm tắt video YouTube công khai (Gemini đọc thẳng link, key của người dùng)
   Mọi lời gọi AI đi thẳng từ trình duyệt tới Google / Groq bằng key của người dùng. */

const vkPro = (() => {
  /* ---------------- Tiện ích ---------------- */
  const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const parseTime = (v) => {
    v = String(v).trim().replace(',', '.');
    if (!v) return NaN;
    const p = v.split(':').map(Number);
    if (p.some(isNaN)) return NaN;
    return p.reduce((a, n) => a * 60 + n, 0);
  };
  const geminiModel = () => (cloud.gemini.stt.find(m => !/transcribe/i.test(m.id)) || { id: 'gemini-2.5-flash' }).id;
  const needKey = () => {
    if (keyGet('gemini') || keyGet('groq')) return true;
    toast('Cần Gemini hoặc Groq API key. Nhập ở ⚙ Cài đặt (đăng nhập trước).', 'err');
    return false;
  };

  /** Lấy mảng JSON đầu tiên trong câu trả lời của AI, cắt bỏ phần bị đứt giữa chừng nếu có */
  function parseJsonLoose(raw) {
    raw = String(raw || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    try { return JSON.parse(raw); } catch { /* thử cứu */ }
    const i = raw.search(/[\[{]/);
    if (i < 0) return null;
    for (let end = raw.lastIndexOf('}'); end > i; end = raw.lastIndexOf('}', end - 1)) {
      for (const tail of ['', ']', ']}']) {
        try { return JSON.parse(raw.slice(i, end + 1) + tail); } catch { /* thử cách khác */ }
      }
    }
    return null;
  }

  /* ---------------- Sửa transcript ---------------- */
  function snapshot() {
    state.undo.push(JSON.stringify(state.view));
    if (state.undo.length > 60) state.undo.shift();
    syncUndo();
  }
  function syncUndo() { const b = $('#btn-undo'); if (b) b.disabled = !state.undo.length; }
  function undo() {
    const prev = state.undo.pop();
    if (!prev) return;
    state.view = JSON.parse(prev);
    syncRaw(); renderRows(); syncUndo();
  }
  const commit = () => { syncRaw(); renderRows(); };

  function editTime(i) {
    const s = state.view[i];
    customPrompt('Mốc giờ bắt đầu của dòng này (mm:ss hoặc số giây, vd 01:23.5):', stamp(s.start, '.').replace(/^00:/, ''), 'Sửa mốc giờ').then(v => {
      if (v == null) return;
      const t = parseTime(v);
      if (isNaN(t) || t < 0) return toast('Mốc giờ không hợp lệ.', 'err');
      snapshot();
      const len = Math.max(0.5, s.end - s.start);
      s.start = t;
      if (s.end <= t) s.end = t + len;
      if (state.view[i - 1] && state.view[i - 1].end > t) state.view[i - 1].end = t;
      commit();
    });
  }
  function splitRow(i, el) {
    const s = state.view[i];
    let at = Math.floor(s.text.length / 2);
    const sel = getSelection();
    if (sel.rangeCount && el.contains(sel.anchorNode)) at = sel.anchorOffset;
    const sp = s.text.indexOf(' ', at);
    if (at <= 0 || at >= s.text.length) at = Math.floor(s.text.length / 2);
    if (sp > 0 && sp - at < 12 && !/\s/.test(s.text[at - 1] || ' ')) at = sp;
    const a = s.text.slice(0, at).trim(), b = s.text.slice(at).trim();
    if (!a || !b) return toast('Không tách được: đặt con trỏ vào giữa câu.', 'err');
    snapshot();
    const mid = s.start + (s.end - s.start) * (a.length / (a.length + b.length));
    state.view.splice(i, 1, { ...s, end: mid, text: a }, { ...s, start: mid, text: b });
    commit();
  }
  function mergeRow(i) {
    const a = state.view[i], b = state.view[i + 1];
    if (!b) return toast('Đây là dòng cuối, không có dòng dưới để gộp.', 'err');
    snapshot();
    state.view.splice(i, 2, { ...a, end: b.end, text: (a.text + ' ' + b.text).replace(/\s+/g, ' ').trim() });
    commit();
  }
  function deleteRow(i) {
    snapshot();
    state.view.splice(i, 1);
    commit();
  }
  function findReplace() {
    const f = $('#fr-find').value;
    if (!f) return toast('Nhập từ cần tìm.', 'err');
    const re = new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const to = $('#fr-replace').value;
    let n = 0;
    snapshot();
    for (const s of state.view) s.text = s.text.replace(re, () => { n++; return to; });
    if (!n) { state.undo.pop(); syncUndo(); return toast('Không tìm thấy từ này.', 'err'); }
    commit();
    toast(`Đã thay ${n} chỗ.`, 'ok');
  }

  /* ---------------- Người nói ---------------- */
  const speakers = () => [...new Set(state.view.map(s => s.speaker).filter(Boolean))];
  function turns(segs) {
    const out = [];
    for (const s of segs) {
      const last = out[out.length - 1];
      if (last && last.speaker === (s.speaker || '')) { last.text += ' ' + s.text; last.end = s.end; }
      else out.push({ speaker: s.speaker || '', start: s.start, end: s.end, text: s.text });
    }
    return out;
  }
  function renameSpeaker(old) {
    customPrompt(`Đổi tên "${old}" thành:`, old, 'Đổi tên người nói').then(v => {
      v = (v || '').trim();
      if (!v || v === old) return;
      snapshot();
      for (const s of state.view) if (s.speaker === old) s.speaker = v;
      commit();
    });
  }

  async function diarize() {
    if (!state.view.length) return;
    if (!needKey()) return;
    const btn = $('#btn-diarize'); btn.disabled = true;
    const gKey = keyGet('gemini');
    const blob = state.media?.blob;
    const useAudio = !!(gKey && blob && blob.size <= 14 * 1024 * 1024 && state.view.length <= 600);
    toast(useAudio ? 'Đang nghe lại âm thanh để phân biệt người nói…' : 'Đang đoán người nói theo nội dung hội thoại (kém chính xác hơn khi có âm thanh + Gemini)…');
    try {
      const rule = 'Gán người nói cho TỪNG dòng. Đặt nhãn "Người 1", "Người 2"… theo thứ tự xuất hiện, cùng một người phải luôn cùng nhãn. ' +
        'Chỉ trả về JSON hợp lệ dạng [{"i":số_dòng,"s":"Người 1"}] cho mọi dòng, không giải thích.';
      const assign = new Map();
      const chunkSize = 400;
      for (let from = 0; from < state.view.length; from += useAudio ? state.view.length : chunkSize) {
        const part = state.view.slice(from, useAudio ? undefined : from + chunkSize);
        const list = part.map((s, k) => `${from + k}|${clock(s.start)}|${s.text}`).join('\n');
        const known = [...new Set(assign.values())];
        const prompt = (useAudio ? 'Nghe audio đính kèm và dựa vào GIỌNG NÓI để phân biệt người nói cho bản ghi sau (định dạng dòng|mốc giờ|nội dung).\n' : 'Dựa vào ngữ cảnh hội thoại để đoán người nói cho bản ghi sau (định dạng dòng|mốc giờ|nội dung).\n') +
          rule + (known.length ? ` Các nhãn đã dùng ở phần trước: ${known.join(', ')}.` : '') + '\n\n' + list;
        let raw;
        if (useAudio) {
          const b64 = await cloudApi.toBase64(blob);
          const mime = (blob.type || 'audio/mp3').replace(/^video\//, 'audio/').split(';')[0];
          const d = await cloudApi.gjson(gKey, `/models/${geminiModel()}:generateContent`, {
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
            generationConfig: { responseMimeType: 'application/json' }
          });
          raw = cloudApi.textOf(d).join('\n');
        } else raw = await cloudApi.chat(prompt);
        const arr = parseJsonLoose(raw);
        if (!Array.isArray(arr)) throw new Error('AI trả về dữ liệu không đọc được, hãy thử lại.');
        for (const r of arr) if (Number.isInteger(r.i) && r.s) assign.set(r.i, String(r.s).trim());
      }
      if (!assign.size) throw new Error('AI không gán được người nói nào.');
      snapshot();
      state.view.forEach((s, i) => { if (assign.has(i)) s.speaker = assign.get(i); });
      commit();
      toast(`Đã nhận ${speakers().length} người nói. Nhấp vào nhãn để đổi tên.`, 'ok');
    } catch (e) { toast(e.message || 'Không phân biệt được người nói.', 'err'); }
    btn.disabled = false;
  }

  function toDoc() {
    const sum = $('#summary').hidden ? '' : `<h2>Tóm tắt</h2><p>${esc($('#summary').textContent).replace(/\n/g, '<br>')}</p>`;
    const body = speakers().length
      ? turns(state.view).map(t => `<p><b>${esc(t.speaker)}</b> <small>[${clock(t.start)}]</small><br>${esc(t.text)}</p>`).join('')
      : state.view.map(s => `<p><small>[${clock(s.start)}]</small> ${esc(s.text)}</p>`).join('');
    return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(state.meta.name || 'Transcript')}</title></head><body style="font-family:Calibri,Arial;font-size:12pt"><h1>${esc(state.meta.name || 'Transcript')}</h1>${sum}<h2>Nội dung</h2>${body}</body></html>`;
  }

  function onResult() {
    $('#edit-bar').hidden = !state.view.length;
    syncUndo();
  }

  /* ---------------- ZIP (không nén) ---------------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function makeZip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const d = new Date();
    const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, dosTime, true); h.setUint16(12, dosDate, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
      parts.push(h, name, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(12, dosTime, true); c.setUint16(14, dosDate, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(c, name);
      offset += 30 + name.length + data.length;
    }
    const csize = central.reduce((a, p) => a + p.byteLength, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, offset, true);
    return new Blob([...parts, ...central, e], { type: 'application/zip' });
  }

  /* ---------------- Hàng đợi nhiều file ---------------- */
  const queue = [];
  let running = false, stopFlag = false, seq = 0;
  const ST = { wait: 'Chờ', run: 'Đang chạy…', done: 'Xong', err: 'Lỗi' };

  function enqueue(files) {
    for (const f of files) queue.push({ id: ++seq, file: f, name: f.name, status: 'wait', res: null });
    renderQueue();
    toast(`Đã thêm ${files.length} file vào hàng đợi. Chọn công cụ rồi bấm "Chạy hàng đợi".`, 'ok');
  }
  function renderQueue() {
    $('#queue-card').hidden = !queue.length;
    const list = $('#queue-list'); list.textContent = '';
    for (const q of queue) {
      const row = document.createElement('div'); row.className = 'q-row q-' + q.status;
      row.innerHTML = `<span class="q-name"></span><span class="q-st">${ST[q.status]}</span><button type="button" class="icon-btn sm" title="Bỏ khỏi hàng đợi">✕</button>`;
      row.querySelector('.q-name').textContent = `${q.name} · ${fmtSize(q.file.size)}`;
      if (q.res) { row.classList.add('clickable'); row.title = 'Xem kết quả'; row.querySelector('.q-name').addEventListener('click', () => showItem(q)); }
      row.querySelector('button').addEventListener('click', () => { if (running) return toast('Đang chạy, hãy dừng hàng đợi trước.', 'err'); queue.splice(queue.indexOf(q), 1); renderQueue(); });
      list.appendChild(row);
    }
    const done = queue.filter(q => q.res).length;
    $('#q-summary').textContent = `${done}/${queue.length} file xong`;
    $('#q-run').textContent = running ? '⏹ Dừng sau file này' : '▶ Chạy hàng đợi';
    $('#q-zip').disabled = !done;
  }
  async function showItem(q) {
    if (state.busy || running) return toast('Đang xử lý, đợi xong rồi xem.', 'err');
    await setMedia(q.file, q.name);
    state.raw = q.res.raw.map(s => ({ ...s })); state.text = q.res.text; state.meta = { ...q.res.meta };
    $('#empty').hidden = true; $('#progress-box').hidden = true; $('#result').hidden = false; $('#result-tools').hidden = false;
    state.undo = [];
    const sum = $('#summary'); if (q.res.summary) { sum.textContent = q.res.summary; sum.hidden = false; } else sum.hidden = true;
    renderResult();
  }
  async function runQueue() {
    if (running) { stopFlag = true; return toast('Sẽ dừng sau khi xong file đang chạy.'); }
    if (state.busy) return;
    const todo = queue.filter(q => q.status === 'wait' || q.status === 'err');
    if (!todo.length) return toast('Hàng đợi không còn file nào cần chạy.', 'err');
    running = true; stopFlag = false;
    let first = true;
    for (const q of todo) {
      if (stopFlag) break;
      q.status = 'run'; renderQueue();
      await setMedia(q.file, q.name);
      const ok = await runTranscribe({ skipConfirm: !first });
      if (first && !ok && !state.busy && !q.res && !state.raw.length) { q.status = 'wait'; renderQueue(); break; } // người dùng hủy ở hộp xác nhận
      first = false;
      if (ok) q.res = { raw: state.raw.map(s => ({ ...s })), text: state.text, meta: { ...state.meta }, summary: $('#summary').hidden ? '' : $('#summary').textContent };
      q.status = ok ? 'done' : 'err';
      renderQueue();
    }
    running = false; stopFlag = false; renderQueue();
    const done = queue.filter(q => q.res).length;
    toast(`Hàng đợi xong: ${done}/${queue.length} file thành công.`, done ? 'ok' : 'err');
  }
  function downloadZip() {
    const fmt = $('#q-fmt').value;
    const keep = { raw: state.raw, view: state.view, text: state.text, meta: state.meta };
    const maxChars = Number($('#sub-len').value);
    const files = [], used = new Set();
    for (const q of queue) {
      if (!q.res) continue;
      state.raw = q.res.raw; state.view = splitSegments(q.res.raw, maxChars); state.text = q.res.text; state.meta = q.res.meta;
      let base = q.name.replace(/\.[^.]+$/, ''), n = base, k = 1;
      while (used.has(n)) n = `${base}-${++k}`;
      used.add(n);
      files.push({ name: `${n}.${fmt}`, data: build(fmt)[0] });
    }
    Object.assign(state, keep);
    download(`voicekit-${files.length}-file.zip`, makeZip(files), 'application/zip');
  }

  /* ---------------- YouTube ---------------- */
  function ytId(u) {
    try {
      const url = new URL(u.trim());
      const h = url.hostname.replace(/^www\.|^m\./, '');
      if (h === 'youtu.be') return url.pathname.slice(1, 12);
      if (h === 'youtube.com' || h === 'music.youtube.com') {
        if (url.pathname === '/watch') return url.searchParams.get('v');
        const m = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{11})/);
        if (m) return m[1];
      }
    } catch { /* không phải link */ }
    return null;
  }
  const fmtLen = (s) => s ? clock(s) : '';
  function ytCard(info, msg = '', bad = false) {
    const c = $('#yt-card'); c.hidden = false; c.classList.toggle('bad', bad);
    c.innerHTML = `<img src="${esc(info.thumbnail)}" alt="" loading="lazy"><div><strong>${esc(info.title || 'Video YouTube')}</strong><span class="muted small">${esc(info.author || '')}${info.seconds ? ' · ' + fmtLen(info.seconds) : ''}</span><span class="yt-msg">${esc(msg)}</span></div>`;
  }

  async function runYoutube() {
    if (state.busy || running) return;
    const id = ytId($('#yt-url').value);
    if (!id) return toast('Link YouTube không hợp lệ. Dán dạng youtube.com/watch?v=… hoặc youtu.be/…', 'err');
    const gKey = keyGet('gemini');
    if (!gKey) {
      return customAlert('Tính năng này dùng Gemini API key của bạn để đọc video YouTube (Gemini xem được thẳng link, không cần tải video).\n\nĐăng nhập, bấm ⚙ Cài đặt, dán Gemini key (lấy miễn phí tại aistudio.google.com/app/apikey) rồi thử lại. Groq không đọc được video.', 'Cần Gemini API key');
    }
    const btn = $('#btn-yt'); btn.disabled = true; btn.textContent = 'Đang kiểm tra…';
    setBusy(true);
    try {
      setProgress('Đang kiểm tra video…', 'Xác nhận video là công khai.');
      let info;
      try {
        const r = await fetch('/api/youtube/check?v=' + id);
        info = await r.json();
      } catch { throw new Error('Không kiểm tra được video lúc này, hãy thử lại.'); }
      if (!info.ok) {
        ytCard(info, info.error, true);
        throw new Error(info.error || 'Video không công khai.');
      }
      ytCard(info, '✓ Video công khai');

      const t0 = performance.now();
      const wantSpk = $('#yt-spk').checked;
      const lang = $('#language').value;
      const langNote = lang === 'auto' ? 'tự nhận diện ngôn ngữ' : `ngôn ngữ chính: ${$('#language').selectedOptions[0].textContent}`;
      const URL_ = `https://www.youtube.com/watch?v=${id}`;
      const CH = 1500; // giây mỗi lượt gọi, để câu trả lời không bị cắt giữa chừng
      const spans = [];
      if (info.seconds > CH * 1.2) for (let a = 0; a < info.seconds; a += CH) spans.push([a, Math.min(info.seconds, a + CH)]);
      else spans.push(null);

      const segments = [];
      for (let k = 0; k < spans.length; k++) {
        const span = spans[k];
        setProgress('Gemini đang xem và chép lời video…', spans.length > 1 ? `Phần ${k + 1}/${spans.length} (${clock(span[0])}–${clock(span[1])})` : 'Video dài sẽ mất vài phút.', spans.length > 1 ? k / spans.length : null);
        const part = { file_data: { file_uri: URL_ } };
        if (span) part.video_metadata = { start_offset: `${span[0]}s`, end_offset: `${span[1]}s` };
        const prompt = `Chép lại chính xác toàn bộ lời nói trong video${span ? ` (chỉ đoạn từ giây ${span[0]} đến giây ${span[1]})` : ''} (${langNote}), giữ nguyên ngôn ngữ gốc, thêm dấu câu đúng, bỏ qua nhạc và âm thanh không phải lời nói. ` +
          `Chia thành các đoạn 3-10 giây. Mốc "start"/"end" là SỐ GIÂY tính từ đầu video gốc. ` +
          (wantSpk ? 'Thêm "speaker" ("Người 1", "Người 2"… theo thứ tự xuất hiện, cùng người cùng nhãn). ' : '') +
          `Chỉ trả về JSON hợp lệ: {"segments":[{"start":0,"end":5,"${wantSpk ? 'speaker":"Người 1","' : ''}text":"..."}]}`;
        const d = await cloudApi.gjson(gKey, `/models/${geminiModel()}:generateContent`, {
          contents: [{ parts: [part, { text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 65536 }
        });
        const parsed = parseJsonLoose(cloudApi.textOf(d).join('\n'));
        let segs = (Array.isArray(parsed) ? parsed : parsed?.segments || []).map(s => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, speaker: wantSpk && s.speaker ? String(s.speaker).trim() : undefined, text: String(s.text || '').trim() })).filter(s => s.text);
        // Nếu Gemini tính giờ từ đầu đoạn cắt thay vì đầu video, cộng bù
        if (span && span[0] > 0 && segs.length && Math.min(...segs.map(s => s.start)) < span[0] * 0.5) segs = segs.map(s => ({ ...s, start: s.start + span[0], end: s.end + span[0] }));
        segments.push(...segs);
      }
      if (!segments.length) throw new Error('Gemini không chép được lời nào (video có thể không có tiếng nói hoặc bị hạn chế).');
      segments.sort((a, b) => a.start - b.start);
      segments.forEach((s, i) => { s.id = i + 1; if (s.end <= s.start) s.end = (segments[i + 1]?.start ?? s.start + 4); });

      clearMedia();
      state.yt = { id, title: info.title };
      const r = { text: segments.map(s => s.text).join(' '), segments, duration: info.seconds || segments[segments.length - 1].end, model: 'Gemini · YouTube', elapsed: (performance.now() - t0) / 1000, summary: '' };

      if ($('#yt-sum').checked) {
        setProgress('Đang tóm tắt video…', 'Gemini đọc bản ghi vừa chép.');
        try {
          const tx = segments.map(s => `[${clock(s.start)}] ${s.speaker ? s.speaker + ': ' : ''}${s.text}`).join('\n');
          r.summary = await cloudApi.chat(`Bạn là trợ lý tóm tắt video. Dựa HOÀN TOÀN vào bản ghi có mốc giờ của video "${info.title}" dưới đây, viết bằng tiếng Việt:\n1) TÓM TẮT: 3-5 câu.\n2) Ý CHÍNH: 5-8 gạch đầu dòng.\n3) MỤC LỤC THEO MỐC GIỜ: mỗi dòng "mm:ss – tiêu đề ngắn".\nKhông bịa thông tin ngoài bản ghi.\n\n${tx}`);
        } catch (e) { toast('Đã chép lời nhưng tóm tắt lỗi: ' + e.message, 'err'); }
      }
      state.yt = { id, title: info.title };
      finishResult(r);
    } catch (e) {
      if (!state.view.length) $('#empty').hidden = false;
      toast(e.message || 'Không xử lý được video.', 'err');
    }
    setBusy(false);
    btn.disabled = false; btn.textContent = 'Lấy transcript';
    $('#progress-box').hidden = true;
  }

  /* ---------------- Gắn sự kiện ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    $('#btn-undo').addEventListener('click', undo);
    $('#fr-all').addEventListener('click', findReplace);
    $('#fr-find').addEventListener('keydown', e => { if (e.key === 'Enter') findReplace(); });
    $('#btn-diarize').addEventListener('click', diarize);
    $('#q-run').addEventListener('click', runQueue);
    $('#q-clear').addEventListener('click', () => { if (running) return toast('Đang chạy, hãy dừng hàng đợi trước.', 'err'); queue.length = 0; renderQueue(); });
    $('#q-zip').addEventListener('click', downloadZip);
    $('#btn-yt').addEventListener('click', runYoutube);
    $('#yt-url').addEventListener('keydown', e => { if (e.key === 'Enter') runYoutube(); });
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && document.activeElement?.closest?.('#view-stt') && !document.activeElement.matches('input,textarea') && state.undo.length) { e.preventDefault(); undo(); }
    });
  });

  return { queue, enqueue, snapshot, editTime, splitRow, mergeRow, deleteRow, speakers, turns, renameSpeaker, toDoc, onResult };
})();
