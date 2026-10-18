/**
 * Cloudflare Worker for Speech To Text Pro
 * Hỗ trợ chạy trực tiếp trên *.workers.dev hoặc làm Proxy cố định về máy cá nhân
 */

import { edgeVoices, edgeSynthesize } from './edge_tts_worker.js';
import { capcutVoices, capcutSynthesize } from './capcut_worker.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CHẾ ĐỘ PROXY: Nếu có cấu hình TARGET_BACKEND, chuyển tiếp mọi request về máy tính cá nhân
    if (env.TARGET_BACKEND && env.TARGET_BACKEND.startsWith('http')) {
      const targetUrl = new URL(url.pathname + url.search, env.TARGET_BACKEND);
      const newHeaders = new Headers(request.headers);
      newHeaders.set('Host', targetUrl.host);
      newHeaders.set('X-Forwarded-Host', url.host);
      newHeaders.set('X-Forwarded-Proto', url.protocol.replace(':', ''));

      return fetch(targetUrl.toString(), {
        method: request.method,
        headers: newHeaders,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'follow'
      });
    }

    // 2. CHẾ ĐỘ NATIVE SERVERLESS WORKER
    // API Status & Health
    if (url.pathname === '/health' || url.pathname === '/api/status') {
      return Response.json({
        status: 'ok',
        provider: 'Cloudflare Worker (workers.dev)',
        publicUrl: url.origin,
        maxFileSizeMB: 30,
        maxDurationMinutes: 10
      });
    }

    // API Upload (Trả về dữ liệu bộ nhớ tạm cho Client)
    if (url.pathname === '/api/upload' && request.method === 'POST') {
      try {
        const formData = await request.formData();
        const file = formData.get('audioFile');
        if (!file || typeof file === 'string') {
          return Response.json({ error: 'Không tìm thấy file âm thanh.' }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Data = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

        return Response.json({
          success: true,
          filename: file.name,
          size: file.size,
          mimetype: file.type,
          base64Data: `data:${file.type};base64,${base64Data}`
        });
      } catch (err) {
        return Response.json({ error: 'Lỗi tải file: ' + err.message }, { status: 500 });
      }
    }

    // API AI Assist (Tóm tắt, Dịch thuật, Làm sạch văn bản)
    if (url.pathname === '/api/ai-assist' && request.method === 'POST') {
      try {
        const body = await request.json();
        const { text, action, targetLang = 'Vietnamese', geminiApiKey, groqApiKey } = body;
        const apiKey = geminiApiKey || env.GEMINI_API_KEY || groqApiKey || env.GROQ_API_KEY;

        if (!apiKey) {
          return Response.json({ error: 'Cần API Key để sử dụng tính năng AI hỗ trợ.' }, { status: 400 });
        }

        let promptText = '';
        if (action === 'translate') promptText = `Translate the following text into ${targetLang}:\n\n${text}`;
        else if (action === 'summarize') promptText = `Summarize the key points in ${targetLang}:\n\n${text}`;
        else if (action === 'clean') promptText = `Clean up filler words and grammar while preserving meaning:\n\n${text}`;
        else promptText = text;

        if (geminiApiKey || env.GEMINI_API_KEY) {
          const gKey = geminiApiKey || env.GEMINI_API_KEY;
          let gRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${gKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
            }
          );
          if (!gRes.ok) {
            gRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${gKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
              }
            );
          }
          const data = await gRes.json();
          const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          return Response.json({ success: true, result: out });
        }

        const grKey = groqApiKey || env.GROQ_API_KEY;
        const grRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${grKey}`
          },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: promptText }]
          })
        });
        const grData = await grRes.json();
        return Response.json({ success: true, result: grData.choices[0].message.content });
      } catch (err) {
        return Response.json({ error: 'Lỗi AI Assist: ' + err.message }, { status: 500 });
      }
    }

    // Microsoft Edge Neural TTS (miễn phí, không cần key) - Worker làm proxy vì trình duyệt không tự gọi được
    if (url.pathname === '/api/edge/voices') {
      try {
        return Response.json({ success: true, voices: await edgeVoices() });
      } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
      }
    }
    if (url.pathname === '/api/edge/tts' && request.method === 'POST') {
      try {
        const { text, voice, rate, pitch } = await request.json();
        if (!text || !text.trim()) return Response.json({ error: 'Văn bản trống.' }, { status: 400 });
        if (text.length > 20000) return Response.json({ error: 'Văn bản quá dài (tối đa 20.000 ký tự).' }, { status: 400 });
        const audio = await edgeSynthesize({ text, voice, rate, pitch });
        return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
      } catch (err) {
        return Response.json({ error: 'Lỗi Edge TTS: ' + err.message }, { status: 500 });
      }
    }

    // CapCut / TikTok TTS (miễn phí, không cần key)
    if (url.pathname === '/api/capcut/voices') {
      return Response.json({ success: true, voices: capcutVoices() });
    }
    if (url.pathname === '/api/capcut/tts' && request.method === 'POST') {
      try {
        const { text, voice, rate } = await request.json();
        if (!text || !text.trim()) return Response.json({ error: 'Văn bản trống.' }, { status: 400 });
        const audio = await capcutSynthesize({ text, voice, rate });
        return new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } });
      } catch (err) {
        return Response.json({ error: 'Lỗi CapCut TTS: ' + err.message }, { status: 500 });
      }
    }

    // 3. Phục vụ giao diện tĩnh Static Assets (HTML, CSS, JS)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
