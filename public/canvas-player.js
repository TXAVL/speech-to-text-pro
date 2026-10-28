'use strict';
/**
 * Canvas Audio Player - TXA Voice
 * Trình phát âm thanh vẽ 100% trên thẻ <canvas>.
 * Khi kiểm tra DevTools (F12) chỉ thấy duy nhất thẻ <canvas>, không có thẻ <audio> trong DOM.
 *
 * Bố cục: [Phát] [sóng âm + tiến độ] [thời gian] [tốc độ] [loa] [thanh âm lượng]
 * Màn hình hẹp (điện thoại): thanh âm lượng ẩn, chạm vào loa thì vùng sóng âm đổi thành thanh âm lượng
 * cho tới khi chạm lại loa hoặc 3 giây không chạm.
 * Màu lấy từ biến CSS của theme (--accent, --accent-2, --card-2, --line, --text, --muted).
 */

(function () {
  const pad = (n) => String(Math.floor(n)).padStart(2, '0');
  function formatTime(s) {
    if (!Number.isFinite(s) || s < 0) return '0:00';
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
  }

  const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
  const VOL_KEY = 'vk-player-volume';
  const store = {
    get() { try { const v = Number(localStorage.getItem(VOL_KEY)); return Number.isFinite(v) && localStorage.getItem(VOL_KEY) !== null ? v : 1; } catch { return 1; } },
    set(v) { try { localStorage.setItem(VOL_KEY, String(v)); } catch {} }
  };

  /** Đỉnh sóng độ phân giải cao (512 cột) từ mẫu âm thanh, chuẩn hóa 0..1 */
  const HI_RES = 512;
  function peaksFrom(data) {
    const out = new Float32Array(HI_RES), step = data.length / HI_RES;
    let max = 1e-4;
    for (let i = 0; i < HI_RES; i++) {
      let p = 0;
      const a = Math.floor(i * step), z = Math.min(data.length, Math.floor((i + 1) * step));
      for (let j = a; j < z; j += 4) { const v = Math.abs(data[j]); if (v > p) p = v; }
      out[i] = p;
      if (p > max) max = p;
    }
    for (let i = 0; i < HI_RES; i++) out[i] = Math.sqrt(out[i] / max); // căn bậc hai cho đoạn nói nhỏ vẫn thấy rõ
    return out;
  }
  /** Gom 512 cột về đúng số vạch vẽ được trên bề ngang hiện tại */
  function resample(hi, n) {
    const out = new Float32Array(n), r = hi.length / n;
    for (let i = 0; i < n; i++) {
      let p = 0;
      for (let j = Math.floor(i * r); j < Math.max(Math.floor(i * r) + 1, Math.floor((i + 1) * r)); j++) p = Math.max(p, hi[j] || 0);
      out[i] = p;
    }
    return out;
  }
  /** Sóng tạm khi chưa giải mã xong: thấp và đều để không trông như dữ liệu thật */
  function placeholder(n) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = 0.18 + 0.1 * Math.abs(Math.sin(i * 0.55) * Math.cos(i * 0.21));
    return out;
  }

  function attachCanvasAudioPlayer(canvas) {
    if (!canvas || canvas._canvasPlayerAttached) return canvas;
    canvas._canvasPlayerAttached = true;

    // Đối tượng Audio thuần trong bộ nhớ JS, tuyệt đối KHÔNG đưa vào DOM
    const audio = new Audio();
    audio.preload = 'metadata';
    const ctx = canvas.getContext('2d');

    let hiPeaks = null;      // đỉnh sóng thật (512 cột) hoặc null khi chưa có
    let decoded = false;     // đã có sóng thật cho src hiện tại
    let volume = Math.max(0, Math.min(1, store.get()));
    let hover = null;        // { part, x }
    let drag = null;         // 'track' | 'vol'
    let volOpen = false;     // màn hình hẹp: vùng sóng đang hiển thị thanh âm lượng
    let volTimer = 0;
    let animId = 0;

    /* ---------- Âm lượng ----------
     * Safari trên iPhone/iPad bỏ qua audio.volume (luôn là 1), nên ở đó âm thanh đi qua GainNode của Web Audio.
     * Trình duyệt khác chỉnh thẳng audio.volume. */
    const volumeLocked = (() => { try { const a = new Audio(); a.volume = 0.5; return a.volume === 1; } catch { return false; } })();
    let gain = null, actx = null;
    function ensureGraph() {
      if (!volumeLocked || gain) return;
      try {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        gain = actx.createGain();
        actx.createMediaElementSource(audio).connect(gain).connect(actx.destination);
      } catch { gain = null; }
    }
    function applyVolume() {
      const v = audio.muted ? 0 : volume;
      if (gain) gain.gain.value = v;
      else audio.volume = volume;
    }
    function setVolume(v, remember = true) {
      volume = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
      if (volume > 0 && audio.muted) audio.muted = false;
      applyVolume();
      if (remember) store.set(volume);
      draw();
    }
    function toggleMute() {
      if (audio.muted || volume === 0) {
        audio.muted = false;
        if (volume === 0) volume = 0.6;
      } else audio.muted = true;
      applyVolume();
      draw();
    }
    function play() {
      if (!audio.src) return Promise.resolve();
      ensureGraph();
      if (actx && actx.state === 'suspended') actx.resume().catch(() => {});
      applyVolume();
      return audio.play();
    }
    function togglePlay() { if (audio.paused) play().catch(() => {}); else audio.pause(); }

    /* ---------- Sóng âm ---------- */
    function decodePeaks(url) {
      if (!url || !/^(blob:|data:)/.test(url)) return;
      fetch(url).then(r => r.arrayBuffer()).then(ab => {
        const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const ac = AC ? new AC(1, 1, 8000) : new (window.AudioContext || window.webkitAudioContext)();
        return ac.decodeAudioData(ab);
      }).then(buf => {
        if (audio.src !== url || decoded) return;
        hiPeaks = peaksFrom(buf.getChannelData(0));
        decoded = true;
        draw();
      }).catch(() => {});
    }
    // Dữ liệu mẫu có sẵn từ app (vd decodeTo16kMono) -> dùng luôn, khỏi giải mã lại
    canvas.setAudioData = function (f32) {
      if (!f32 || !f32.length) return;
      hiPeaks = peaksFrom(f32);
      decoded = true;
      draw();
    };

    /* ---------- Bố cục ---------- */
    function theme() {
      const cs = getComputedStyle(canvas);
      const v = (n, d) => cs.getPropertyValue(n).trim() || d;
      return {
        bg: v('--card-2', '#1b2030'), line: v('--line', '#262c40'), text: v('--text', '#e9ecf5'),
        muted: v('--muted', '#8b93ad'), accent: v('--accent', '#7c6cff'), accent2: v('--accent-2', '#22d3ee')
      };
    }

    function layout() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(220, Math.round(rect.width || 600)), h = Math.max(44, Math.round(rect.height || 56));
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cy = h / 2, compact = w < 400, tiny = w < 360;
      const L = { w, h, cy, compact, tiny };
      L.play = { x: 8, y: cy - 20, w: 40, h: 40 };
      let right = w - 10;
      if (!compact) { L.volBar = { x: right - 64, y: cy - 12, w: 64, h: 24 }; right -= 74; }
      L.speaker = { x: right - 28, y: cy - 14, w: 28, h: 28 }; right -= 32;
      if (!tiny) { L.speed = { x: right - 40, y: cy - 12, w: 40, h: 24 }; right -= 46; }
      ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif';
      const dur = audio.duration;
      const sample = tiny ? formatTime(dur) : `${formatTime(dur)} / ${formatTime(dur)}`;
      const tw = Math.ceil(ctx.measureText(sample).width) + 4;
      L.time = { x: right - tw, w: tw };
      right -= tw + 12;
      L.track = { x: 60, y: cy - 16, w: Math.max(30, right - 60), h: 32 };
      // Điện thoại: thanh âm lượng mở ra thay chỗ vùng sóng âm
      if (compact && volOpen) L.volBar = { x: L.track.x + 8, y: cy - 12, w: Math.max(40, (L.speed || L.speaker).x - L.track.x - 64), h: 24 };
      return L;
    }

    const inside = (r, p, slop = 0) => r && p.x >= r.x - slop && p.x <= r.x + r.w + slop && p.y >= r.y - slop && p.y <= r.y + r.h + slop;
    function hitTest(L, p, touch) {
      const s = touch ? 8 : 2;
      if (inside(L.play, p, s)) return 'play';
      if (inside(L.speaker, p, s)) return 'speaker';
      if (L.speed && inside(L.speed, p, s)) return 'speed';
      if (L.volBar && (!L.compact || volOpen) && inside({ x: L.volBar.x - 6, y: 0, w: L.volBar.w + 12, h: L.h }, p)) return 'vol';
      if (!(L.compact && volOpen) && inside({ x: L.track.x - 4, y: 0, w: L.track.w + 8, h: L.h }, p)) return 'track';
      return null;
    }

    /* ---------- Vẽ ---------- */
    function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

    function drawSpeaker(L, c) {
      const { x, y, w, h } = L.speaker, mx = x + w / 2 - 3, my = y + h / 2;
      const active = hover?.part === 'speaker' || volOpen;
      if (active) { ctx.fillStyle = c.line; rr(x, y, w, h, 8); ctx.fill(); }
      const silent = audio.muted || volume === 0;
      ctx.fillStyle = ctx.strokeStyle = silent ? c.muted : active ? c.text : c.muted;
      ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(mx - 6, my - 3.2); ctx.lineTo(mx - 3, my - 3.2); ctx.lineTo(mx + 1.5, my - 7);
      ctx.lineTo(mx + 1.5, my + 7); ctx.lineTo(mx - 3, my + 3.2); ctx.lineTo(mx - 6, my + 3.2);
      ctx.closePath(); ctx.fill();
      if (silent) {
        ctx.beginPath(); ctx.moveTo(mx + 5, my - 3.5); ctx.lineTo(mx + 10, my + 3.5); ctx.moveTo(mx + 10, my - 3.5); ctx.lineTo(mx + 5, my + 3.5); ctx.stroke();
      } else {
        ctx.beginPath(); ctx.arc(mx + 2, my, 4.5, -0.9, 0.9); ctx.stroke();
        if (volume > 0.5) { ctx.beginPath(); ctx.arc(mx + 2, my, 8, -0.9, 0.9); ctx.stroke(); }
      }
    }

    function drawVolBar(L, c) {
      const b = L.volBar, y = L.cy, v = audio.muted ? 0 : volume;
      const active = drag === 'vol' || hover?.part === 'vol';
      ctx.fillStyle = c.line; rr(b.x, y - 2.5, b.w, 5, 3); ctx.fill();
      const g = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
      g.addColorStop(0, c.accent); g.addColorStop(1, c.accent2);
      ctx.fillStyle = g; rr(b.x, y - 2.5, Math.max(5, b.w * v), 5, 3); ctx.fill();
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 4;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(b.x + b.w * v, y, active ? 7.5 : 6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (L.compact) {
        ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif';
        ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = c.text; ctx.fillText(Math.round(v * 100) + '%', b.x + b.w + 12, y);
      }
    }

    function draw() {
      const L = layout(), c = theme();
      const { w, h, cy } = L;
      const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
      const has = !!audio.src && dur > 0;
      const progress = has ? Math.min(1, audio.currentTime / dur) : 0;
      ctx.clearRect(0, 0, w, h);

      // Nền
      ctx.fillStyle = c.bg; rr(0.5, 0.5, w - 1, h - 1, 14); ctx.fill();
      ctx.strokeStyle = c.line; ctx.lineWidth = 1; ctx.stroke();

      // Nút phát
      const p = L.play, pcx = p.x + p.w / 2, pr = hover?.part === 'play' ? 19 : 18;
      ctx.save();
      if (audio.src) {
        const g = ctx.createLinearGradient(p.x, p.y, p.x + p.w, p.y + p.h);
        g.addColorStop(0, c.accent); g.addColorStop(1, c.accent2);
        ctx.fillStyle = g;
        if (!audio.paused || hover?.part === 'play') { ctx.shadowColor = c.accent; ctx.shadowBlur = 12; }
      } else { ctx.fillStyle = c.line; }
      ctx.beginPath(); ctx.arc(pcx, cy, pr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = audio.src ? '#fff' : c.muted;
      if (audio.paused) {
        ctx.beginPath(); ctx.moveTo(pcx - 4.5, cy - 7.5); ctx.lineTo(pcx + 8, cy); ctx.lineTo(pcx - 4.5, cy + 7.5); ctx.closePath();
        ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2; ctx.stroke(); ctx.fill();
      } else {
        rr(pcx - 6, cy - 7, 4, 14, 1.5); ctx.fill(); rr(pcx + 2, cy - 7, 4, 14, 1.5); ctx.fill();
      }

      // Sóng âm (hoặc thanh âm lượng trên điện thoại)
      if (L.compact && volOpen) {
        drawVolBar(L, c);
      } else {
        const t = L.track, bw = 2.5, gap = 1.5, n = Math.max(8, Math.floor((t.w + gap) / (bw + gap)));
        const peaks = hiPeaks ? resample(hiPeaks, n) : placeholder(n);
        const hoverRatio = hover?.part === 'track' && has ? (hover.x - t.x) / t.w : null;
        const g = ctx.createLinearGradient(t.x, 0, t.x + t.w, 0);
        g.addColorStop(0, c.accent); g.addColorStop(1, c.accent2);
        for (let i = 0; i < n; i++) {
          const x = t.x + i * (bw + gap), r = (i + 0.5) / n;
          const bh = Math.max(3, peaks[i] * t.h);
          rr(x, cy - bh / 2, bw, bh, 1.25);
          if (r <= progress) { ctx.fillStyle = g; ctx.globalAlpha = 1; }
          else if (hoverRatio !== null && r <= hoverRatio) { ctx.fillStyle = g; ctx.globalAlpha = 0.45; }
          else { ctx.fillStyle = c.text; ctx.globalAlpha = decoded ? 0.2 : 0.12; }
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        if (has && (progress > 0 || !audio.paused)) {
          const hx = t.x + progress * t.w;
          ctx.fillStyle = c.text; rr(hx - 1, cy - t.h / 2 - 2, 2, t.h + 4, 1); ctx.fill();
        }
      }

      // Thời gian: rê chuột trên sóng thì hiện thời điểm sẽ nhảy tới
      ctx.font = '600 12px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      const tx = L.time.x + L.time.w;
      const hoverTime = hover?.part === 'track' && has ? Math.max(0, Math.min(1, (hover.x - L.track.x) / L.track.w)) * dur : null;
      const showVol = (drag === 'vol' || hover?.part === 'vol') && !L.compact;
      if (L.compact && volOpen) {
        // vùng thời gian đang nhường chỗ cho thanh âm lượng
      } else if (showVol) {
        ctx.fillStyle = c.text; ctx.fillText(`Âm lượng ${Math.round((audio.muted ? 0 : volume) * 100)}%`, tx, cy);
      } else if (L.tiny) {
        ctx.fillStyle = hoverTime !== null ? c.accent2 : c.text;
        ctx.fillText(formatTime(hoverTime ?? (audio.paused && !progress ? dur : audio.currentTime)), tx, cy);
      } else {
        const total = ' / ' + formatTime(dur);
        ctx.fillStyle = c.muted; ctx.fillText(total, tx, cy);
        ctx.fillStyle = hoverTime !== null ? c.accent2 : c.text;
        ctx.fillText(formatTime(hoverTime ?? audio.currentTime), tx - ctx.measureText(total).width, cy);
      }

      // Tốc độ phát
      if (L.speed) {
        const s = L.speed, on = hover?.part === 'speed', custom = audio.playbackRate !== 1;
        ctx.fillStyle = on ? c.line : 'transparent'; rr(s.x, s.y, s.w, s.h, 7); ctx.fill();
        ctx.strokeStyle = custom ? c.accent : c.line; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = custom ? c.accent2 : c.muted; ctx.textAlign = 'center';
        ctx.font = '700 11.5px "Be Vietnam Pro", system-ui, sans-serif';
        ctx.fillText(`${audio.playbackRate}×`, s.x + s.w / 2, cy + 0.5);
      }

      drawSpeaker(L, c);
      if (!L.compact) drawVolBar(L, c);
    }

    /* ---------- Hoạt họa ---------- */
    function loop() { draw(); animId = audio.paused ? 0 : requestAnimationFrame(loop); }
    function startAnim() { if (!animId) loop(); }
    function stopAnim() { cancelAnimationFrame(animId); animId = 0; draw(); }

    /* ---------- Tương tác (chuột + cảm ứng qua Pointer Events) ---------- */
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    function seekTo(p, L) {
      const dur = audio.duration;
      if (!audio.src || !Number.isFinite(dur) || dur <= 0) return;
      audio.currentTime = Math.max(0, Math.min(1, (p.x - L.track.x) / L.track.w)) * dur;
      draw();
    }
    function volTo(p, L) { setVolume((p.x - L.volBar.x) / L.volBar.w); }
    function keepVolOpen() {
      clearTimeout(volTimer);
      volTimer = setTimeout(() => { if (drag !== 'vol') { volOpen = false; draw(); } }, 3000);
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const L = layout(), p = pos(e), part = hitTest(L, p, e.pointerType !== 'mouse');
      canvas.focus({ preventScroll: true });
      if (part !== 'track' && part !== 'vol') return; // nút bấm xử lý ở 'click' (Safari iOS chỉ cho phát âm thanh trong click)
      e.preventDefault();
      drag = part;
      canvas.setPointerCapture(e.pointerId);
      if (part === 'vol') { volTo(p, L); if (L.compact) keepVolOpen(); } else seekTo(p, L);
    });
    canvas.addEventListener('click', (e) => {
      const L = layout(), part = hitTest(L, pos(e), true);
      if (part === 'play') togglePlay();
      else if (part === 'speed') { audio.playbackRate = SPEEDS[(SPEEDS.indexOf(audio.playbackRate) + 1) % SPEEDS.length] || 1; draw(); }
      else if (part === 'speaker') {
        if (L.compact) { volOpen = !volOpen; if (volOpen) keepVolOpen(); draw(); }
        else toggleMute();
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      const L = layout(), p = pos(e);
      if (drag === 'track') return seekTo(p, L);
      if (drag === 'vol') { volTo(p, L); if (L.compact) keepVolOpen(); return; }
      if (e.pointerType !== 'mouse') return;
      const part = hitTest(L, p, false);
      hover = part ? { part, x: p.x } : null;
      canvas.style.cursor = part ? 'pointer' : 'default';
      draw();
    });
    const endDrag = () => { if (!drag) return; drag = null; draw(); };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !drag) { hover = null; canvas.style.cursor = 'default'; draw(); } });
    // Lăn chuột trên loa / thanh âm lượng để chỉnh âm lượng
    canvas.addEventListener('wheel', (e) => {
      const L = layout(), part = hitTest(L, pos(e), false);
      if (part !== 'vol' && part !== 'speaker') return;
      e.preventDefault();
      setVolume((audio.muted ? 0 : volume) + (e.deltaY < 0 ? 0.05 : -0.05));
    }, { passive: false });

    // Phím tắt: Space phát/dừng, ←/→ tua 5 giây, ↑/↓ âm lượng, M tắt tiếng
    canvas.addEventListener('keydown', (e) => {
      const k = e.code;
      if (k === 'Space' || k === 'Enter') togglePlay();
      else if (k === 'ArrowLeft') audio.currentTime = Math.max(0, audio.currentTime - 5);
      else if (k === 'ArrowRight') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
      else if (k === 'ArrowUp') setVolume(volume + 0.1);
      else if (k === 'ArrowDown') setVolume(volume - 0.1);
      else if (k === 'KeyM') toggleMute();
      else return;
      e.preventDefault();
      draw();
    });

    /* ---------- Đồng bộ sự kiện của audio ngầm lên canvas ---------- */
    const relay = (type, fn) => audio.addEventListener(type, () => { fn?.(); canvas.dispatchEvent(new Event(type)); });
    relay('play', startAnim);
    relay('pause', stopAnim);
    relay('ended', stopAnim);
    relay('timeupdate', () => { if (!animId) draw(); });
    relay('loadedmetadata', draw);
    relay('durationchange', draw);
    relay('canplay', draw);
    relay('ratechange', draw);
    relay('volumechange', draw);

    /* ---------- Proxy thuộc tính HTMLAudioElement lên thẻ canvas (app.js dùng như thẻ audio) ---------- */
    function setSrc(val) {
      hiPeaks = null; decoded = false;
      if (!val) { audio.removeAttribute('src'); audio.load(); draw(); return; }
      audio.src = val;
      audio.load();
      decodePeaks(audio.src);
      draw();
    }
    const prop = (name, get, set) => Object.defineProperty(canvas, name, { get, set, configurable: true });
    prop('src', () => audio.src, setSrc);
    prop('currentTime', () => audio.currentTime, (v) => { audio.currentTime = Number(v) || 0; draw(); });
    prop('duration', () => audio.duration || 0);
    prop('paused', () => audio.paused);
    prop('ended', () => audio.ended);
    prop('muted', () => audio.muted, (v) => { audio.muted = !!v; applyVolume(); draw(); });
    prop('volume', () => volume, (v) => setVolume(Number(v) || 0, false));
    prop('playbackRate', () => audio.playbackRate, (v) => { audio.playbackRate = Number(v) || 1; });

    canvas.play = play;
    canvas.pause = () => { audio.pause(); draw(); };
    canvas.load = () => { audio.load(); draw(); };
    canvas.canPlayType = (t) => audio.canPlayType(t);
    const origRemoveAttr = canvas.removeAttribute.bind(canvas);
    canvas.removeAttribute = function (attr) {
      if (attr === 'src') { audio.pause(); setSrc(''); }
      return origRemoveAttr(attr);
    };

    // Vẽ lại khi đổi kích thước hoặc đổi theme
    new ResizeObserver(() => draw()).observe(canvas);
    new MutationObserver(() => draw()).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme', 'style'] });
    if (document.fonts?.ready) document.fonts.ready.then(draw);

    applyVolume();
    draw();
    return canvas;
  }

  // Khởi tạo tự động cho tất cả thẻ canvas audio player
  function initAllCanvasPlayers() {
    document.querySelectorAll('canvas.audio-canvas-player, #player, #tts-player').forEach((el) => {
      if (el.tagName === 'CANVAS') attachCanvasAudioPlayer(el);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initAllCanvasPlayers);
  else initAllCanvasPlayers();

  window.attachCanvasAudioPlayer = attachCanvasAudioPlayer;
})();
