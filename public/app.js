// Speech-to-Text Pro Frontend Application
document.addEventListener('DOMContentLoaded', () => {
  // Constants & Limits
  const MAX_FILE_SIZE_BYTES = 30 * 1024 * 1024; // 30 MB
  const MAX_DURATION_SECONDS = 600; // 10 minutes

  // State
  let currentFile = null; // { file, url, name, size, duration, serverPath, serverFilename }
  let activeTab = 'upload';
  let isRecording = false;
  let mediaRecorder = null;
  let audioChunks = [];
  let recordTimerInterval = null;
  let recordStartTime = null;
  let audioContext = null;
  let analyser = null;
  let animFrameId = null;
  let speechRecognizer = null;
  let liveTranscriptAccumulated = '';
  let currentTranscriptData = null; // { text, segments, srt, vtt, model, language }

  // DOM Elements
  const tabUpload = document.getElementById('tab-upload');
  const tabUrl = document.getElementById('tab-url');
  const tabMic = document.getElementById('tab-mic');
  const panelUpload = document.getElementById('panel-upload');
  const panelUrl = document.getElementById('panel-url');
  const panelMic = document.getElementById('panel-mic');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const btnBrowseFile = document.getElementById('btn-browse-file');

  const inputUrl = document.getElementById('input-url');
  const btnPasteUrl = document.getElementById('btn-paste-url');
  const btnFetchUrl = document.getElementById('btn-fetch-url');

  const micVisualizer = document.getElementById('mic-visualizer');
  const micTimer = document.getElementById('mic-timer');
  const micLimitFill = document.getElementById('mic-limit-fill');
  const btnRecordMic = document.getElementById('btn-record-mic');
  const btnPauseMic = document.getElementById('btn-pause-mic');
  const btnStopMic = document.getElementById('btn-stop-mic');
  const micStatusLabel = document.getElementById('mic-status-label');
  const chkLiveSpeech = document.getElementById('chk-live-speech');

  const mediaPreviewCard = document.getElementById('media-preview-card');
  const previewFilename = document.getElementById('preview-filename');
  const previewSize = document.getElementById('preview-size');
  const previewDuration = document.getElementById('preview-duration');
  const previewStatusBadge = document.getElementById('preview-status-badge');
  const btnClearMedia = document.getElementById('btn-clear-media');
  const nativeAudio = document.getElementById('native-audio');

  const btnStartTranscribe = document.getElementById('btn-start-transcribe');
  const selectLanguage = document.getElementById('select-language');
  const selectTimestampMode = document.getElementById('select-timestamp-mode');

  const emptyState = document.getElementById('empty-state');
  const processingState = document.getElementById('processing-state');
  const processingMessage = document.getElementById('processing-message');
  const transcriptDisplayContainer = document.getElementById('transcript-display-container');
  const paragraphView = document.getElementById('paragraph-view');
  const timelineView = document.getElementById('timeline-view');
  const srtView = document.getElementById('srt-view');
  const transcriptPlainText = document.getElementById('transcript-plain-text');
  const transcriptSrtText = document.getElementById('transcript-srt-text');

  const statsPills = document.getElementById('stats-pills');
  const statWords = document.getElementById('stat-words');
  const statChars = document.getElementById('stat-chars');
  const statTime = document.getElementById('stat-time');

  const btnCopyText = document.getElementById('btn-copy-text');
  const btnDownloadMenu = document.getElementById('btn-download-menu');
  const downloadDropdown = document.getElementById('download-dropdown');
  const dlTxt = document.getElementById('dl-txt');
  const dlSrt = document.getElementById('dl-srt');
  const dlVtt = document.getElementById('dl-vtt');
  const dlJson = document.getElementById('dl-json');

  const aiToolsBar = document.getElementById('ai-tools-bar');
  const btnAiSummarize = document.getElementById('btn-ai-summarize');
  const btnAiClean = document.getElementById('btn-ai-clean');
  const btnAiTranslate = document.getElementById('btn-ai-translate');
  const summaryBox = document.getElementById('summary-box');
  const summaryContent = document.getElementById('summary-content');
  const btnCloseSummary = document.getElementById('btn-close-summary');

  // Tunnel & Settings Modals
  const btnPublicTunnel = document.getElementById('btn-public-tunnel');
  const modalTunnel = document.getElementById('modal-tunnel');
  const btnCloseTunnel = document.getElementById('btn-close-tunnel');
  const btnDoneTunnel = document.getElementById('btn-done-tunnel');
  const publicUrlInput = document.getElementById('public-url-input');
  const btnCopyPublicUrl = document.getElementById('btn-copy-public-url');
  const btnOpenPublicUrl = document.getElementById('btn-open-public-url');
  const qrImage = document.getElementById('qr-image');
  const qrLoading = document.getElementById('qr-loading');
  const tunnelStatusText = document.getElementById('tunnel-status-text');
  const btnRestartTunnel = document.getElementById('btn-restart-tunnel');

  const btnOpenSettings = document.getElementById('btn-open-settings');
  const modalSettings = document.getElementById('modal-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const btnCancelSettings = document.getElementById('btn-cancel-settings');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const keyGroq = document.getElementById('key-groq');
  const keyGemini = document.getElementById('key-gemini');
  const keyOpenai = document.getElementById('key-openai');

  // Toast notification helper
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'error') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // Format Helpers
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  let serverHasGroqKey = false;
  let serverHasGeminiKey = false;
  let serverHasOpenAiKey = false;

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  function formatSrtTime(totalSec) {
    if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);
    const ms = Math.floor((totalSec % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  function formatVttTime(totalSec) {
    if (isNaN(totalSec) || totalSec < 0) totalSec = 0;
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = Math.floor(totalSec % 60);
    const ms = Math.floor((totalSec % 1) * 1000);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  // Check Tunnel Status and Server Keys from Server
  async function fetchTunnelStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.hasServerGroqKey) serverHasGroqKey = true;
      if (data.hasServerGeminiKey) serverHasGeminiKey = true;
      if (data.hasServerOpenAiKey) serverHasOpenAiKey = true;

      if (data.publicUrl) {
        tunnelStatusText.textContent = 'Link công khai: Online';
        publicUrlInput.value = data.publicUrl;
        btnOpenPublicUrl.href = data.publicUrl;
        if (data.qrCode) {
          qrImage.src = data.qrCode;
          qrImage.style.display = 'block';
          qrLoading.style.display = 'none';
        }
      } else {
        tunnelStatusText.textContent = 'Khởi tạo Link công khai...';
      }
    } catch (e) {
      console.warn('Status poll error:', e);
    }
  }
  fetchTunnelStatus();
  setInterval(fetchTunnelStatus, 6000);

  // Tab switching
  function switchTab(tabName) {
    activeTab = tabName;
    [tabUpload, tabUrl, tabMic].forEach(t => t.classList.remove('active'));
    [panelUpload, panelUrl, panelMic].forEach(p => p.classList.remove('active'));

    if (tabName === 'upload') {
      tabUpload.classList.add('active');
      panelUpload.classList.add('active');
    } else if (tabName === 'url') {
      tabUrl.classList.add('active');
      panelUrl.classList.add('active');
    } else if (tabName === 'mic') {
      tabMic.classList.add('active');
      panelMic.classList.add('active');
    }
  }

  tabUpload.addEventListener('click', () => switchTab('upload'));
  tabUrl.addEventListener('click', () => switchTab('url'));
  tabMic.addEventListener('click', () => switchTab('mic'));

  // Load Saved API keys from localStorage
  keyGroq.value = localStorage.getItem('apiKey_groq') || '';
  keyGemini.value = localStorage.getItem('apiKey_gemini') || '';
  keyOpenai.value = localStorage.getItem('apiKey_openai') || '';

  // Password visibility toggle
  document.querySelectorAll('.toggle-eye').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.previousElementSibling;
      if (input.type === 'password') {
        input.type = 'text';
        btn.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';
      } else {
        input.type = 'password';
        btn.innerHTML = '<i class="fa-regular fa-eye"></i>';
      }
    });
  });

  // Settings Modal Handlers
  btnOpenSettings.addEventListener('click', () => modalSettings.style.display = 'flex');
  btnCloseSettings.addEventListener('click', () => modalSettings.style.display = 'none');
  btnCancelSettings.addEventListener('click', () => modalSettings.style.display = 'none');
  btnSaveSettings.addEventListener('click', () => {
    localStorage.setItem('apiKey_groq', keyGroq.value.trim());
    localStorage.setItem('apiKey_gemini', keyGemini.value.trim());
    localStorage.setItem('apiKey_openai', keyOpenai.value.trim());
    modalSettings.style.display = 'none';
    showToast('Đã lưu cấu hình API Keys thành công!', 'success');
  });

  // Tunnel Modal Handlers
  btnPublicTunnel.addEventListener('click', () => {
    modalTunnel.style.display = 'flex';
    fetchTunnelStatus();
  });
  btnCloseTunnel.addEventListener('click', () => modalTunnel.style.display = 'none');
  btnDoneTunnel.addEventListener('click', () => modalTunnel.style.display = 'none');
  btnCopyPublicUrl.addEventListener('click', () => {
    if (publicUrlInput.value && publicUrlInput.value.startsWith('http')) {
      navigator.clipboard.writeText(publicUrlInput.value);
      showToast('Đã sao chép Link Công Khai vào Clipboard!', 'success');
    } else {
      showToast('Đường dẫn chưa sẵn sàng, vui lòng đợi vài giây...', 'error');
    }
  });
  btnRestartTunnel.addEventListener('click', async () => {
    try {
      showToast('Đang khởi động lại Cloudflare Tunnel...', 'info');
      await fetch('/api/tunnel/restart', { method: 'POST' });
      qrLoading.style.display = 'flex';
      qrImage.style.display = 'none';
      publicUrlInput.value = 'Đang kết nối lại...';
      setTimeout(fetchTunnelStatus, 4000);
    } catch (e) {
      showToast('Lỗi khởi động lại tunnel', 'error');
    }
  });

  // Validate Audio File (Size <= 30MB, Duration <= 10 min)
  function validateAndSetMedia(file, objectUrl, nameOverride = null) {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(`File vượt quá 30MB (${formatBytes(file.size)}). Giới hạn tối đa là 30MB!`, 'error');
      return false;
    }

    const tempAudio = new Audio();
    tempAudio.preload = 'metadata';
    tempAudio.src = objectUrl;

    tempAudio.onloadedmetadata = () => {
      const duration = tempAudio.duration;
      if (duration > MAX_DURATION_SECONDS) {
        showToast(`Thời lượng file (${formatTime(duration)}) vượt quá giới hạn 10 phút!`, 'error');
        previewStatusBadge.className = 'badge badge-danger';
        previewStatusBadge.textContent = 'Quá 10 phút';
        btnStartTranscribe.disabled = true;
      } else {
        previewStatusBadge.className = 'badge badge-success';
        previewStatusBadge.textContent = 'Hợp lệ';
        btnStartTranscribe.disabled = false;
      }

      currentFile = {
        file: file,
        url: objectUrl,
        name: nameOverride || file.name || 'audio_file',
        size: file.size,
        duration: duration
      };

      // Update UI
      previewFilename.textContent = currentFile.name;
      previewSize.textContent = formatBytes(currentFile.size);
      previewDuration.textContent = formatTime(duration);
      nativeAudio.src = objectUrl;
      mediaPreviewCard.style.display = 'block';

      showToast(`Đã nhận file âm thanh: ${formatTime(duration)} - ${formatBytes(file.size)}`, 'success');
    };

    tempAudio.onerror = () => {
      // Audio codec might still play on server or webm recording
      currentFile = {
        file: file,
        url: objectUrl,
        name: nameOverride || file.name || 'recorded_audio',
        size: file.size,
        duration: 0
      };
      previewFilename.textContent = currentFile.name;
      previewSize.textContent = formatBytes(currentFile.size);
      previewDuration.textContent = 'Đang phân tích';
      previewStatusBadge.className = 'badge badge-success';
      previewStatusBadge.textContent = 'Hợp lệ';
      nativeAudio.src = objectUrl;
      mediaPreviewCard.style.display = 'block';
      btnStartTranscribe.disabled = false;
    };

    return true;
  }

  // Clear Media
  function clearMedia() {
    if (currentFile && currentFile.url && currentFile.url.startsWith('blob:')) {
      URL.revokeObjectURL(currentFile.url);
    }
    currentFile = null;
    mediaPreviewCard.style.display = 'none';
    nativeAudio.pause();
    nativeAudio.src = '';
    btnStartTranscribe.disabled = true;
    fileInput.value = '';
    inputUrl.value = '';
  }
  btnClearMedia.addEventListener('click', clearMedia);

  // File Upload Handlers (Drag & Drop + Browse)
  btnBrowseFile.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('click', (e) => {
    if (e.target !== btnBrowseFile) fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const objectUrl = URL.createObjectURL(file);
      validateAndSetMedia(file, objectUrl);
    }
  });

  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt.files && dt.files[0]) {
      const file = dt.files[0];
      const objectUrl = URL.createObjectURL(file);
      validateAndSetMedia(file, objectUrl);
    }
  });

  // URL Input Handlers
  btnPasteUrl.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        inputUrl.value = text.trim();
        showToast('Đã dán URL từ Clipboard!', 'info');
      }
    } catch (e) {
      showToast('Không thể đọc Clipboard tự động. Vui lòng bấm Ctrl+V để dán.', 'info');
    }
  });

  btnFetchUrl.addEventListener('click', async () => {
    const url = inputUrl.value.trim();
    if (!url) {
      showToast('Vui lòng nhập đường dẫn URL hợp lệ.', 'error');
      return;
    }

    try {
      btnFetchUrl.disabled = true;
      btnFetchUrl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải file từ URL...';

      const response = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Lỗi khi tải file từ URL');
      }

      // Successful fetch from server
      const serverFileUrl = data.url;
      const fileBlob = await (await fetch(serverFileUrl)).blob();
      const clientUrl = URL.createObjectURL(fileBlob);

      validateAndSetMedia(fileBlob, clientUrl, data.originalName);
      if (currentFile) {
        currentFile.serverPath = data.filepath;
        currentFile.serverFilename = data.filename;
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnFetchUrl.disabled = false;
      btnFetchUrl.innerHTML = '<i class="fa-solid fa-cloud-arrow-down"></i> Tải & Phân Tích Âm Thanh';
    }
  });

  // Microphone Live Recording & Visualizer
  function setupVisualizer(stream) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 64;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const canvas = micVisualizer;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = 100;

    function draw() {
      animFrameId = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = (canvas.width / bufferLength) * 1.8;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const barHeight = (dataArray[i] / 255) * canvas.height * 0.9;
        const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
        grad.addColorStop(0, '#6366f1');
        grad.addColorStop(1, '#06b6d4');
        ctx.fillStyle = grad;
        ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
        x += barWidth;
      }
    }
    draw();
  }

  // Setup Live Speech Recognition (Web Speech API)
  function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported on this browser');
      return null;
    }
    const recognizer = new SpeechRecognition();
    recognizer.continuous = true;
    recognizer.interimResults = true;
    recognizer.lang = selectLanguage.value === 'auto' ? 'vi-VN' : (selectLanguage.value === 'en' ? 'en-US' : selectLanguage.value);

    recognizer.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          liveTranscriptAccumulated += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      // If user enabled live captions, stream directly into transcript box!
      if (chkLiveSpeech.checked) {
        emptyState.style.display = 'none';
        transcriptDisplayContainer.style.display = 'block';
        transcriptPlainText.textContent = liveTranscriptAccumulated + interim;
        updateStats(transcriptPlainText.textContent);
      }
    };

    return recognizer;
  }

  btnRecordMic.addEventListener('click', async () => {
    if (!isRecording) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        liveTranscriptAccumulated = '';

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(audioChunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(blob);
          validateAndSetMedia(blob, url, `record_${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.webm`);

          // Stop visualizer
          if (animFrameId) cancelAnimationFrame(animFrameId);
          if (audioContext) audioContext.close();
          stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start(250);
        isRecording = true;
        recordStartTime = Date.now();

        // Start live recognition if enabled
        if (chkLiveSpeech.checked) {
          speechRecognizer = initSpeechRecognition();
          if (speechRecognizer) {
            try { speechRecognizer.start(); } catch (e) {}
          }
        }

        // Setup visualizer
        setupVisualizer(stream);

        // Update UI
        btnRecordMic.classList.add('recording');
        btnRecordMic.title = 'Đang thu âm...';
        btnPauseMic.style.display = 'flex';
        btnStopMic.style.display = 'flex';
        micStatusLabel.textContent = 'Đang thu âm... Hãy nói vào micro';
        micStatusLabel.style.color = '#f43f5e';

        // Timer counter
        recordTimerInterval = setInterval(() => {
          const elapsedSec = Math.floor((Date.now() - recordStartTime) / 1000);
          micTimer.textContent = formatTime(elapsedSec);
          const percent = (elapsedSec / MAX_DURATION_SECONDS) * 100;
          micLimitFill.style.width = Math.min(percent, 100) + '%';

          // Auto stop when reaching 10 minutes limit
          if (elapsedSec >= MAX_DURATION_SECONDS) {
            showToast('Đã đạt giới hạn tối đa 10 phút. Tự động dừng thu âm.', 'info');
            btnStopMic.click();
          }
        }, 1000);

      } catch (err) {
        showToast('Không thể truy cập Microphone: ' + err.message, 'error');
      }
    } else {
      // Already recording -> stop
      btnStopMic.click();
    }
  });

  btnPauseMic.addEventListener('click', () => {
    if (mediaRecorder && isRecording) {
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.pause();
        btnPauseMic.innerHTML = '<i class="fa-solid fa-play"></i>';
        micStatusLabel.textContent = 'Đã tạm dừng thu âm';
      } else if (mediaRecorder.state === 'paused') {
        mediaRecorder.resume();
        btnPauseMic.innerHTML = '<i class="fa-solid fa-pause"></i>';
        micStatusLabel.textContent = 'Đang thu âm...';
      }
    }
  });

  btnStopMic.addEventListener('click', () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      isRecording = false;
      clearInterval(recordTimerInterval);

      if (speechRecognizer) {
        try { speechRecognizer.stop(); } catch (e) {}
      }

      btnRecordMic.classList.remove('recording');
      btnPauseMic.style.display = 'none';
      btnStopMic.style.display = 'none';
      micStatusLabel.textContent = 'Đã hoàn tất thu âm! Nhấn Bắt đầu chuyển đổi.';
      micStatusLabel.style.color = '#10b981';
      micTimer.textContent = '00:00';
      micLimitFill.style.width = '0%';
    }
  });

  // Model Selection Styling
  document.querySelectorAll('.model-card input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.model-card').forEach(card => card.classList.remove('active'));
      radio.closest('.model-card').classList.add('active');
    });
  });

  // Display Mode switcher
  selectTimestampMode.addEventListener('change', () => {
    updateTranscriptDisplay();
  });

  function updateTranscriptDisplay() {
    if (!currentTranscriptData) return;
    const mode = selectTimestampMode.value;

    paragraphView.style.display = 'none';
    timelineView.style.display = 'none';
    srtView.style.display = 'none';

    if (mode === 'paragraph') {
      paragraphView.style.display = 'block';
      transcriptPlainText.textContent = currentTranscriptData.text || '';
    } else if (mode === 'subtitles') {
      timelineView.style.display = 'flex';
      renderTimelineView(currentTranscriptData.segments || []);
    } else if (mode === 'srt') {
      srtView.style.display = 'block';
      transcriptSrtText.textContent = currentTranscriptData.srt || currentTranscriptData.text || '';
    }
  }

  // Render Timeline Segments with Interactive Click-to-Seek
  function renderTimelineView(segments) {
    timelineView.innerHTML = '';
    if (!segments || segments.length === 0) {
      timelineView.innerHTML = `<p class="text-dim">Không có dữ liệu mốc thời gian chi tiết.</p>`;
      return;
    }

    segments.forEach(seg => {
      const item = document.createElement('div');
      item.className = 'segment-item';
      item.title = `Nhấn để nghe từ ${seg.startFormatted || formatTime(seg.start)}`;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'segment-time';
      timeSpan.textContent = `[${seg.startFormatted ? seg.startFormatted.split(',')[0] : formatTime(seg.start)}]`;

      const textSpan = document.createElement('span');
      textSpan.className = 'segment-text';
      if (seg.speaker) {
        textSpan.innerHTML = `<strong>${seg.speaker}:</strong> ${seg.text}`;
      } else {
        textSpan.textContent = seg.text;
      }

      item.appendChild(timeSpan);
      item.appendChild(textSpan);

      // Click to jump audio player
      item.addEventListener('click', () => {
        nativeAudio.currentTime = seg.start;
        nativeAudio.play();
      });

      timelineView.appendChild(item);
    });
  }

  // Update Stats Counter
  function updateStats(text, durationSec = null) {
    if (!text) {
      statsPills.style.display = 'none';
      return;
    }
    statsPills.style.display = 'flex';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const chars = text.length;
    statWords.textContent = `${words} từ`;
    statChars.textContent = `${chars} ký tự`;
    if (durationSec) {
      statTime.textContent = `${durationSec.toFixed(1)}s`;
    }
  }

  // Start Transcribe Execution
  btnStartTranscribe.addEventListener('click', async () => {
    if (!currentFile) {
      showToast('Vui lòng chọn hoặc thu âm file âm thanh trước.', 'error');
      return;
    }

    const selectedModel = document.querySelector('input[name="aiModel"]:checked').value;
    const groqKey = localStorage.getItem('apiKey_groq') || '';
    const geminiKey = localStorage.getItem('apiKey_gemini') || '';
    const openaiKey = localStorage.getItem('apiKey_openai') || '';

    // Check if API key is needed
    if ((selectedModel === 'whisper-groq' || selectedModel === 'capcut-ai') && !groqKey && !serverHasGroqKey) {
      modalSettings.style.display = 'flex';
      showToast('Chưa có Groq API Key. Bạn có thể nhập Key hoặc chọn "Web Speech Local AI" để dùng miễn phí không cần Key!', 'info');
      return;
    }
    if (selectedModel === 'gemini-flash' && !geminiKey && !serverHasGeminiKey) {
      modalSettings.style.display = 'flex';
      showToast('Chưa có Gemini API Key. Bạn có thể nhập Key hoặc chọn "Web Speech Local AI" để dùng miễn phí không cần Key!', 'info');
      return;
    }
    if (selectedModel === 'whisper-openai' && !openaiKey && !serverHasOpenAiKey) {
      modalSettings.style.display = 'flex';
      showToast('Chưa có OpenAI API Key. Bạn có thể nhập Key hoặc chọn "Web Speech Local AI" để dùng miễn phí không cần Key!', 'info');
      return;
    }

    // Helper: Finish and render local speech transcription
    function finishLocalTranscription(fullText, segments = []) {
      if (!segments || segments.length === 0) {
        const sentences = (fullText || '').split(/(?<=[.?!,])\s+/).filter(s => s.trim().length > 0);
        let curTime = 0;
        const duration = currentFile?.duration || 60;
        const timePerSentence = Math.max(2, duration / Math.max(1, sentences.length));
        segments = sentences.map((sent, idx) => ({
          id: idx + 1,
          start: curTime,
          end: (curTime += timePerSentence),
          text: sent.trim(),
          startFormatted: formatSrtTime(curTime - timePerSentence),
          endFormatted: formatSrtTime(curTime)
        }));
      }

      let srtContent = '';
      let vttContent = 'WEBVTT\n\n';
      segments.forEach((seg, idx) => {
        srtContent += `${idx + 1}\n${seg.startFormatted || formatSrtTime(seg.start)} --> ${seg.endFormatted || formatSrtTime(seg.end)}\n${seg.text}\n\n`;
        vttContent += `${idx + 1}\n${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n${seg.text}\n\n`;
      });

      currentTranscriptData = {
        model: 'Web Speech Native AI (Offline / Local)',
        language: selectLanguage.value === 'auto' ? 'vi' : selectLanguage.value,
        text: fullText || 'Không phát hiện được giọng nói trong đoạn âm thanh.',
        segments: segments,
        srt: srtContent.trim(),
        vtt: vttContent.trim()
      };

      processingState.style.display = 'none';
      emptyState.style.display = 'none';
      transcriptDisplayContainer.style.display = 'block';
      aiToolsBar.style.display = 'flex';
      btnStartTranscribe.disabled = false;

      updateTranscriptDisplay();
      updateStats(currentTranscriptData.text, currentFile?.duration);
      showToast('Chuyển đổi thành công bằng Web Speech Local AI!', 'success');
    }

    // 0. LOCAL WEB SPEECH MODEL (NO API KEY REQUIRED)
    if (selectedModel === 'local-speech') {
      emptyState.style.display = 'none';
      summaryBox.style.display = 'none';
      transcriptDisplayContainer.style.display = 'none';
      processingState.style.display = 'block';
      processingMessage.textContent = 'Đang nhận diện giọng nói bằng Web Speech AI (Không Cần Key)...';
      btnStartTranscribe.disabled = true;

      // If user recorded with mic and already has text accumulated
      if (liveTranscriptAccumulated && liveTranscriptAccumulated.trim().length > 0) {
        finishLocalTranscription(liveTranscriptAccumulated);
        return;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        processingState.style.display = 'none';
        btnStartTranscribe.disabled = false;
        showToast('Trình duyệt chưa hỗ trợ Web Speech. Vui lòng mở bằng Chrome, Edge hoặc Cốc Cốc, hoặc nhập Groq API Key miễn phí!', 'error');
        modalSettings.style.display = 'flex';
        return;
      }

      const recognizer = new SpeechRecognition();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      const langChoice = selectLanguage.value;
      recognizer.lang = (langChoice === 'auto' || langChoice === 'vi') ? 'vi-VN' : (langChoice === 'en' ? 'en-US' : langChoice);

      let accumulatedText = '';
      let segments = [];
      const startTime = Date.now();

      recognizer.onresult = (event) => {
        let currentInterim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            accumulatedText += (accumulatedText ? ' ' : '') + transcript.trim();
            const segSec = (Date.now() - startTime) / 1000;
            segments.push({
              id: segments.length + 1,
              start: Math.max(0, segSec - 2.5),
              end: segSec,
              text: transcript.trim(),
              startFormatted: formatSrtTime(Math.max(0, segSec - 2.5)),
              endFormatted: formatSrtTime(segSec)
            });
          } else {
            currentInterim += transcript;
          }
        }
        processingMessage.textContent = 'Đang nghe nhận diện: ' + (currentInterim || accumulatedText.slice(-60));
      };

      recognizer.onerror = (e) => {
        console.warn('[Web Speech Recognizer Error]', e);
      };

      recognizer.onend = () => {
        finishLocalTranscription(accumulatedText, segments);
      };

      try {
        nativeAudio.currentTime = 0;
        await nativeAudio.play();
        recognizer.start();

        nativeAudio.onended = () => {
          try { recognizer.stop(); } catch (e) {}
        };
      } catch (err) {
        try { recognizer.start(); } catch (e) {}
        showToast('Đang lắng nghe nhận diện từ Micro trực tiếp...', 'info');
      }

      return;
    }

    // Prepare upload to server if not already on server
    emptyState.style.display = 'none';
    summaryBox.style.display = 'none';
    transcriptDisplayContainer.style.display = 'none';
    processingState.style.display = 'block';
    processingMessage.textContent = 'Đang tải file và khởi chạy AI Model...';
    btnStartTranscribe.disabled = true;

    try {
      let serverPath = currentFile.serverPath;
      let serverFilename = currentFile.serverFilename;

      if (!serverPath) {
        processingMessage.textContent = 'Đang truyền file âm thanh lên máy chủ...';
        const formData = new FormData();
        formData.append('audioFile', currentFile.file, currentFile.name);

        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });

        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || 'Lỗi tải file lên máy chủ');
        }

        serverPath = uploadData.filepath;
        serverFilename = uploadData.filename;
        currentFile.serverPath = serverPath;
        currentFile.serverFilename = serverFilename;
      }

      // Execute Transcribe
      processingMessage.textContent = `Đang nhận diện giọng nói bằng ${selectedModel.toUpperCase()}...`;

      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filepath: serverPath,
          filename: serverFilename,
          model: selectedModel,
          language: selectLanguage.value,
          duration: currentFile.duration,
          groqApiKey: groqKey,
          geminiApiKey: geminiKey,
          openAiApiKey: openaiKey
        })
      });

      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) {
        if (transcribeData.needApiKey) {
          modalSettings.style.display = 'flex';
        }
        throw new Error(transcribeData.error || 'Lỗi xử lý âm thanh');
      }

      const resData = transcribeData.data;
      currentTranscriptData = resData;

      // Update Transcript View
      processingState.style.display = 'none';
      transcriptDisplayContainer.style.display = 'block';
      aiToolsBar.style.display = 'flex';

      updateTranscriptDisplay();
      updateStats(resData.text, resData.duration);

      // Show summary if provided by Gemini
      if (resData.summary) {
        summaryContent.textContent = resData.summary;
        summaryBox.style.display = 'block';
      }

      showToast('Hoàn tất chuyển đổi giọng nói thành văn bản thành công!', 'success');

    } catch (err) {
      processingState.style.display = 'none';
      emptyState.style.display = 'block';
      showToast(err.message, 'error');
    } finally {
      btnStartTranscribe.disabled = false;
    }
  });

  // Copy Full Transcript
  btnCopyText.addEventListener('click', () => {
    if (!currentTranscriptData || !currentTranscriptData.text) {
      showToast('Chưa có nội dung văn bản để sao chép.', 'info');
      return;
    }
    const mode = selectTimestampMode.value;
    let textToCopy = currentTranscriptData.text;
    if (mode === 'srt' && currentTranscriptData.srt) textToCopy = currentTranscriptData.srt;

    navigator.clipboard.writeText(textToCopy);
    showToast('Đã sao chép văn bản vào Clipboard!', 'success');
  });

  // Download Dropdown Handler
  btnDownloadMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    downloadDropdown.classList.toggle('active');
  });
  document.addEventListener('click', () => downloadDropdown.classList.remove('active'));

  function triggerDownload(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Đã tải xuống file: ${filename}`, 'success');
  }

  dlTxt.addEventListener('click', () => {
    if (!currentTranscriptData) return;
    const baseName = currentFile?.name?.replace(/\.[^/.]+$/, '') || 'transcript';
    triggerDownload(currentTranscriptData.text, `${baseName}.txt`, 'text/plain;charset=utf-8');
  });

  dlSrt.addEventListener('click', () => {
    if (!currentTranscriptData) return;
    const baseName = currentFile?.name?.replace(/\.[^/.]+$/, '') || 'subtitles';
    triggerDownload(currentTranscriptData.srt || currentTranscriptData.text, `${baseName}.srt`, 'text/plain;charset=utf-8');
  });

  dlVtt.addEventListener('click', () => {
    if (!currentTranscriptData) return;
    const baseName = currentFile?.name?.replace(/\.[^/.]+$/, '') || 'subtitles';
    triggerDownload(currentTranscriptData.vtt || currentTranscriptData.text, `${baseName}.vtt`, 'text/vtt;charset=utf-8');
  });

  dlJson.addEventListener('click', () => {
    if (!currentTranscriptData) return;
    const baseName = currentFile?.name?.replace(/\.[^/.]+$/, '') || 'transcript';
    triggerDownload(JSON.stringify(currentTranscriptData, null, 2), `${baseName}.json`, 'application/json');
  });

  // AI Assist: Summarize, Clean, Translate
  async function callAiAssist(action, targetLang = 'Vietnamese') {
    if (!currentTranscriptData || !currentTranscriptData.text) {
      showToast('Cần có nội dung văn bản trước khi dùng AI.', 'info');
      return;
    }

    const groqKey = localStorage.getItem('apiKey_groq') || '';
    const geminiKey = localStorage.getItem('apiKey_gemini') || '';
    if (!groqKey && !geminiKey) {
      modalSettings.style.display = 'flex';
      showToast('Vui lòng cài đặt Groq hoặc Gemini Key để dùng tính năng AI.', 'info');
      return;
    }

    try {
      showToast(`Đang thực hiện ${action}...`, 'info');
      const res = await fetch('/api/ai-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: currentTranscriptData.text,
          action: action,
          targetLang: targetLang,
          geminiApiKey: geminiKey,
          groqApiKey: groqKey
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Lỗi xử lý AI');

      if (action === 'summarize') {
        summaryContent.textContent = data.result;
        summaryBox.style.display = 'block';
        showToast('Đã tạo tóm tắt nội dung!', 'success');
      } else if (action === 'clean') {
        currentTranscriptData.text = data.result;
        updateTranscriptDisplay();
        showToast('Đã chuẩn hóa và làm sạch văn bản!', 'success');
      } else if (action === 'translate') {
        currentTranscriptData.text = data.result;
        updateTranscriptDisplay();
        showToast(`Đã dịch nội dung sang ${targetLang}!`, 'success');
      }
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  btnAiSummarize.addEventListener('click', () => callAiAssist('summarize'));
  btnAiClean.addEventListener('click', () => callAiAssist('clean'));
  btnAiTranslate.addEventListener('click', () => {
    const lang = prompt('Nhập ngôn ngữ muốn dịch sang (ví dụ: Tiếng Việt, Tiếng Anh, Tiếng Nhật, Tiếng Trung):', 'Tiếng Việt');
    if (lang) callAiAssist('translate', lang);
  });
  btnCloseSummary.addEventListener('click', () => summaryBox.style.display = 'none');

});
