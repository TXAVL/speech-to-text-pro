require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const QRCode = require('qrcode');
const FormData = require('form-data');

const app = express();
const PORT = process.env.PORT || 3000;

// Maximum limits specified by user: 30MB and 10 minutes
const MAX_FILE_SIZE = 30 * 1024 * 1024; // 30 MB
const MAX_DURATION_SECONDS = 600; // 10 minutes (600 seconds)

// Storage setup for uploaded and fetched audio files
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Automatic cleanup routine: deletes files older than 2 hours to save server disk space
function cleanupOldUploads() {
  try {
    if (!fs.existsSync(uploadDir)) return;
    const now = Date.now();
    const maxAgeMs = 2 * 60 * 60 * 1000; // 2 hours
    const files = fs.readdirSync(uploadDir);
    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (now - stats.mtimeMs > maxAgeMs) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {}
    }
  } catch (err) {
    console.error('[Cleanup Error]', err.message);
  }
}
cleanupOldUploads();
setInterval(cleanupOldUploads, 30 * 60 * 1000); // Check every 30 mins

// Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.mp3';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'audio-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE }
});

app.use(cors());
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// Health check endpoint for host ping / keep-alive (e.g. Render, Railway)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: Math.round(process.uptime()), timestamp: new Date().toISOString() });
});

// Store active tunnel URL
let publicTunnelUrl = null;
let tunnelProcess = null;
let tunnelQrCode = null;

// Start Cloudflare Tunnel (Cross-platform support: Windows, Linux, Docker)
function startCloudflareTunnel() {
  if (process.env.DISABLE_TUNNEL === 'true') {
    console.log('[Tunnel] Cloudflare tunnel disabled via DISABLE_TUNNEL=true');
    return;
  }

  let cloudflaredExecutable = null;
  const localExe = path.join(__dirname, 'cloudflared.exe');
  const localBin = path.join(__dirname, 'cloudflared');

  if (process.platform === 'win32' && fs.existsSync(localExe)) {
    cloudflaredExecutable = localExe;
  } else if (fs.existsSync(localBin)) {
    cloudflaredExecutable = localBin;
  } else {
    // If not in project root, attempt system command
    cloudflaredExecutable = 'cloudflared';
  }

  console.log('[Tunnel] Starting Cloudflare Tunnel using:', cloudflaredExecutable);
  try {
    tunnelProcess = spawn(cloudflaredExecutable, ['tunnel', '--url', `http://127.0.0.1:${PORT}`], {
      windowsHide: true
    });

    const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

    const handleOutput = async (data) => {
      const text = data.toString();
      const match = text.match(urlRegex);
      if (match && !publicTunnelUrl) {
        publicTunnelUrl = match[0];
        console.log('\n======================================================');
        console.log('🚀 PUBLIC TUNNEL READY!');
        console.log(`🌐 Public URL: ${publicTunnelUrl}`);
        console.log('======================================================\n');
        try {
          tunnelQrCode = await QRCode.toDataURL(publicTunnelUrl);
        } catch (e) {
          console.error('[Tunnel QR Error]', e);
        }
      }
    };

    tunnelProcess.stderr.on('data', handleOutput);
    tunnelProcess.stdout.on('data', handleOutput);

    tunnelProcess.on('error', (err) => {
      console.error('[Tunnel Error]', err.message);
    });

    tunnelProcess.on('close', (code) => {
      console.log(`[Tunnel] exited with code ${code}`);
      publicTunnelUrl = null;
      tunnelQrCode = null;
    });
  } catch (err) {
    console.error('[Tunnel Launch Failed]', err);
  }
}

// System Status & Tunnel URL endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    port: PORT,
    publicUrl: publicTunnelUrl,
    qrCode: tunnelQrCode,
    maxFileSizeMB: 30,
    maxDurationMinutes: 10,
    hasServerGroqKey: !!(process.env.GROQ_API_KEY && process.env.GROQ_API_KEY.trim()),
    hasServerGeminiKey: !!(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
    hasServerOpenAiKey: !!(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim())
  });
});

