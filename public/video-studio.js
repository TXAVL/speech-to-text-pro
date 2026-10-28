/* =====================================================================
 * STUDIO PHỤ ĐỀ VIDEO (Premium)
 * Dùng kết quả nhận diện ở trang Giọng → Chữ: sửa chữ và mốc thời gian từng dòng,
 * chọn kiểu chữ, xem trước trên video và xuất video có in phụ đề.
 * Xuất bằng canvas + MediaRecorder ngay trong trình duyệt (MP4 nếu trình duyệt hỗ trợ, không thì WebM),
 * nên chữ trong file xuất giống hệt bản xem trước.
 * ===================================================================== */
const vkStudio = (() => {
  const st = { url: null, style: 'classic', busy: null, raf: 0 };
  const FONTS_URL = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@800&family=Lexend:wght@700&family=Roboto:wght@900&display=swap';
  const isVideo = (m) => !!m && (/^video\//.test(m.blob?.type || '') || /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(m.name || ''));

  /* ---------- Vẽ phụ đề (dùng chung cho xem trước và xuất) ---------- */
  function opts() {
    return {
      style: st.style, font: $('#vs-font').value, color: $('#vs-color').value,
      size: Number($('#vs-size').value) / 100, pos: Number($('#vs-pos').value) / 100, upper: $('#vs-upper').checked
    };
  }

  /** Chia chữ thành các dòng vừa 88% bề ngang khung hình */
  function wrap(ctx, words, maxW) {
    const lines = [];
    let cur = [];
    for (const w of words) {
      const test = [...cur, w].map(x => x.t).join(' ');
      if (cur.length && ctx.measureText(test).width > maxW) { lines.push(cur); cur = [w]; } else cur.push(w);
    }
    if (cur.length) lines.push(cur);
    return lines;
  }

  function draw(ctx, W, H, t, cues, o) {
    const cue = cues.find(c => t >= c.start && t < c.end);
    if (!cue || !cue.text.trim()) return;
    const fs = Math.round(H * o.size);
    const weight = o.font === 'Be Vietnam Pro' ? 800 : o.font === 'Roboto' ? 900 : o.font === 'Lexend' ? 700 : 800;
    ctx.font = `${weight} ${fs}px "${o.font}", "Be Vietnam Pro", sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const text = o.upper ? cue.text.toLocaleUpperCase('vi') : cue.text;
    // Tô từng từ: tiến độ trong câu tính theo số ký tự đã "đọc"
    const total = text.replace(/\s+/g, '').length || 1;
    const progress = (t - cue.start) / Math.max(0.01, cue.end - cue.start) * total;
    let acc = 0;
    const words = text.split(/\s+/).filter(Boolean).map(w => { acc += w.length; return { t: w, on: acc - w.length <= progress }; });
    const lines = wrap(ctx, words, W * 0.88).slice(-3);
    const lh = fs * 1.25, space = ctx.measureText(' ').width;
    const top = H * o.pos - (lines.length * lh) / 2 + lh / 2;

    lines.forEach((line, li) => {
      const widths = line.map(w => ctx.measureText(w.t).width);
      const lw = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1);
      let x = (W - lw) / 2;
      const y = Math.max(lh / 2, Math.min(H - lh / 2, top + li * lh));

      if (o.style === 'box') {
        const px = fs * 0.35, r = fs * 0.25;
        ctx.fillStyle = 'rgba(0,0,0,0.68)';
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x - px, y - lh / 2, lw + px * 2, lh, r) : ctx.rect(x - px, y - lh / 2, lw + px * 2, lh);
        ctx.fill();
      }
      line.forEach((w, wi) => {
        ctx.save();
        if (o.style === 'neon') {
          ctx.shadowColor = o.color; ctx.shadowBlur = fs * 0.6;
          ctx.fillStyle = '#fff';
          ctx.fillText(w.t, x, y); ctx.fillText(w.t, x, y);
        } else {
          if (o.style !== 'box') {
            ctx.lineWidth = fs * (o.style === 'capcut' ? 0.22 : 0.16);
            ctx.strokeStyle = '#000';
            if (o.style === 'capcut') { ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowOffsetY = fs * 0.06; ctx.shadowBlur = fs * 0.1; }
            ctx.strokeText(w.t, x, y);
            ctx.shadowColor = 'transparent';
          }
          ctx.fillStyle = o.style === 'capcut' ? o.color : o.style === 'karaoke' && w.on ? o.color : '#fff';
          ctx.fillText(w.t, x, y);
        }
        ctx.restore();
        x += widths[wi] + space;
      });
    });
  }

  /* ---------- Xem trước ---------- */
  function fitOverlay() {
    const v = $('#vs-video'), c = $('#vs-overlay');
    if (!v.videoWidth) return;
    // Canvas cùng tỉ lệ khung hình video, phủ đúng vùng hình (bỏ phần viền đen của thẻ video)
    const box = v.getBoundingClientRect(), stage = $('#vs-stage').getBoundingClientRect();
    const scale = Math.min(box.width / v.videoWidth, box.height / v.videoHeight);
    const w = v.videoWidth * scale, h = v.videoHeight * scale;
    Object.assign(c.style, { width: w + 'px', height: h + 'px', left: (box.left - stage.left + (box.width - w) / 2) + 'px', top: (box.top - stage.top + (box.height - h) / 2) + 'px' });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
  }
  function loop() {
    const v = $('#vs-video'), c = $('#vs-overlay'), ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    if (c.width) draw(ctx, c.width, c.height, v.currentTime, state.view, opts());
    highlightRow(v.currentTime);
    if (!$('#modal-vstudio').hidden) st.raf = requestAnimationFrame(loop);
  }

  /* ---------- Danh sách dòng: sửa chữ và thời gian ---------- */
  const fmt = (sec) => {
    sec = Math.max(0, sec);
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  };
  /** "01:02.50", "1:02,5", "00:01:02,500" hoặc "62.5" -> giây */
  const parse = (str) => {
    const p = String(str).trim().replace(',', '.').split(':').map(Number);
    if (p.some(n => !isFinite(n))) return NaN;
    return p.reduce((a, n) => a * 60 + n, 0);
  };

  function commit() {
    state.view.sort((a, b) => a.start - b.start);
    state.view.forEach((s, i) => { s.id = i + 1; });
    syncRaw();
    $('#vs-count').textContent = `${state.view.length} dòng`;
  }

  function renderList() {
    const list = $('#vs-list');
    list.textContent = '';
    state.view.forEach((s) => {
      const row = document.createElement('div');
      row.className = 'vs-row';
      const a = Object.assign(document.createElement('input'), { className: 'vs-time', value: fmt(s.start), title: 'Bắt đầu' });
      const b = Object.assign(document.createElement('input'), { className: 'vs-time', value: fmt(s.end), title: 'Kết thúc' });
      const tx = Object.assign(document.createElement('input'), { className: 'vs-text', value: s.text, spellcheck: false });
      const del = Object.assign(document.createElement('button'), { className: 'icon-btn sm', type: 'button', textContent: '✕', title: 'Xóa dòng' });
      const time = (inp, key) => inp.addEventListener('change', () => {
        const v = parse(inp.value);
        if (!isFinite(v)) { inp.value = fmt(s[key]); return toast('Thời gian dạng phút:giây, vd 01:02.50', 'err'); }
        s[key] = v;
        if (s.end < s.start + 0.1) s.end = s.start + 0.1;
        commit(); renderList();
      });
      time(a, 'start'); time(b, 'end');
      tx.addEventListener('input', () => { s.text = tx.value; syncRaw(); });
      del.addEventListener('click', () => { state.view.splice(state.view.indexOf(s), 1); commit(); renderList(); });
      row.addEventListener('click', (e) => { if (e.target === row || e.target === tx) $('#vs-video').currentTime = s.start + 0.01; });
      row.append(a, b, tx, del);
      row._cue = s;
      list.appendChild(row);
    });
    $('#vs-count').textContent = `${state.view.length} dòng`;
  }
  let lastRow = null;
  function highlightRow(t) {
    const rows = $('#vs-list').children;
    let on = null;
    for (const r of rows) if (t >= r._cue.start && t < r._cue.end) { on = r; break; }
    if (on === lastRow) return;
    lastRow?.classList.remove('playing');
    on?.classList.add('playing');
    if (on && !$('#vs-list').matches(':hover')) on.scrollIntoView({ block: 'nearest' });
    lastRow = on;
  }
  function shift(d) {
    for (const s of state.view) { s.start = Math.max(0, s.start + d); s.end = Math.max(s.start + 0.1, s.end + d); }
    commit(); renderList();
  }

  /* ---------- Xuất video ---------- */
  function pickMime() {
    const list = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    return list.find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  }

  async function exportVideo() {
    if (st.busy) { st.busy.cancel(); return; }
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return toast('Trình duyệt này không hỗ trợ xuất video. Hãy dùng Chrome hoặc Edge bản mới.', 'err');
    const mime = pickMime();
    const o = opts();
    await document.fonts.load(`800 40px "${o.font}"`).catch(() => {});

    // Thẻ video riêng cho việc xuất: âm thanh đi vào bản ghi, không phát ra loa
    const v = document.createElement('video');
    Object.assign(v.style, { position: 'fixed', left: '-9999px', width: '2px', height: '2px' });
    v.src = st.url; v.playsInline = true; v.preload = 'auto';
    document.body.appendChild(v);
    await new Promise((ok, no) => { v.onloadedmetadata = ok; v.onerror = () => no(new Error('Không đọc được video.')); });

    // Giới hạn cạnh dài 1920 px cho nhẹ máy
    const k = Math.min(1, 1920 / Math.max(v.videoWidth, v.videoHeight));
    const W = Math.round(v.videoWidth * k / 2) * 2, H = Math.round(v.videoHeight * k / 2) * 2;
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d');
    const actx = new AudioContext();
    const dest = actx.createMediaStreamDestination();
    actx.createMediaElementSource(v).connect(dest);
    const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: H >= 1080 ? 8e6 : 5e6, audioBitsPerSecond: 160000 });
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    let cancelled = false, stopped = false;
    const btn = $('#vs-export');
    btn.textContent = 'Hủy xuất';
    $('#vs-progress').hidden = false; $('#vs-note').hidden = true;
    const frame = (_, meta) => {
      if (stopped) return;
      const t = meta?.mediaTime ?? v.currentTime;
      ctx.drawImage(v, 0, 0, W, H);
      draw(ctx, W, H, t, state.view, o);
      const pct = Math.min(100, Math.round(t / v.duration * 100));
      $('#vs-bar').style.width = pct + '%';
      $('#vs-progress-text').textContent = `Đang xuất ${fmt(t)} / ${fmt(v.duration)} (${pct}%)`;
      updateTitleProgress('Đang xuất video', pct);
      v.requestVideoFrameCallback ? v.requestVideoFrameCallback(frame) : requestAnimationFrame(() => frame(null, null));
    };

    const done = new Promise((ok) => { rec.onstop = ok; });
    st.busy = { cancel: () => { cancelled = true; v.pause(); v.dispatchEvent(new Event('ended')); } };
    try {
      await actx.resume();
      ctx.drawImage(v, 0, 0, W, H);
      rec.start(1000);
      frame(null, null);
      await v.play();
      await new Promise((ok) => { v.onended = ok; });
      stopped = true;
      rec.stop();
      await done;
      if (cancelled) return toast('Đã hủy xuất video.');
      const type = (mime || 'video/webm').split(';')[0];
      const base = (state.meta.name || 'video').replace(/\.[^.]+$/, '');
      download(`${base}-phu-de.${type === 'video/mp4' ? 'mp4' : 'webm'}`, new Blob(chunks, { type }), type);
      toast(type === 'video/mp4' ? 'Đã xuất video MP4 có phụ đề.' : 'Đã xuất video WebM có phụ đề (trình duyệt này chưa ghi được MP4).', 'ok');
    } catch (e) {
      toast(e.message || 'Xuất video thất bại.', 'err');
    } finally {
      stopped = true;
      if (rec.state !== 'inactive') rec.stop();
      stream.getTracks().forEach(t => t.stop());
      actx.close();
      v.remove();
      st.busy = null;
      btn.textContent = 'Xuất video có phụ đề';
      $('#vs-progress').hidden = true; $('#vs-note').hidden = false;
      clearTitleProgress();
    }
  }

  /* ---------- Mở / đóng ---------- */
  async function open() {
    if (!isVideo(state.media) || !state.view.length) return;
    if (!isPremium()) {
      const go = await customConfirm('Studio phụ đề video (sửa thời gian từng dòng, kiểu chữ CapCut, xuất video có in phụ đề) là tính năng của gói Premium.', 'Tính năng Premium', 'Xem gói Premium', 'Để sau');
      if (go) showView('plans');
      return;
    }
    if (!document.querySelector('link[data-vs-fonts]')) {
      document.head.appendChild(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: FONTS_URL })).dataset.vsFonts = '1';
    }
    if (st.url) URL.revokeObjectURL(st.url);
    st.url = URL.createObjectURL(state.media.blob);
    $('#vs-video').src = st.url;
    renderList();
    openModal('#modal-vstudio');
    cancelAnimationFrame(st.raf);
    st.raf = requestAnimationFrame(loop);
  }

  function updateButton() {
    $('#btn-video-sub').hidden = !(isVideo(state.media) && state.view?.length);
  }

  // Đóng studio thì dừng video, hủy xuất đang chạy
  new MutationObserver(() => {
    if (!$('#modal-vstudio').hidden) return;
    $('#vs-video').pause();
    cancelAnimationFrame(st.raf);
    st.busy?.cancel();
    if (state.raw.length) renderResult();
  }).observe($('#modal-vstudio'), { attributes: true, attributeFilter: ['hidden'] });

  $('#btn-video-sub').addEventListener('click', open);
  $('#vs-video').addEventListener('loadedmetadata', fitOverlay);
  window.addEventListener('resize', fitOverlay);
  $$('#vs-styles .vs-style').forEach(b => b.addEventListener('click', () => {
    $$('#vs-styles .vs-style').forEach(x => x.classList.toggle('active', x === b));
    st.style = b.dataset.style;
    if (st.style === 'capcut') $('#vs-upper').checked = true;
  }));
  $('#vs-size').addEventListener('input', e => { $('#vs-size-val').textContent = e.target.value + '%'; });
  $('#vs-pos').addEventListener('input', e => { $('#vs-pos-val').textContent = e.target.value + '%'; });
  $('#vs-shift-minus').addEventListener('click', () => shift(-0.1));
  $('#vs-shift-plus').addEventListener('click', () => shift(0.1));
  $('#vs-add').addEventListener('click', () => {
    const t = $('#vs-video').currentTime;
    state.view.push({ start: t, end: t + 2, text: 'Dòng mới' });
    commit(); renderList();
  });
  $('#vs-dl-srt').addEventListener('click', () => { const [d, type] = build('srt'); download((state.meta.name || 'phu-de').replace(/\.[^.]+$/, '') + '.srt', d, type); });
  $('#vs-dl-vtt').addEventListener('click', () => { const [d, type] = build('vtt'); download((state.meta.name || 'phu-de').replace(/\.[^.]+$/, '') + '.vtt', d, type); });
  $('#vs-export').addEventListener('click', exportVideo);

  return { updateButton, draw, isVideo };
})();
