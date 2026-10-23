'use strict';
/**
 * Canvas Audio Player - TXA Voice
 * Trình phát âm thanh vẽ 100% trên thẻ <canvas>.
 * Khi kiểm tra DevTools (F12) chỉ thấy duy nhất thẻ <canvas>, không có thẻ <audio> trong DOM.
 */

(function () {
  const pad = (n) => String(Math.floor(n)).padStart(2, '0');
  function formatTime(s) {
    if (!Number.isFinite(s) || s < 0) return '00:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}:${pad(m % 60)}:${pad(sec)}`;
    }
    return `${pad(m)}:${pad(sec)}`;
  }

  // Tạo mẫu sóng giả lập chân thực theo dạng giọng nói khi chưa giải mã xong
  function generateSpeechPeaks(seedStr, count) {
    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
      hash = ((hash << 5) - hash) + seedStr.charCodeAt(i);
      hash |= 0;
    }
    const peaks = new Float32Array(count);
    let val = 0.4;
    for (let i = 0; i < count; i++) {
      const r = Math.sin(i * 0.28 + hash * 0.1) * 0.35 + Math.cos(i * 0.72) * 0.25;
      val = Math.max(0.12, Math.min(0.95, 0.45 + r + Math.sin(i * 1.8) * 0.15));
      // Tạo một số đoạn ngắt giọng tự nhiên
      if ((i % 14 === 0 || i % 19 === 0) && i > 3 && i < count - 3) {
        peaks[i] = 0.1;
      } else {
        peaks[i] = val;
      }
    }
    return peaks;
  }

  function attachCanvasAudioPlayer(canvas) {
    if (!canvas || canvas._canvasPlayerAttached) return canvas;
    canvas._canvasPlayerAttached = true;

    // Đối tượng Audio thuần trong bộ nhớ JS, tuyệt đối KHÔNG đưa vào DOM
    const audio = new Audio();
    audio.preload = 'metadata';

    const ctx = canvas.getContext('2d');
    let peaks = null;
    let isDragging = false;
    let hoverState = null; // 'play' | 'track' | 'mute'
    let hoverX = 0;
    let animId = null;

    // Bộ nhớ AudioContext nhẹ để trích xuất peaks thật nếu được hỗ trợ
    let audioCtx = null;

    function getAudioCtx() {
      if (!audioCtx && (window.AudioContext || window.webkitAudioContext)) {
        try {
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (_) {}
      }
      return audioCtx;
    }

    function extractPeaksFromBuffer(audioBuffer, numBars = 55) {
      const channelData = audioBuffer.getChannelData(0);
      const step = Math.floor(channelData.length / numBars) || 1;
      const res = new Float32Array(numBars);
      let maxPeak = 0.001;
      for (let i = 0; i < numBars; i++) {
        let sum = 0;
        const start = i * step;
        const end = Math.min(start + step, channelData.length);
        for (let j = start; j < end; j++) {
          const v = Math.abs(channelData[j]);
          if (v > sum) sum = v;
        }
        res[i] = sum;
        if (sum > maxPeak) maxPeak = sum;
      }
      // Chuẩn hóa
      for (let i = 0; i < numBars; i++) {
        res[i] = Math.max(0.12, Math.min(1.0, res[i] / maxPeak));
      }
      return res;
    }

    function tryDecodePeaksFromUrl(url) {
      if (!url || url.startsWith('data:audio') || url.startsWith('blob:')) {
        // Thử fetch blob
        fetch(url)
          .then((r) => r.arrayBuffer())
          .then((ab) => {
            const ac = getAudioCtx();
            if (!ac) return;
            return ac.decodeAudioData(ab).then((buf) => {
              peaks = extractPeaksFromBuffer(buf, 60);
              draw();
            });
          })
          .catch(() => {});
      }
    }

    // Thiết lập mảng peaks từ dữ liệu Float32Array bên ngoài (vd từ decodeTo16kMono của app)
    canvas.setAudioData = function (float32Array) {
      if (!float32Array || !float32Array.length) return;
      const numBars = 60;
      const step = Math.floor(float32Array.length / numBars) || 1;
      const res = new Float32Array(numBars);
      let maxPeak = 0.001;
      for (let i = 0; i < numBars; i++) {
        let sum = 0;
        const start = i * step;
        const end = Math.min(start + step, float32Array.length);
        for (let j = start; j < end; j++) {
          const v = Math.abs(float32Array[j]);
          if (v > sum) sum = v;
        }
        res[i] = sum;
        if (sum > maxPeak) maxPeak = sum;
      }
      for (let i = 0; i < numBars; i++) {
        res[i] = Math.max(0.12, Math.min(1.0, res[i] / maxPeak));
      }
      peaks = res;
      draw();
    };

    // Đảm bảo canvas sắc nét trên màn hình Retina / High-DPI
    function getMetrics() {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(260, Math.floor(rect.width || canvas.width || 600));
      const h = Math.max(50, Math.floor(rect.height || canvas.height || 56));

      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }

      ctx.resetTransform();
      ctx.scale(dpr, dpr);

      const hasAudio = !!audio.src && Number.isFinite(audio.duration) && audio.duration > 0;
      const duration = hasAudio ? audio.duration : 0;
      const currentTime = hasAudio ? audio.currentTime : 0;
      const progress = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

      // Tính tọa độ các thành phần
      const playBtn = { cx: 28, cy: h / 2, r: 16 };
      const muteBtn = { cx: w - 22, cy: h / 2, r: 13 };
      const timeBox = { x: w - 106, cy: h / 2 };
      const track = {
        x: 58,
        y: h / 2,
        endX: Math.max(80, timeBox.x - 14),
        h: h - 18
      };
      track.width = Math.max(20, track.endX - track.x);

      return { w, h, playBtn, muteBtn, timeBox, track, hasAudio, duration, currentTime, progress };
    }

    // Vẽ toàn bộ giao diện player lên canvas
    function draw() {
      const m = getMetrics();
      const { w, h, playBtn, muteBtn, timeBox, track, hasAudio, duration, currentTime, progress } = m;

      ctx.clearRect(0, 0, w, h);

      // 1. Nền bo góc của thẻ canvas
      ctx.save();
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, '#0f172a');
      bgGrad.addColorStop(1, '#1e293b');
      ctx.fillStyle = bgGrad;
      ctx.beginPath();
      ctx.roundRect(0.5, 0.5, w - 1, h - 1, 14);
      ctx.fill();

      // Viền tinh tế
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Viền sáng trên đỉnh
      const topLight = ctx.createLinearGradient(20, 1, w - 20, 1);
      topLight.addColorStop(0, 'rgba(34, 211, 238, 0)');
      topLight.addColorStop(0.5, 'rgba(34, 211, 238, 0.22)');
      topLight.addColorStop(1, 'rgba(99, 102, 241, 0)');
      ctx.strokeStyle = topLight;
      ctx.beginPath();
      ctx.moveTo(14, 1.5);
      ctx.lineTo(w - 14, 1.5);
      ctx.stroke();
      ctx.restore();

      // 2. Nút Play / Pause
      ctx.save();
      const isPlayHover = hoverState === 'play';
      const playGrad = ctx.createLinearGradient(playBtn.cx - playBtn.r, playBtn.cy - playBtn.r, playBtn.cx + playBtn.r, playBtn.cy + playBtn.r);

      if (!hasAudio && !audio.src) {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.16)';
      } else if (!audio.paused) {
        playGrad.addColorStop(0, '#06b6d4');
        playGrad.addColorStop(1, '#6366f1');
        ctx.fillStyle = playGrad;
        ctx.shadowColor = 'rgba(34, 211, 238, 0.45)';
        ctx.shadowBlur = isPlayHover ? 14 : 9;
      } else {
        playGrad.addColorStop(0, isPlayHover ? '#38bdf8' : '#0ea5e9');
        playGrad.addColorStop(1, isPlayHover ? '#818cf8' : '#6366f1');
        ctx.fillStyle = playGrad;
        if (isPlayHover) {
          ctx.shadowColor = 'rgba(14, 165, 233, 0.5)';
          ctx.shadowBlur = 12;
        }
      }

      ctx.beginPath();
      ctx.arc(playBtn.cx, playBtn.cy, isPlayHover && hasAudio ? playBtn.r + 1 : playBtn.r, 0, Math.PI * 2);
      ctx.fill();

      // Icon Play hoặc Pause
      ctx.shadowBlur = 0;
      ctx.fillStyle = hasAudio || audio.src ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';

      if (audio.paused || !hasAudio) {
        // Biểu tượng tam giác Play
        ctx.beginPath();
        const px = playBtn.cx - 3.5;
        const py = playBtn.cy;
        ctx.moveTo(px, py - 6.5);
        ctx.lineTo(px + 10, py);
        ctx.lineTo(px, py + 6.5);
        ctx.closePath();
        ctx.fill();
      } else {
        // Biểu tượng hai vạch Pause
        const bx = playBtn.cx - 4.5;
        const by = playBtn.cy - 6;
        ctx.beginPath();
        ctx.roundRect(bx, by, 3, 12, 1.5);
        ctx.roundRect(bx + 6, by, 3, 12, 1.5);
        ctx.fill();
      }
      ctx.restore();

      // 3. Thanh sóng âm thanh Waveform & Progress
      ctx.save();
      const barWidth = 3;
      const barGap = 2;
      const numBars = Math.max(10, Math.floor(track.width / (barWidth + barGap)));

      if (!peaks || peaks.length !== numBars) {
        peaks = generateSpeechPeaks(audio.src || 'txa-default-wave', numBars);
      }

      const centerY = track.y;
      const maxH = track.h;
      const isPlaying = !audio.paused && hasAudio;
      const now = performance.now();

      for (let i = 0; i < numBars; i++) {
        const barX = track.x + i * (barWidth + barGap);
        const barRatio = i / numBars;
        const isPassed = barRatio <= progress;

        let barH = Math.max(4, peaks[i] * maxH);

        // Hiệu ứng nhịp chuyển động vi mô khi đang phát
        if (isPlaying) {
          const distToPlayhead = Math.abs(barRatio - progress);
          if (distToPlayhead < 0.12) {
            const waveBounce = Math.sin(now * 0.015 + i * 0.6) * 4.5;
            barH = Math.max(5, barH + waveBounce);
          }
        }

        const topY = centerY - barH / 2;

        ctx.beginPath();
        ctx.roundRect(barX, topY, barWidth, barH, barWidth / 2);

        if (isPassed) {
          // Các vạch đã phát qua: màu cyan ánh tím
          const barGrad = ctx.createLinearGradient(0, topY, 0, topY + barH);
          barGrad.addColorStop(0, '#22d3ee');
          barGrad.addColorStop(1, '#818cf8');
          ctx.fillStyle = barGrad;
        } else {
          // Các vạch chưa phát: màu mờ tinh tế
          ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
        }
        ctx.fill();
      }

      // Vị trí con chạy playhead
      if (hasAudio && duration > 0) {
        const headX = track.x + progress * track.width;
        // Điểm đầu playhead phát sáng
        ctx.shadowColor = '#22d3ee';
        ctx.shadowBlur = 8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(headX, centerY, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // Đường xem trước khi rê chuột lên thanh sóng
      if (hoverState === 'track' && hasAudio) {
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(hoverX, centerY - maxH / 2);
        ctx.lineTo(hoverX, centerY + maxH / 2);
        ctx.stroke();
      }
      ctx.restore();

      // 4. Thời gian (Hiện tại / Tổng)
      ctx.save();
      ctx.font = '600 11.5px "Be Vietnam Pro", system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const timeStr = `${formatTime(currentTime)} / ${formatTime(duration)}`;
      ctx.fillText(timeStr, timeBox.x, timeBox.cy);
      ctx.restore();

      // 5. Nút Bật / Tắt tiếng (Mute)
      ctx.save();
      const isMuteHover = hoverState === 'mute';
      const isMuted = audio.muted || audio.volume === 0;

      ctx.fillStyle = isMuteHover ? '#ffffff' : (isMuted ? '#f43f5e' : '#94a3b8');
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const mx = muteBtn.cx;
      const my = muteBtn.cy;

      // Hình loa
      ctx.beginPath();
      ctx.moveTo(mx - 6, my - 3.5);
      ctx.lineTo(mx - 3, my - 3.5);
      ctx.lineTo(mx + 1, my - 7);
      ctx.lineTo(mx + 1, my + 7);
      ctx.lineTo(mx - 3, my + 3.5);
      ctx.lineTo(mx - 6, my + 3.5);
      ctx.closePath();
      ctx.fill();

      if (isMuted) {
        // Gạch chéo khi tắt tiếng
        ctx.beginPath();
        ctx.moveTo(mx + 4, my - 4);
        ctx.lineTo(mx + 9, my + 4);
        ctx.moveTo(mx + 9, my - 4);
        ctx.lineTo(mx + 4, my + 4);
        ctx.stroke();
      } else {
        // Sóng âm thanh
        ctx.beginPath();
        ctx.arc(mx + 1, my, 5, -Math.PI / 4, Math.PI / 4, false);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mx + 1, my, 8.5, -Math.PI / 4, Math.PI / 4, false);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Vòng lặp hoạt họa mượt mà khi đang phát
    function loop() {
      draw();
      if (!audio.paused) {
        animId = requestAnimationFrame(loop);
      } else {
        animId = null;
      }
    }

    function startAnim() {
      if (!animId) loop();
    }

    function stopAnim() {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      draw();
    }

    // Tương tác chuột & cảm ứng
    function getEventPos(e) {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.touches && e.touches.length ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches.length ? e.touches[0].clientY : e.clientY;
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    }

    function updateHover(pos) {
      const m = getMetrics();
      const dxPlay = pos.x - m.playBtn.cx;
      const dyPlay = pos.y - m.playBtn.cy;
      const isOverPlay = Math.sqrt(dxPlay * dxPlay + dyPlay * dyPlay) <= m.playBtn.r + 4;

      const dxMute = pos.x - m.muteBtn.cx;
      const dyMute = pos.y - m.muteBtn.cy;
      const isOverMute = Math.sqrt(dxMute * dxMute + dyMute * dyMute) <= m.muteBtn.r + 4;

      const isOverTrack = pos.x >= m.track.x - 4 && pos.x <= m.track.endX + 4 && pos.y >= m.track.y - 18 && pos.y <= m.track.y + 18;

      if (isOverPlay) {
        hoverState = 'play';
        canvas.style.cursor = 'pointer';
      } else if (isOverMute) {
        hoverState = 'mute';
        canvas.style.cursor = 'pointer';
      } else if (isOverTrack) {
        hoverState = 'track';
        hoverX = Math.max(m.track.x, Math.min(m.track.endX, pos.x));
        canvas.style.cursor = 'pointer';
      } else {
        hoverState = null;
        canvas.style.cursor = 'default';
      }
      draw();
    }

    function seekAt(x) {
      const m = getMetrics();
      if (!m.hasAudio || m.duration <= 0) return;
      const ratio = Math.max(0, Math.min(1, (x - m.track.x) / m.track.width));
      audio.currentTime = ratio * m.duration;
      draw();
    }

    canvas.addEventListener('mousemove', (e) => {
      const pos = getEventPos(e);
      if (isDragging) {
        seekAt(pos.x);
      } else {
        updateHover(pos);
      }
    });

    canvas.addEventListener('mouseleave', () => {
      isDragging = false;
      hoverState = null;
      canvas.style.cursor = 'default';
      draw();
    });

    canvas.addEventListener('mousedown', (e) => {
      const pos = getEventPos(e);
      const m = getMetrics();
      const dxPlay = pos.x - m.playBtn.cx;
      const dyPlay = pos.y - m.playBtn.cy;

      if (Math.sqrt(dxPlay * dxPlay + dyPlay * dyPlay) <= m.playBtn.r + 4) {
        // Bấm nút Play/Pause
        if (!audio.src) return;
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
        return;
      }

      const dxMute = pos.x - m.muteBtn.cx;
      const dyMute = pos.y - m.muteBtn.cy;
      if (Math.sqrt(dxMute * dxMute + dyMute * dyMute) <= m.muteBtn.r + 4) {
        audio.muted = !audio.muted;
        draw();
        return;
      }

      if (pos.x >= m.track.x - 6 && pos.x <= m.track.endX + 6) {
        isDragging = true;
        seekAt(pos.x);
      }
    });

    window.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        draw();
      }
    });

    // Hỗ trợ Touch cho điện thoại
    canvas.addEventListener('touchstart', (e) => {
      const pos = getEventPos(e);
      const m = getMetrics();
      const dxPlay = pos.x - m.playBtn.cx;
      const dyPlay = pos.y - m.playBtn.cy;

      if (Math.sqrt(dxPlay * dxPlay + dyPlay * dyPlay) <= m.playBtn.r + 8) {
        e.preventDefault();
        if (!audio.src) return;
        if (audio.paused) {
          audio.play().catch(() => {});
        } else {
          audio.pause();
        }
        return;
      }

      const dxMute = pos.x - m.muteBtn.cx;
      const dyMute = pos.y - m.muteBtn.cy;
      if (Math.sqrt(dxMute * dxMute + dyMute * dyMute) <= m.muteBtn.r + 8) {
        e.preventDefault();
        audio.muted = !audio.muted;
        draw();
        return;
      }

      if (pos.x >= m.track.x - 8 && pos.x <= m.track.endX + 8) {
        e.preventDefault();
        isDragging = true;
        seekAt(pos.x);
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (isDragging) {
        e.preventDefault();
        const pos = getEventPos(e);
        seekAt(pos.x);
      }
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      isDragging = false;
      draw();
    });

    // Phím tắt bàn phím
    canvas.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        draw();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
        draw();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        audio.muted = !audio.muted;
        draw();
      }
    });

    // Đồng bộ sự kiện âm thanh từ đối tượng audio ngầm
    audio.addEventListener('play', () => {
      startAnim();
      canvas.dispatchEvent(new Event('play'));
    });
    audio.addEventListener('pause', () => {
      stopAnim();
      canvas.dispatchEvent(new Event('pause'));
    });
    audio.addEventListener('ended', () => {
      stopAnim();
      canvas.dispatchEvent(new Event('ended'));
    });
    audio.addEventListener('timeupdate', () => {
      draw();
      canvas.dispatchEvent(new Event('timeupdate'));
    });
    audio.addEventListener('loadedmetadata', () => {
      peaks = null;
      draw();
      canvas.dispatchEvent(new Event('loadedmetadata'));
    });
    audio.addEventListener('durationchange', () => {
      draw();
      canvas.dispatchEvent(new Event('durationchange'));
    });
    audio.addEventListener('canplay', () => {
      draw();
      canvas.dispatchEvent(new Event('canplay'));
    });

    // PROXY HOÀN HẢO CÁC THUỘC TÍNH CỦA HTMLAudioElement LÊN THẺ CANVAS
    // Giúp code hiện tại (app.js) gọi player.src, player.play(), player.currentTime mượt mà
    Object.defineProperty(canvas, 'src', {
      get: () => audio.src,
      set: (val) => {
        if (!val) {
          audio.removeAttribute('src');
          audio.load();
          peaks = null;
          draw();
          return;
        }
        audio.src = val;
        audio.load();
        peaks = generateSpeechPeaks(val, 60);
        tryDecodePeaksFromUrl(val);
        draw();
      },
      configurable: true
    });

    Object.defineProperty(canvas, 'currentTime', {
      get: () => audio.currentTime,
      set: (val) => {
        audio.currentTime = Number(val) || 0;
        draw();
      },
      configurable: true
    });

    Object.defineProperty(canvas, 'duration', {
      get: () => audio.duration || 0,
      configurable: true
    });

    Object.defineProperty(canvas, 'paused', {
      get: () => audio.paused,
      configurable: true
    });

    Object.defineProperty(canvas, 'muted', {
      get: () => audio.muted,
      set: (val) => {
        audio.muted = !!val;
        draw();
      },
      configurable: true
    });

    Object.defineProperty(canvas, 'volume', {
      get: () => audio.volume,
      set: (val) => {
        audio.volume = Math.max(0, Math.min(1, Number(val) || 0));
        draw();
      },
      configurable: true
    });

    Object.defineProperty(canvas, 'playbackRate', {
      get: () => audio.playbackRate,
      set: (val) => { audio.playbackRate = Number(val) || 1; },
      configurable: true
    });

    canvas.play = () => audio.play();
    canvas.pause = () => { audio.pause(); draw(); };
    canvas.load = () => { audio.load(); draw(); };
    canvas.canPlayType = (t) => audio.canPlayType(t);

    const origRemoveAttr = canvas.removeAttribute.bind(canvas);
    canvas.removeAttribute = function (attr) {
      if (attr === 'src') {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        peaks = null;
        draw();
      }
      return origRemoveAttr(attr);
    };

    // Theo dõi co giãn cửa sổ
    const ro = new ResizeObserver(() => draw());
    ro.observe(canvas);

    draw();
    return canvas;
  }

  // Khởi tạo tự động cho tất cả thẻ canvas audio player
  function initAllCanvasPlayers() {
    document.querySelectorAll('canvas.audio-canvas-player, #player, #tts-player').forEach((el) => {
      if (el.tagName === 'CANVAS') {
        attachCanvasAudioPlayer(el);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllCanvasPlayers);
  } else {
    initAllCanvasPlayers();
  }

  window.attachCanvasAudioPlayer = attachCanvasAudioPlayer;
})();