// Restart or Get Tunnel endpoint
app.post('/api/tunnel/restart', (req, res) => {
  if (tunnelProcess) {
    try { tunnelProcess.kill(); } catch (e) {}
    tunnelProcess = null;
    publicTunnelUrl = null;
    tunnelQrCode = null;
  }
  startCloudflareTunnel();
  res.json({ message: 'Tunnel restarting...' });
});

// Upload audio/video file endpoint
app.post('/api/upload', (req, res) => {
  upload.single('audioFile')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Dung lượng file vượt quá giới hạn 30MB.' });
      }
      return res.status(400).json({ error: err.message });
    } else if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Vui lòng chọn hoặc kéo thả file âm thanh.' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
      filepath: req.file.path
    });
  });
});

// Fetch audio from URL endpoint
app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'URL không được để trống.' });
  }

  try {
    const headRes = await axios.head(url, { timeout: 10000 }).catch(() => null);
    if (headRes && headRes.headers['content-length']) {
      const contentLength = parseInt(headRes.headers['content-length'], 10);
      if (contentLength > MAX_FILE_SIZE) {
        return res.status(400).json({
          error: `File tại URL quá lớn (${(contentLength / (1024 * 1024)).toFixed(1)}MB). Giới hạn tối đa là 30MB.`
        });
      }
    }

    const response = await axios({
      method: 'GET',
      url: url,
      responseType: 'stream',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    let downloadedBytes = 0;
    const ext = path.extname(new URL(url).pathname) || '.mp3';
    const filename = `url-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    const filepath = path.join(uploadDir, filename);
    const writer = fs.createWriteStream(filepath);

    response.data.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (downloadedBytes > MAX_FILE_SIZE) {
        writer.destroy();
        fs.unlink(filepath, () => {});
        return res.status(400).json({
          error: 'File từ URL vượt quá giới hạn 30MB trong quá trình tải xuống.'
        });
      }
    });

    response.data.pipe(writer);

    writer.on('finish', () => {
      res.json({
        success: true,
        filename: filename,
        originalName: path.basename(new URL(url).pathname) || 'audio_from_url',
        size: downloadedBytes,
        url: `/uploads/${filename}`,
        filepath: filepath
      });
    });

    writer.on('error', (err) => {
      fs.unlink(filepath, () => {});
      res.status(500).json({ error: 'Lỗi ghi file: ' + err.message });
    });
  } catch (error) {
    console.error('[Fetch URL Error]', error.message);
    res.status(500).json({
      error: 'Không thể tải file từ URL này. Đảm bảo URL có quyền truy cập trực tiếp file audio/video: ' + error.message
    });
  }
});

// Helper: Format seconds to SRT timestamp 00:00:00,000
function formatSrtTime(totalSec) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const ms = Math.floor((totalSec % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

// Helper: Format seconds to VTT timestamp 00:00:00.000
function formatVttTime(totalSec) {
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = Math.floor(totalSec % 60);
  const ms = Math.floor((totalSec % 1) * 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

// Transcribe Endpoint
app.post('/api/transcribe', async (req, res) => {
  const {
    filepath,
    filename,
    model = 'whisper-groq', // whisper-groq, gemini-flash, capcut-ai, whisper-openai
    language = 'auto',
    groqApiKey,
    geminiApiKey,
    openAiApiKey,
    prompt,
    duration
  } = req.body;

  let targetFilepath = filepath;
  if (!targetFilepath && filename) {
    targetFilepath = path.join(uploadDir, filename);
  }

  if (!targetFilepath || !fs.existsSync(targetFilepath)) {
    return res.status(400).json({ error: 'File âm thanh không tồn tại trên máy chủ.' });
  }

  // Check file size limit
  const stats = fs.statSync(targetFilepath);
  if (stats.size > MAX_FILE_SIZE) {
    return res.status(400).json({ error: 'File vượt quá giới hạn 30MB.' });
  }

  // Duration check if reported from frontend
  if (duration && duration > MAX_DURATION_SECONDS) {
    return res.status(400).json({
      error: `Thời lượng âm thanh (${Math.round(duration)}s) vượt quá giới hạn 10 phút (600s).`
    });
  }

  try {
    let result = null;

    // 1. GROQ WHISPER LARGE V3 (Turbo & Standard)
    if (model === 'whisper-groq' || model === 'whisper-large-v3-turbo') {
      const apiKey = groqApiKey || process.env.GROQ_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          needApiKey: true,
          provider: 'groq',
          error: 'Vui lòng nhập Groq API Key trong Cài đặt (Miễn phí 100% tại console.groq.com) để sử dụng Whisper Large v3 siêu tốc!'
        });
      }

      const form = new FormData();
      form.append('file', fs.createReadStream(targetFilepath));
      form.append('model', model === 'whisper-large-v3-turbo' ? 'whisper-large-v3-turbo' : 'whisper-large-v3');
      form.append('response_format', 'verbose_json');
      if (language && language !== 'auto') {
        form.append('language', language);
      }
      if (prompt) {
        form.append('prompt', prompt);
      }

      const groqRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 120000
      });

      const data = groqRes.data;
      const segments = (data.segments || []).map((seg, idx) => ({
        id: idx + 1,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        startFormatted: formatSrtTime(seg.start),
        endFormatted: formatSrtTime(seg.end)
      }));

      result = {
        model: data.model || 'Whisper Large v3 (Groq)',
        language: data.language || language,
        duration: data.duration,
        text: data.text,
        segments: segments
      };
    }

    // 2. GOOGLE GEMINI 2.0 / 1.5 FLASH AUDIO
    else if (model === 'gemini-flash' || model === 'gemini-2.0-flash') {
      const apiKey = geminiApiKey || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          needApiKey: true,
          provider: 'gemini',
          error: 'Vui lòng nhập Gemini API Key trong Cài đặt (Miễn phí tại aistudio.google.com) để sử dụng Gemini Audio AI!'
        });
      }

      // Convert audio file to Base64 (suitable for <=30MB files)
      const audioBuffer = fs.readFileSync(targetFilepath);
      const base64Audio = audioBuffer.toString('base64');
      const ext = path.extname(targetFilepath).toLowerCase();
      let mimeType = 'audio/mp3';
      if (ext === '.wav') mimeType = 'audio/wav';
      else if (ext === '.m4a') mimeType = 'audio/m4a';
      else if (ext === '.ogg') mimeType = 'audio/ogg';
      else if (ext === '.flac') mimeType = 'audio/flac';
      else if (ext === '.webm') mimeType = 'audio/webm';

      const promptInstructions = `You are an expert multilingual speech-to-text transcriber. 
Transcribe the following audio accurately in its spoken language (including Vietnamese, English, or any language).
Return a valid JSON object matching this structure:
{
  "detected_language": "vi / en / zh / etc",
  "full_transcript": "complete accurate transcript here",
  "segments": [
    {
      "start": 0.0,
      "end": 2.5,
      "speaker": "Speaker 1",
      "text": "sentence text"
    }
  ],
  "summary": "Short 2-3 sentence overview of what was said"
}
Output ONLY the JSON object without markdown fences or extra text.`;

      const geminiRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          contents: [
            {
              parts: [
                { text: promptInstructions },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Audio
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            response_mime_type: "application/json"
          }
        },
        { timeout: 120000 }
      );

      const candidate = geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      let parsed = {};
      try {
        parsed = JSON.parse(candidate);
      } catch (e) {
        // Fallback if parsing fails
        parsed = {
          full_transcript: candidate,
          segments: [],
          detected_language: language
        };
      }

      const segments = (parsed.segments || []).map((seg, idx) => ({
        id: idx + 1,
        start: seg.start || 0,
        end: seg.end || 0,
        speaker: seg.speaker || '',
        text: seg.text || '',
        startFormatted: formatSrtTime(seg.start || 0),
        endFormatted: formatSrtTime(seg.end || 0)
      }));

      result = {
        model: 'Google Gemini 2.0 Flash Audio',
        language: parsed.detected_language || language,
        text: parsed.full_transcript || candidate,
        summary: parsed.summary || '',
        segments: segments
      };
    }

    // 3. CAPCUT AI SUBTITLE ENGINE & CHUNKING
    else if (model === 'capcut-ai') {
      // CapCut Subtitle Algorithm: parses speech, performs timecode chunking, and produces CapCut/JianYing draft compatible subtitle JSON
      // If Groq key is present, use Whisper Large for highest fidelity then apply CapCut styling
      const apiKey = groqApiKey || process.env.GROQ_API_KEY;
      if (apiKey) {
        const form = new FormData();
        form.append('file', fs.createReadStream(targetFilepath));
        form.append('model', 'whisper-large-v3-turbo');
        form.append('response_format', 'verbose_json');
        if (language && language !== 'auto') form.append('language', language);

        const groqRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', form, {
          headers: { ...form.getHeaders(), 'Authorization': `Bearer ${apiKey}` },
          timeout: 120000
        });
        const data = groqRes.data;

        // Break segments into CapCut short punchy subtitle lines (ideal for video captions, TikTok/Reels)
        const capcutSegments = [];
        let segCount = 1;
        (data.segments || []).forEach(seg => {
          const words = seg.text.trim().split(/\s+/);
          if (words.length <= 8) {
            capcutSegments.push({
              id: segCount++,
              start: seg.start,
              end: seg.end,
              text: seg.text.trim(),
              startFormatted: formatSrtTime(seg.start),
              endFormatted: formatSrtTime(seg.end)
            });
          } else {
            // Split into 2 chunks for natural reading rhythm in CapCut
            const mid = Math.ceil(words.length / 2);
            const part1 = words.slice(0, mid).join(' ');
            const part2 = words.slice(mid).join(' ');
            const midTime = seg.start + (seg.end - seg.start) / 2;
            capcutSegments.push({
              id: segCount++,
              start: seg.start,
              end: midTime,
              text: part1,
              startFormatted: formatSrtTime(seg.start),
              endFormatted: formatSrtTime(midTime)
            });
            capcutSegments.push({
              id: segCount++,
              start: midTime,
              end: seg.end,
              text: part2,
              startFormatted: formatSrtTime(midTime),
              endFormatted: formatSrtTime(seg.end)
            });
          }
        });

        result = {
          model: 'CapCut Auto-Captions Engine (AI Optimized)',
          language: data.language || language,
          duration: data.duration,
          text: data.text,
          segments: capcutSegments,
          capcutReady: true
        };
      } else {
        return res.status(400).json({
          needApiKey: true,
          provider: 'groq',
          error: 'Để sử dụng Model CapCut Subtitle AI, vui lòng nhập Groq API Key (Miễn phí) trong Cài đặt.'
        });
      }
    }

    // 4. OPENAI WHISPER-1
    else if (model === 'whisper-openai') {
      const apiKey = openAiApiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({
          needApiKey: true,
          provider: 'openai',
          error: 'Vui lòng nhập OpenAI API Key để sử dụng Whisper-1.'
        });
      }

      const form = new FormData();
      form.append('file', fs.createReadStream(targetFilepath));
      form.append('model', 'whisper-1');
      form.append('response_format', 'verbose_json');
      if (language && language !== 'auto') form.append('language', language);

      const openAiRes = await axios.post('https://api.openai.com/v1/audio/transcriptions', form, {
        headers: { ...form.getHeaders(), 'Authorization': `Bearer ${apiKey}` },
        timeout: 120000
      });

      const data = openAiRes.data;
      const segments = (data.segments || []).map((seg, idx) => ({
        id: idx + 1,
        start: seg.start,
        end: seg.end,
        text: seg.text.trim(),
        startFormatted: formatSrtTime(seg.start),
        endFormatted: formatSrtTime(seg.end)
      }));

      result = {
        model: 'OpenAI Whisper-1',
        language: data.language || language,
        duration: data.duration,
        text: data.text,
        segments: segments
      };
    } else {
      return res.status(400).json({ error: `Model ${model} không được hỗ trợ.` });
    }

    // Build SRT and VTT representations
    if (result && result.segments && result.segments.length > 0) {
      let srtContent = '';
      let vttContent = 'WEBVTT\n\n';
      result.segments.forEach((seg, idx) => {
        srtContent += `${idx + 1}\n${formatSrtTime(seg.start)} --> ${formatSrtTime(seg.end)}\n${seg.text}\n\n`;
        vttContent += `${idx + 1}\n${formatVttTime(seg.start)} --> ${formatVttTime(seg.end)}\n${seg.text}\n\n`;
      });
      result.srt = srtContent.trim();
      result.vtt = vttContent.trim();
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[Transcribe Error]', error.response?.data || error.message);
    const apiError = error.response?.data?.error?.message || error.response?.data?.error || error.message;
    res.status(500).json({
      error: `Lỗi xử lý chuyển đổi giọng nói: ${apiError}`
    });
  }
});

// AI Translation / Summarization endpoint
app.post('/api/ai-assist', async (req, res) => {
  const { text, action, targetLang = 'Vietnamese', geminiApiKey, groqApiKey } = req.body;
  if (!text) {
    return res.status(400).json({ error: 'Nội dung văn bản trống.' });
  }

  const apiKey = geminiApiKey || process.env.GEMINI_API_KEY || groqApiKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'Cần API Key để sử dụng tính năng AI hỗ trợ dịch hoặc tóm tắt.' });
  }

  try {
    let promptText = '';
    if (action === 'translate') {
      promptText = `Translate the following text into ${targetLang}. Preserve tone and formatting:\n\n${text}`;
    } else if (action === 'summarize') {
      promptText = `Provide a concise executive summary and key bullet points of the following transcript in ${targetLang}:\n\n${text}`;
    } else if (action === 'clean') {
      promptText = `Clean up the following speech-to-text transcript by correcting minor grammar mistakes, filler words (uh, um, à, ừm), and proper punctuation, without changing the original meaning:\n\n${text}`;
    } else {
      promptText = text;
    }

    // Call Gemini if key available
    if (geminiApiKey || process.env.GEMINI_API_KEY) {
      const gKey = geminiApiKey || process.env.GEMINI_API_KEY;
      const gRes = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gKey}`,
        { contents: [{ parts: [{ text: promptText }] }] },
        { timeout: 30000 }
      );
      const output = gRes.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      return res.json({ success: true, result: output });
    }

    // Fallback to Groq Llama 3.3 70B
    const grKey = groqApiKey || process.env.GROQ_API_KEY;
    const grRes = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: promptText }]
      },
      { headers: { 'Authorization': `Bearer ${grKey}` }, timeout: 30000 }
    );
    res.json({ success: true, result: grRes.data.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi AI Assist: ' + (err.response?.data?.error?.message || err.message) });
  }
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🎙️ SPEECH TO TEXT PRO Server is running!`);
  console.log(`👉 Local:   http://localhost:${PORT}`);
  console.log(`👉 Network: http://127.0.0.1:${PORT}`);
  console.log(`======================================================\n`);

  // Automatically start Cloudflare Tunnel for public external access
  startCloudflareTunnel();
});
