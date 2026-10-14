/**
 * Cloudflare Worker for Speech To Text Pro
 * Hỗ trợ chạy trực tiếp trên *.workers.dev hoặc làm Proxy cố định về máy cá nhân
 */

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

    // 3. Phục vụ giao diện tĩnh Static Assets (HTML, CSS, JS)
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
