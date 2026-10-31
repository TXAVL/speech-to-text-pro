/* =====================================================================
 * CAPCUT AUTO DUBBING STUDIO - DỊCH THUẬT & LỒNG TIẾNG VIDEO TỰ ĐỘNG
 * Quy trình chuẩn phòng thu: Tải video/âm thanh -> STT bóc băng ->
 * AI dịch thuật kịch bản -> TTS tạo giọng đọc mới khớp timecode ->
 * Ghép lại vào video (giữ nhạc nền, thay giọng nói, hardsub CapCut).
 * ===================================================================== */

const vkDubbing = (() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  const STATE = {
    media: null,           // { file, blob, url, duration, isVideo, name, width, height, audioBuffer, vocals, instrumental }
    cues: [],              // [ { id, start, end, origText, text, status, audioBuffer, blob, sped } ]
    step: 1,               // 1: Media -> 2: STT -> 3: Translate -> 4: TTS -> 5: Export
    busy: false,
    playing: false,
    audioContext: null,
    dubAudioSource: null,
    renderedWavBlob: null,
    renderedWavUrl: null,
    raf: 0,
    voicesLoaded: false
  };

  const LANGS = [
    { code: 'vi', name: 'Tiếng Việt', stt: 'vietnamese' },
    { code: 'en', name: 'English (Tiếng Anh)', stt: 'english' },
    { code: 'zh', name: '中文 (Tiếng Trung)', stt: 'chinese' },
    { code: 'ja', name: '日本語 (Tiếng Nhật)', stt: 'japanese' },
    { code: 'ko', name: '한국어 (Tiếng Hàn)', stt: 'korean' },
    { code: 'fr', name: 'Français (Tiếng Pháp)', stt: 'french' },
    { code: 'es', name: 'Español (Tây Ban Nha)', stt: 'spanish' },
    { code: 'de', name: 'Deutsch (Tiếng Đức)', stt: 'german' },
    { code: 'ru', name: 'Русский (Tiếng Nga)', stt: 'russian' },
    { code: 'th', name: 'ไทย (Tiếng Thái)', stt: 'thai' },
    { code: 'id', name: 'Bahasa Indonesia', stt: 'indonesian' }
  ];

  /* ---------------- Khởi tạo ---------------- */
  function onOpen() {
    if (!STATE.voicesLoaded) loadDubVoices();
    setupEvents();
  }

  function setupEvents() {
    const dz = $('#dub-dropzone');
    const fi = $('#dub-file-input');
    if (dz && fi && !dz.dataset.bound) {
      dz.dataset.bound = '1';
      dz.addEventListener('click', () => fi.click());
      fi.addEventListener('change', (e) => {
        const f = e.target.files[0];
        if (f) handleMediaFile(f);
        e.target.value = '';
      });
      dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.style.borderColor = '#00e5ff'; });
      dz.addEventListener('dragleave', () => { dz.style.borderColor = ''; });
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.style.borderColor = '';
        const f = e.dataTransfer.files[0];
        if (f) handleMediaFile(f);
      });
    }

    // Video Player transport
    const vid = $('#dub-video');
    if (vid && !vid.dataset.bound) {
      vid.dataset.bound = '1';
      vid.addEventListener('timeupdate', () => onVideoTimeUpdate());
      vid.addEventListener('ended', () => { STATE.playing = false; updatePlayBtn(); });
      vid.addEventListener('loadedmetadata', () => fitOverlay());
      window.addEventListener('resize', () => fitOverlay());
      window.addEventListener('orientationchange', () => setTimeout(fitOverlay, 250));
    }

    // Controls
    $('#btn-dub-play')?.addEventListener('click', togglePlay);
    $('#btn-dub-skip-b')?.addEventListener('click', () => seekRelative(-5));
    $('#btn-dub-skip-f')?.addEventListener('click', () => seekRelative(5));
    $('#dub-scrubber')?.addEventListener('input', (e) => {
      if (vid && isFinite(vid.duration)) vid.currentTime = Number(e.target.value);
    });

    // Voice Library change
    $('#dub-voice-lib')?.addEventListener('change', () => updateVoiceList());
    $('#dub-voice-select')?.addEventListener('change', () => updateVoiceCard());
    $('#btn-dub-test-voice')?.addEventListener('click', previewSelectedVoice);

    // Timeline tools
    $('#btn-tl-translate-all')?.addEventListener('click', () => stepTranslate());
    $('#btn-tl-tts-all')?.addEventListener('click', () => stepSynthesize());
    $('#btn-tl-add-cue')?.addEventListener('click', addNewCue);
    $('#btn-tl-clear-all')?.addEventListener('click', clearAllCues);

    // Top actions
    $('#btn-dub-auto')?.addEventListener('click', runOneClickAutoDub);
    $('#btn-dub-export')?.addEventListener('click', exportFullVideo);
    $('#btn-dub-export-audio')?.addEventListener('click', exportDubAudio);
    $('#btn-dub-export-srt')?.addEventListener('click', exportSubtitles);

    // Sliders
    $('#dub-vol-orig')?.addEventListener('input', (e) => {
      $('#dub-vol-orig-val').textContent = e.target.value + '%';
      if (vid) vid.volume = Number(e.target.value) / 100;
    });
    $('#dub-vol-dub')?.addEventListener('input', (e) => {
      $('#dub-vol-dub-val').textContent = e.target.value + '%';
    });
    $('#dub-tts-rate')?.addEventListener('input', (e) => {
      $('#dub-tts-rate-val').textContent = Number(e.target.value).toFixed(2) + '×';
    });
  }

  /* ---------------- Nạp danh sách giọng đọc ---------------- */
  async function loadDubVoices() {
    STATE.voicesLoaded = true;
    const libSelect = $('#dub-voice-lib');
    if (!libSelect) return;

    libSelect.innerHTML = `
      <option value="vieneu" selected>VieNeu-TTS Studio Pro (35 giọng Việt 3 miền)</option>
      <option value="edge">Microsoft Edge Neural (Đa ngôn ngữ & VN miễn phí)</option>
      <option value="capcut">CapCut / TikTok Global (Giọng Viral Review)</option>
      <option value="supertonic">Supertonic 3 Pro (31 ngôn ngữ quốc tế)</option>
      <option value="piper">Piper (Chạy offline trong máy)</option>
    `;

    updateVoiceList();
  }

  function updateVoiceList() {
    const lib = $('#dub-voice-lib')?.value || 'vieneu';
    const select = $('#dub-voice-select');
    if (!select) return;
    select.innerHTML = '';

    if (lib === 'vieneu') {
      const voices = window.VIENEU_VOICES || [
        { id: 'hn_nam_minhquan', name: 'Minh Quân (Bắc)', desc: 'Tự nhiên, truyền cảm, mặc định' },
        { id: 'hn_nu_maiphuong', name: 'Mai Phương (Bắc)', desc: 'Nữ nhẹ nhàng, thanh lịch' },
        { id: 'sg_nam_hoangnam', name: 'Hoàng Nam (Nam)', desc: 'Review phim, trầm ấm, lôi cuốn' },
        { id: 'sg_nu_thuytien', name: 'Thủy Tiên (Nam)', desc: 'Nữ trẻ trung, hiện đại' },
        { id: 'trinhtham_nam_quangminh', name: 'Quang Minh (Trinh thám)', desc: 'Kể chuyện huyền bí, giật gân' },
        { id: 'review_nam_theanh', name: 'Thế Anh (Review phim)', desc: 'Phong cách tóm tắt phim TikTok' }
      ];
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.name} · ${v.desc || ''}`;
        opt.dataset.desc = v.desc || '';
        select.appendChild(opt);
      });
    } else if (lib === 'edge') {
      const edgeV = [
        { id: 'vi-VN-HoaiMyNeural', name: 'Hoài My (Nữ · Việt Nam)', lang: 'vi' },
        { id: 'vi-VN-NamMinhNeural', name: 'Nam Minh (Nam · Việt Nam)', lang: 'vi' },
        { id: 'en-US-GuyNeural', name: 'Guy (Nam · US English)', lang: 'en' },
        { id: 'en-US-JennyNeural', name: 'Jenny (Nữ · US English)', lang: 'en' },
        { id: 'zh-CN-XiaoxiaoNeural', name: '晓晓 Xiaoxiao (Nữ · Trung Quốc)', lang: 'zh' },
        { id: 'ja-JP-NanamiNeural', name: '七海 Nanami (Nữ · Nhật Bản)', lang: 'ja' },
        { id: 'ko-KR-SunHiNeural', name: '선희 Sun-Hi (Nữ · Hàn Quốc)', lang: 'ko' }
      ];
      edgeV.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        select.appendChild(opt);
      });
    } else if (lib === 'capcut') {
      const capV = [
        { id: 'BV001_streaming', name: 'Cô Gái Sôi Nổi (Review Viral)' },
        { id: 'BV002_streaming', name: 'Thanh Niên Tự Tin (Kể chuyện)' },
        { id: 'BV007_streaming', name: 'Chị Google Truyền Cảm' },
        { id: 'en_male_narration', name: 'US TikTok Narrator (Viral)' }
      ];
      capV.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        select.appendChild(opt);
      });
    } else if (lib === 'supertonic') {
      const stV = window.SUPERTONIC_VOICES || [
        { id: 'st_alex', name: 'Alex (Nam · Anh Mỹ trầm ấm)' },
        { id: 'st_sarah', name: 'Sarah (Nữ · Anh Mỹ ngọt ngào)' },
        { id: 'st_daiki', name: 'Daiki (Nam · Nhật Bản)' },
        { id: 'st_minji', name: 'Minji (Nữ · Hàn Quốc)' }
      ];
      stV.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        select.appendChild(opt);
      });
    } else {
      const opt = document.createElement('option');
      opt.value = 'vi_VN-vais1000-medium';
      opt.textContent = 'Vais1000 Medium (Tiếng Việt offline)';
      select.appendChild(opt);
    }

    updateVoiceCard();
  }

  function updateVoiceCard() {
    const sel = $('#dub-voice-select');
    const opt = sel?.selectedOptions[0];
    const nameEl = $('#dub-voice-card-name');
    const descEl = $('#dub-voice-card-desc');
    if (nameEl && opt) nameEl.textContent = opt.textContent.split('·')[0].trim();
    if (descEl && opt) descEl.textContent = opt.dataset.desc || opt.textContent;
  }

  /* ---------------- Xử lý Tệp Tải Lên ---------------- */
  async function handleMediaFile(file) {
    if (!file) return;
    const isVideo = /^video\//.test(file.type) || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name);
    const isAudio = /^audio\//.test(file.type) || /\.(mp3|wav|m4a|ogg|flac|aac|opus)$/i.test(file.name);

    if (!isVideo && !isAudio) {
      toast('Vui lòng chọn file video (MP4, WEBM, MKV...) hoặc file âm thanh (MP3, WAV...)', 'err');
      return;
    }

    setHud('Đang tải và phân tích tệp media…', 15);
    const url = URL.createObjectURL(file);
    const vid = $('#dub-video');
    const placeholder = $('#dub-monitor-placeholder');

    STATE.media = {
      file,
      blob: file,
      url,
      name: file.name,
      isVideo,
      duration: 0,
      width: 1280,
      height: 720
    };

    vid.src = url;
    vid.hidden = false;
    if (placeholder) placeholder.hidden = true;

    await new Promise((resolve) => {
      vid.onloadedmetadata = () => {
        STATE.media.duration = vid.duration || 0;
        STATE.media.width = vid.videoWidth || 1280;
        STATE.media.height = vid.videoHeight || 720;
        $('#dub-scrubber').max = vid.duration || 100;
        $('#dub-scrubber').value = 0;
        updateTimecode(0, vid.duration || 0);
        resolve();
      };
      vid.onerror = () => resolve();
    });

    $('#dub-media-info').hidden = false;
    $('#dub-media-name').textContent = file.name;
    $('#dub-media-meta').textContent = `${isVideo ? '🎬 Video' : '🎵 Âm thanh'} · ${clock(STATE.media.duration)} · ${(file.size / 1048576).toFixed(1)} MB`;

    setStep(2);
    setHud(null);
    toast(`Đã tải: ${file.name} (${clock(STATE.media.duration)})`, 'ok');
  }

  /* ---------------- Bước 1: STT Bóc Băng Kèm Timestamp ---------------- */
  async function stepTranscribe() {
    if (!STATE.media) return toast('Vui lòng tải video hoặc âm thanh lên trước.', 'err');
    setHud('Đang bóc băng nhận diện lời thoại (Whisper AI)…', 25);

    try {
      let vocals = null;
      if ($('#dub-opt-separate')?.checked) {
        setHud('Đang tách giọng khỏi nhạc nền (MDX-Net)…', 30);
        if (typeof getVocals === 'function') {
          vocals = await getVocals();
        }
      }

      setHud('Đang nhận diện mốc thời gian từng câu…', 50);
      const srcLang = $('#dub-src-lang')?.value || 'auto';
      const engineVal = $('#engine')?.value || 'local:onnx-community/whisper-small';
      const [kind, model] = engineVal.split(/:(.+)/);

      let out;
      if (typeof runLocal === 'function' && kind === 'local') {
        out = await runLocal(model || 'onnx-community/whisper-small', srcLang, vocals);
      } else if (typeof runCloud === 'function') {
        out = await runCloud(kind, model, srcLang, vocals);
      } else {
        throw new Error('Không tìm thấy động cơ nhận diện STT.');
      }

      if (!out || !out.segments || !out.segments.length) {
        throw new Error('Không phát hiện câu thoại nào trong tệp này.');
      }

      // Chuẩn hóa danh sách câu
      STATE.cues = out.segments.map((s, idx) => ({
        id: idx + 1,
        start: s.start,
        end: s.end,
        origText: s.text.trim(),
        text: s.text.trim(),
        status: 'pending', // pending -> translated -> ready
        audioBuffer: null,
        blob: null
      }));

      renderTimelineTracks();
      setStep(3);
      setHud(null);
      toast(`Đã bóc băng thành công ${STATE.cues.length} câu thoại!`, 'ok');
      return true;
    } catch (err) {
      setHud(null);
      toast('Lỗi bóc băng: ' + err.message, 'err');
      return false;
    }
  }

  /* ---------------- Bước 2: AI Dịch Thuật Kịch Bản ---------------- */
  async function stepTranslate() {
    if (!STATE.cues || !STATE.cues.length) return toast('Chưa có câu thoại nào để dịch.', 'err');
    const targetLang = $('#dub-target-lang')?.value || 'vi';
    const srcLang = $('#dub-src-lang')?.value || 'auto';

    setHud(`Đang dịch ${STATE.cues.length} câu thoại sang ngôn ngữ đích…`, 60);

    try {
      const texts = STATE.cues.map(c => c.origText || c.text);
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts, sl: srcLang === 'auto' ? 'auto' : srcLang.slice(0, 2), tl: targetLang })
      });

      if (!res.ok) throw new Error('Máy chủ dịch thuật phản hồi lỗi.');
      const data = await res.json();
      if (!data.success || !Array.isArray(data.translations)) throw new Error(data.error || 'Dịch thất bại');

      data.translations.forEach((trans, i) => {
        if (STATE.cues[i]) {
          STATE.cues[i].text = trans || STATE.cues[i].origText;
          STATE.cues[i].status = 'translated';
        }
      });

      renderTimelineTracks();
      setStep(4);
      setHud(null);
      toast(`Đã dịch xong toàn bộ ${STATE.cues.length} câu thoại!`, 'ok');
      return true;
    } catch (err) {
      setHud(null);
      toast('Lỗi dịch thuật: ' + err.message, 'err');
      return false;
    }
  }

  /* ---------------- Bước 3: Tạo Giọng Lồng Tiếng Khớp Timecode ---------------- */
  async function stepSynthesize() {
    if (!STATE.cues || !STATE.cues.length) return toast('Chưa có kịch bản để tạo giọng.', 'err');
    const lib = $('#dub-voice-lib')?.value || 'vieneu';
    const voice = $('#dub-voice-select')?.value || 'hn_nam_minhquan';
    const rate = Number($('#dub-tts-rate')?.value) || 1.0;
    const fitSpeed = $('#dub-opt-fit')?.checked ?? true;

    setHud(`Đang khởi động kho giọng ${lib.toUpperCase()}…`, 70);

    const synthOne = async (text) => {
      const urlMap = {
        vieneu: '/api/vieneu/tts',
        capcut: '/api/capcut/tts',
        edge: '/api/edge/tts',
        supertonic: '/api/supertonic/tts'
      };
      const endpoint = urlMap[lib];
      if (!endpoint) throw new Error('Kho giọng chưa hỗ trợ trực tiếp.');

      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, rate, cue: true })
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi tạo giọng');
      }
      return r.blob();
    };

    try {
      // Dùng vkSrt.render để tổng hợp toàn bộ câu thoại và tự co giãn WSOLA nếu tràn thời gian
      const items = STATE.cues.map(c => ({ start: c.start, end: c.end, text: c.text }));

      setHud(`Đang tạo giọng từng câu & khớp thời gian…`, 75);
      const res = await vkSrt.render(items, {
        synth: synthOne,
        decode: (blob, r) => vkAudio.decodeTo48k(blob, r),
        concurrency: 3,
        fit: fitSpeed,
        maxSpeed: 1.45,
        onStatus: (msg, pct) => setHud(msg, 75 + Math.round(pct * 0.2))
      });

      STATE.renderedWavBlob = res.blob;
      if (STATE.renderedWavUrl) URL.revokeObjectURL(STATE.renderedWavUrl);
      STATE.renderedWavUrl = URL.createObjectURL(res.blob);

      // Cập nhật trạng thái từng câu
      STATE.cues.forEach(c => { c.status = 'ready'; });
      renderTimelineTracks();

      // Nạp audio lồng tiếng vào player
      await prepareDubAudioBuffer(res.blob);

      setStep(5);
      setHud(null);
      toast(`Đã lồng tiếng xong toàn bộ video! Có thể bấm Play để nghe thử.`, 'ok');
      return true;
    } catch (err) {
      setHud(null);
      toast('Lỗi tạo giọng lồng tiếng: ' + err.message, 'err');
      return false;
    }
  }

  /* ---------------- Tự Động 1-Click (One-Click Auto Dub) ---------------- */
  async function runOneClickAutoDub() {
    if (!STATE.media) return toast('Vui lòng chọn video hoặc âm thanh trước khi bắt đầu!', 'err');
    const btn = $('#btn-dub-auto');
    if (btn) btn.disabled = true;

    try {
      toast('Bắt đầu quy trình Lồng tiếng tự động AI…', 'info');
      // 1. STT
      const ok1 = await stepTranscribe();
      if (!ok1) return;
      // 2. Dịch
      const ok2 = await stepTranslate();
      if (!ok2) return;
      // 3. Tạo giọng
      const ok3 = await stepSynthesize();
      if (!ok3) return;

      toast('🎉 Hoàn tất lồng tiếng video! Bạn có thể xem trước hoặc xuất file ngay bây giờ.', 'ok');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- Trình phát Studio & Sync Video + Dub Audio ---------------- */
  async function prepareDubAudioBuffer(wavBlob) {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    STATE.audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const actx = STATE.audioContext;
    const arrayBuf = await wavBlob.arrayBuffer();
    STATE.dubAudioBuffer = await actx.decodeAudioData(arrayBuf);
  }

  function togglePlay() {
    const vid = $('#dub-video');
    if (!vid) return;
    if (STATE.playing) {
      vid.pause();
      stopDubAudio();
      STATE.playing = false;
    } else {
      vid.play();
      startDubAudio(vid.currentTime);
      STATE.playing = true;
      loop();
    }
    updatePlayBtn();
  }

  function startDubAudio(offsetSec) {
    if (!STATE.dubAudioBuffer || !STATE.audioContext) return;
    stopDubAudio();
    const actx = STATE.audioContext;
    if (actx.state === 'suspended') actx.resume();

    const src = actx.createBufferSource();
    src.buffer = STATE.dubAudioBuffer;

    const gain = actx.createGain();
    const dubVol = (Number($('#dub-vol-dub')?.value) || 100) / 100;
    gain.gain.value = dubVol;

    src.connect(gain);
    gain.connect(actx.destination);

    const when = actx.currentTime;
    src.start(when, offsetSec);
    STATE.dubAudioSource = src;
  }

  function stopDubAudio() {
    if (STATE.dubAudioSource) {
      try { STATE.dubAudioSource.stop(); } catch {}
      STATE.dubAudioSource = null;
    }
  }

  function seekRelative(delta) {
    const vid = $('#dub-video');
    if (!vid) return;
    vid.currentTime = Math.max(0, Math.min(vid.duration || 0, vid.currentTime + delta));
    if (STATE.playing) startDubAudio(vid.currentTime);
  }

  function updatePlayBtn() {
    const btn = $('#btn-dub-play');
    if (btn) btn.innerHTML = STATE.playing ? '⏸' : '▶';
  }

  function onVideoTimeUpdate() {
    const vid = $('#dub-video');
    if (!vid) return;
    const cur = vid.currentTime;
    const dur = vid.duration || 0;
    $('#dub-scrubber').value = cur;
    updateTimecode(cur, dur);

    // Highlight active cue in timeline
    const active = STATE.cues.find(c => cur >= c.start && cur < c.end);
    $$('.studio-cue-row').forEach(row => {
      row.classList.toggle('active', Number(row.dataset.id) === active?.id);
    });
  }

  function updateTimecode(cur, dur) {
    $('#dub-timecode').textContent = `${clock(cur)} / ${clock(dur)}`;
  }

  /* ---------------- Vẽ Subtitle Lên Màn Hình Video (CapCut Overlay) ---------------- */
  function fitOverlay() {
    const v = $('#dub-video'), c = $('#dub-overlay');
    if (!v || !c || !v.videoWidth) return;
    const box = v.getBoundingClientRect(), stage = $('#dub-monitor-wrap').getBoundingClientRect();
    const scale = Math.min(box.width / v.videoWidth, box.height / v.videoHeight);
    const w = v.videoWidth * scale, h = v.videoHeight * scale;
    Object.assign(c.style, {
      width: w + 'px',
      height: h + 'px',
      left: (box.left - stage.left + (box.width - w) / 2) + 'px',
      top: (box.top - stage.top + (box.height - h) / 2) + 'px'
    });
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }

  function loop() {
    const v = $('#dub-video'), c = $('#dub-overlay');
    if (v && c && c.width) {
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      const showSub = $('#dub-opt-show-sub')?.checked ?? true;
      if (showSub) {
        const cur = v.currentTime;
        const activeCue = STATE.cues.find(cu => cur >= cu.start && cur < cu.end);
        if (activeCue && activeCue.text) {
          drawCapCutSub(ctx, c.width, c.height, activeCue.text);
        }
      }
    }
    if (STATE.playing) STATE.raf = requestAnimationFrame(loop);
  }

  function drawCapCutSub(ctx, W, H, text) {
    const fs = Math.max(16, Math.round(H * 0.055));
    ctx.font = `800 ${fs}px "Montserrat", "Be Vietnam Pro", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';

    const words = text.split(/\s+/);
    let lines = [], cur = '';
    const maxW = W * 0.85;
    for (let w of words) {
      const test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) { lines.push(cur); cur = w; } else cur = test;
    }
    if (cur) lines.push(cur);

    const lh = fs * 1.3;
    const yTop = H * 0.85 - (lines.length * lh) / 2;

    lines.forEach((line, i) => {
      const y = yTop + i * lh;
      // CapCut viền đen dày đổ bóng vàng rực
      ctx.lineWidth = fs * 0.22;
      ctx.strokeStyle = '#000000';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowOffsetY = fs * 0.08;
      ctx.shadowBlur = fs * 0.12;
      ctx.strokeText(line, W / 2, y);

      ctx.fillStyle = '#ffdf00'; // Vàng CapCut
      ctx.fillText(line, W / 2, y);
    });
  }

  /* ---------------- Dựng Giao Diện Danh Sách Câu Thoại (Timeline Editor) ---------------- */
  function renderTimelineTracks() {
    const list = $('#dub-track-list');
    const empty = $('#dub-track-empty');
    if (!list) return;

    if (!STATE.cues || !STATE.cues.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      $('#dub-cue-count').textContent = '0 câu';
      return;
    }

    if (empty) empty.hidden = true;
    $('#dub-cue-count').textContent = `${STATE.cues.length} câu thoại`;

    list.innerHTML = STATE.cues.map((c, i) => `
      <div class="studio-cue-row" data-id="${c.id}">
        <div class="cue-time-col">
          <span class="cue-time-badge" onclick="vkDubbing.seekTo(${c.start})">${fmtSec(c.start)} ➔ ${fmtSec(c.end)}</span>
          <span class="cue-dur-tag">${(c.end - c.start).toFixed(1)}s</span>
        </div>
        <div class="cue-orig-col">
          <div class="cue-orig-text">${escapeHtml(c.origText || c.text)}</div>
        </div>
        <div class="cue-arrow-col">➔</div>
        <div class="cue-dub-col">
          <textarea class="cue-dub-input" onchange="vkDubbing.updateCueText(${c.id}, this.value)" spellcheck="false">${escapeHtml(c.text)}</textarea>
        </div>
        <div class="cue-actions-col">
          <span class="cue-status-indicator ${c.status}">${statusLabel(c.status)}</span>
          <button type="button" class="btn-cue-icon" title="Dịch lại câu này" onclick="vkDubbing.translateSingleCue(${c.id})">🌐</button>
          <button type="button" class="btn-cue-icon" title="Đọc lại câu này" onclick="vkDubbing.synthSingleCue(${c.id})">🗣️</button>
          <button type="button" class="btn-cue-icon" title="Xóa câu này" onclick="vkDubbing.deleteCue(${c.id})">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  function statusLabel(s) {
    if (s === 'ready') return '✓ Đã tạo giọng';
    if (s === 'translated') return '✓ Đã dịch';
    if (s === 'busy') return '⏳ Đang tạo...';
    return '○ Chưa tạo';
  }

  function seekTo(sec) {
    const vid = $('#dub-video');
    if (vid) {
      vid.currentTime = sec;
      if (STATE.playing) startDubAudio(sec);
    }
  }

  function updateCueText(id, newText) {
    const c = STATE.cues.find(x => x.id === id);
    if (c) c.text = newText.trim();
  }

  async function translateSingleCue(id) {
    const c = STATE.cues.find(x => x.id === id);
    if (!c) return;
    const targetLang = $('#dub-target-lang')?.value || 'vi';
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: c.origText || c.text, tl: targetLang })
      });
      const data = await res.json();
      if (data.success && data.result) {
        c.text = data.result;
        c.status = 'translated';
        renderTimelineTracks();
        toast('Đã dịch lại câu thoại.', 'ok');
      }
    } catch {
      toast('Không dịch được câu này.', 'err');
    }
  }

  async function synthSingleCue(id) {
    const c = STATE.cues.find(x => x.id === id);
    if (!c) return;
    const lib = $('#dub-voice-lib')?.value || 'vieneu';
    const voice = $('#dub-voice-select')?.value || 'hn_nam_minhquan';
    const rate = Number($('#dub-tts-rate')?.value) || 1.0;
    c.status = 'busy';
    renderTimelineTracks();

    try {
      const endpoint = lib === 'vieneu' ? '/api/vieneu/tts' : lib === 'capcut' ? '/api/capcut/tts' : '/api/edge/tts';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: c.text, voice, rate, cue: true })
      });
      if (!r.ok) throw new Error('Lỗi tạo giọng');
      const blob = await r.blob();
      c.blob = blob;
      c.status = 'ready';
      renderTimelineTracks();
      const a = new Audio(URL.createObjectURL(blob));
      a.play().catch(() => {});
      toast('Đã tạo giọng cho câu này.', 'ok');
    } catch (e) {
      c.status = 'translated';
      renderTimelineTracks();
      toast(e.message, 'err');
    }
  }

  function deleteCue(id) {
    STATE.cues = STATE.cues.filter(x => x.id !== id);
    renderTimelineTracks();
  }

  function addNewCue() {
    const vid = $('#dub-video');
    const cur = vid ? vid.currentTime : 0;
    const id = Date.now();
    STATE.cues.push({
      id,
      start: cur,
      end: cur + 3,
      origText: 'Thoại mới',
      text: 'Thoại lồng tiếng mới',
      status: 'pending'
    });
    STATE.cues.sort((a, b) => a.start - b.start);
    renderTimelineTracks();
  }

  function clearAllCues() {
    STATE.cues = [];
    renderTimelineTracks();
  }

  /* ---------------- Xem Thử Giọng Nhanh (Preview Selected Voice) ---------------- */
  async function previewSelectedVoice() {
    const lib = $('#dub-voice-lib')?.value || 'vieneu';
    const voice = $('#dub-voice-select')?.value || 'hn_nam_minhquan';
    const sample = 'Xin chào! Tôi là giọng đọc AI của CapCut Auto Dubbing Studio.';
    const btn = $('#btn-dub-test-voice');
    if (btn) btn.disabled = true;

    try {
      const endpoint = lib === 'vieneu' ? '/api/vieneu/tts' : lib === 'capcut' ? '/api/capcut/tts' : '/api/edge/tts';
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: sample, voice, rate: 1 })
      });
      if (!r.ok) throw new Error('Không tải được mẫu giọng.');
      const blob = await r.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play();
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- Xuất Video Hoàn Chỉnh (Hardsub + Mixed Audio) ---------------- */
  async function exportFullVideo() {
    if (!STATE.media || !STATE.cues.length) return toast('Vui lòng bóc băng và lồng tiếng trước khi xuất video.', 'err');
    if (!STATE.renderedWavBlob) {
      const ok = await stepSynthesize();
      if (!ok) return;
    }

    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      return toast('Trình duyệt không hỗ trợ MediaRecorder Canvas Stream. Hãy dùng Chrome hoặc Edge.', 'err');
    }

    const mime = ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || '';

    setHud('Đang chuẩn bị xuất video lồng tiếng chuẩn CapCut…', 5);

    const v = document.createElement('video');
    Object.assign(v.style, { position: 'fixed', left: '-9999px', width: '2px', height: '2px' });
    v.src = STATE.media.url;
    v.playsInline = true;
    document.body.appendChild(v);
    await new Promise(r => { v.onloadedmetadata = r; });

    const W = STATE.media.width, H = STATE.media.height;
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d');

    const actx = new AudioContext();
    const dest = actx.createMediaStreamDestination();

    // 1. Audio video gốc (nếu có âm lượng)
    const origVol = (Number($('#dub-vol-orig')?.value) || 0) / 100;
    if (origVol > 0.01) {
      const origSrc = actx.createMediaElementSource(v);
      const origGain = actx.createGain();
      origGain.gain.value = origVol;
      origSrc.connect(origGain);
      origGain.connect(dest);
    }

    // 2. Audio giọng lồng tiếng
    const dubVol = (Number($('#dub-vol-dub')?.value) || 100) / 100;
    const dubAudioEl = new Audio(STATE.renderedWavUrl);
    const dubSrc = actx.createMediaElementSource(dubAudioEl);
    const dubGain = actx.createGain();
    dubGain.gain.value = dubVol;
    dubSrc.connect(dubGain);
    dubGain.connect(dest);

    const stream = new MediaStream([
      ...canvas.captureStream(30).getVideoTracks(),
      ...dest.stream.getAudioTracks()
    ]);

    const rec = new MediaRecorder(stream, {
      mimeType: mime || undefined,
      videoBitsPerSecond: H >= 1080 ? 8000000 : 5000000,
      audioBitsPerSecond: 192000
    });

    const chunks = [];
    rec.ondataavailable = e => e.data.size && chunks.push(e.data);

    let stopped = false;
    const frame = () => {
      if (stopped) return;
      ctx.drawImage(v, 0, 0, W, H);
      const cur = v.currentTime;
      const activeCue = STATE.cues.find(cu => cur >= cu.start && cur < cu.end);
      if (activeCue && activeCue.text) {
        drawCapCutSub(ctx, W, H, activeCue.text);
      }
      const pct = Math.min(100, Math.round(cur / v.duration * 100));
      setHud(`Đang xuất video… ${clock(cur)} / ${clock(v.duration)} (${pct}%)`, pct);
      v.requestVideoFrameCallback ? v.requestVideoFrameCallback(frame) : requestAnimationFrame(frame);
    };

    const done = new Promise(resolve => { rec.onstop = resolve; });

    try {
      await actx.resume();
      rec.start(1000);
      frame();
      await v.play();
      await dubAudioEl.play();
      await new Promise(r => { v.onended = r; });
      stopped = true;
      rec.stop();
      await done;

      const type = (mime || 'video/webm').split(';')[0];
      const ext = type === 'video/mp4' ? 'mp4' : 'webm';
      const outBlob = new Blob(chunks, { type });
      const baseName = (STATE.media.name || 'video').replace(/\.[^.]+$/, '');
      downloadFile(`${baseName}-long-tieng.${ext}`, outBlob, type);

      setHud(null);
      toast(`Đã xuất video lồng tiếng thành công (${ext.toUpperCase()})!`, 'ok');
    } catch (err) {
      setHud(null);
      toast('Xuất video thất bại: ' + err.message, 'err');
    } finally {
      stopped = true;
      actx.close();
      v.remove();
      dubAudioEl.remove();
    }
  }

  /* ---------------- Xuất Audio Lồng Tiếng (.WAV) ---------------- */
  async function exportDubAudio() {
    if (!STATE.renderedWavBlob) {
      const ok = await stepSynthesize();
      if (!ok) return;
    }
    const baseName = (STATE.media?.name || 'audio').replace(/\.[^.]+$/, '');
    downloadFile(`${baseName}-long-tieng.wav`, STATE.renderedWavBlob, 'audio/wav');
    toast('Đã tải xuống tệp âm thanh lồng tiếng (.WAV 48kHz).', 'ok');
  }

  /* ---------------- Xuất Phụ Đề (.SRT Song Ngữ) ---------------- */
  function exportSubtitles() {
    if (!STATE.cues || !STATE.cues.length) return toast('Chưa có phụ đề để xuất.', 'err');
    const srt = STATE.cues.map((c, i) => {
      return `${i + 1}\n${fmtSrtTime(c.start)} --> ${fmtSrtTime(c.end)}\n${c.text}\n`;
    }).join('\n');

    const baseName = (STATE.media?.name || 'video').replace(/\.[^.]+$/, '');
    downloadFile(`${baseName}-phu-de.srt`, new Blob([srt], { type: 'application/x-subrip' }), 'text/plain');
    toast('Đã tải xuống file phụ đề (.SRT).', 'ok');
  }

  /* ---------------- Tiện Ích Trợ Giúp ---------------- */
  function setStep(num) {
    STATE.step = num;
    $$('.studio-step-item').forEach(el => {
      const s = Number(el.dataset.step);
      el.classList.toggle('active', s === num);
      el.classList.toggle('done', s < num);
    });
  }

  function setHud(msg, pct = null) {
    const hud = $('#dub-hud');
    if (!hud) return;
    if (!msg) { hud.hidden = true; return; }
    hud.hidden = false;
    $('#dub-hud-msg').textContent = msg;
    if (pct !== null) {
      $('#dub-hud-pct').textContent = Math.round(pct) + '%';
      $('#dub-hud-bar').style.width = Math.min(100, Math.max(0, pct)) + '%';
    }
  }

  function clock(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function fmtSec(sec) {
    sec = Math.max(0, sec || 0);
    const m = Math.floor(sec / 60), s = sec - m * 60;
    return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
  }

  function fmtSrtTime(sec) {
    const ms = Math.max(0, Math.round(sec * 1000));
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
  }

  function downloadFile(name, blob, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    onOpen,
    seekTo,
    updateCueText,
    translateSingleCue,
    synthSingleCue,
    deleteCue
  };
})();

if (typeof window !== 'undefined') window.vkDubbing = vkDubbing;

