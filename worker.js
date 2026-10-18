/**
 * Cloudflare Worker cho VoiceKit.
 * - Phục vụ giao diện tĩnh trong public/ (miễn phí, không tính vào giới hạn request).
 * - Proxy nhỏ cho Edge Neural / CapCut TTS (trình duyệt không tự gọi được), có trừ lượt theo gói.
 * - Tài khoản, gói, quản trị (D1) và email xác minh / quên mật khẩu (SMTP).
 */

import { edgeVoices, edgeSynthesize } from './edge_tts_worker.js';
import { capcutVoices, capcutSynthesize } from './capcut_worker.js';
import { handleAuth, getUser, json } from './worker/auth.js';
import { takeTtsQuota } from './worker/quota.js';

async function ttsRoute(request, env, synth, label) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Dữ liệu không hợp lệ.' }, 400); }
  const text = String(body.text || '').trim();
  if (!text) return json({ error: 'Văn bản trống.' }, 400);
  if (text.length > 20000) return json({ error: 'Văn bản quá dài (tối đa 20.000 ký tự).' }, 400);

  // Trừ lượt theo gói (nếu website đã bật D1)
  let quota = null;
  if (env.DB) {
    quota = await takeTtsQuota(env.DB, request, await getUser(request, env), text.length);
    if (!quota.ok) return json({ error: quota.error, quota: true, plan: quota.plan.id }, quota.status);
  }
  try {
    const audio = await synth({ ...body, text });
    const headers = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' };
    if (quota) headers['X-Quota-Remaining'] = String(quota.remaining);
    return new Response(audio, { headers });
  } catch (err) {
    if (quota) await quota.refund(); // lỗi thì trả lại lượt
    return json({ error: `Lỗi ${label}: ${err.message}` }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Chế độ proxy: chuyển mọi request về máy cá nhân (start.bat + tunnel) nếu có cấu hình TARGET_BACKEND
    if (env.TARGET_BACKEND && env.TARGET_BACKEND.startsWith('http')) {
      const target = new URL(path + url.search, env.TARGET_BACKEND);
      const headers = new Headers(request.headers);
      headers.set('Host', target.host);
      headers.set('X-Forwarded-Host', url.host);
      headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
      return fetch(target.toString(), {
        method: request.method, headers, redirect: 'follow',
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body
      });
    }

    if (path === '/health' || path === '/api/status') {
      return json({ status: 'ok', provider: 'Cloudflare Worker', accounts: !!env.DB });
    }

    if (path === '/api/me' || path.startsWith('/api/auth/') || path.startsWith('/api/admin/')) {
      return handleAuth(request, env, path);
    }

    if (path === '/api/edge/voices') {
      try { return json({ success: true, voices: await edgeVoices() }, 200, { 'Cache-Control': 'public, max-age=86400' }); }
      catch (err) { return json({ error: err.message }, 500); }
    }
    if (path === '/api/edge/tts' && request.method === 'POST') return ttsRoute(request, env, edgeSynthesize, 'Edge TTS');

    if (path === '/api/capcut/voices') return json({ success: true, voices: capcutVoices() }, 200, { 'Cache-Control': 'public, max-age=86400' });
    if (path === '/api/capcut/tts' && request.method === 'POST') return ttsRoute(request, env, capcutSynthesize, 'CapCut TTS');

    if (path.startsWith('/api/')) return json({ error: 'Không tìm thấy.' }, 404);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
