/**
 * Cloudflare Worker cho VoiceKit.
 * - Phục vụ giao diện tĩnh trong public/ (miễn phí, không tính vào giới hạn request).
 * - Proxy nhỏ cho Edge Neural / CapCut TTS (trình duyệt không tự gọi được), có trừ lượt theo gói.
 * - Tài khoản, gói, quản trị (D1) và email xác minh / quên mật khẩu (SMTP).
 */

import { edgeVoices, edgeSynthesize } from './edge_tts_worker.js';
import { capcutVoices, capcutSynthesize } from './capcut_worker.js';
import { handleAuth, getUser, json } from './worker/auth.js';
import { takeTtsQuota, effectivePlan } from './worker/quota.js';
import { getConfig } from './worker/config.js';
import { handleAdmin } from './worker/admin.js';
import { handleBilling, handleInvoice } from './worker/billing.js';
import { handleHf } from './worker/hfproxy.js';
import { sourceLine, langOfVoice, spokenDomain } from './worker/spoken.js';
import { VIENEU_VOICES, SUPERTONIC_VOICES, vieneuSynthesize, supertonicSynthesize } from './worker/vieneu.js';

/** Tên miền website: lấy từ URL đang truy cập (hoặc APP_URL nếu cấu hình) */
const siteHost = (request, env) => new URL(env.APP_URL || request.url).host;

async function ttsRoute(request, env, synth, label, premiumOnly = false) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Dữ liệu không hợp lệ.' }, 400); }
  const text = String(body.text || '').trim();
  if (!text) return json({ error: 'Văn bản trống.' }, 400);
  if (text.length > 20000) return json({ error: 'Văn bản quá dài (tối đa 20.000 ký tự).' }, 400);

  // Trừ lượt theo gói (nếu website đã bật D1)
  let quota = null;
  if (env.DB) {
    const user = await getUser(request, env);
    const cfg = await getConfig(env.DB);
    if (premiumOnly && effectivePlan(user, cfg).id !== 'premium') {
      return json({ error: `${label} chỉ dành cho gói Premium.`, premium: true }, 403);
    }
    quota = await takeTtsQuota(env.DB, request, user, text.length, cfg);
    if (!quota.ok) return json({ error: quota.error, quota: true, plan: quota.plan.id, buyCredits: !!quota.buyCredits }, quota.status);
  }
  let finalText = text;
  if (env.DB) {
    const cfg = await getConfig(env.DB);
    const user = quota ? await getUser(request, env) : null;
    const exempt = cfg.watermark.exemptPremium && user && effectivePlan(user, cfg).id === 'premium';
    if (!exempt) {
      const lang = label.includes('CapCut') ? 'vi' : langOfVoice(body.voice);
      const line = sourceLine(cfg, siteHost(request, env), lang);
      if (line) finalText = `${text.replace(/[\s.!?…]*$/, '')}. ${line}`;
    }
  }
  try {
    const audio = await synth({ ...body, text: finalText });
    const headers = { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' };
    if (quota) { headers['X-Quota-Remaining'] = String(quota.remaining); headers['X-Credits-Remaining'] = String(quota.credits || 0); }
    return new Response(audio, { headers });
  } catch (err) {
    if (quota) await quota.refund(); // lỗi thì trả lại lượt
    return json({ error: `Lỗi ${label}: ${err.message}` }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
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

    if (path.startsWith('/hf/')) return handleHf(request, ctx, path);
    if (path.startsWith('/invoice/')) return handleInvoice(request, env, path);
    if (path === '/api/me' || path.startsWith('/api/auth/')) return handleAuth(request, env, path);
    if (path.startsWith('/api/admin/')) return handleAdmin(request, env, path);
    if (path.startsWith('/api/pay/') || path === '/api/payos/webhook') return handleBilling(request, env, path);

    if (path === '/api/tts-suffix') {
      if (!env.DB) return json({ enabled: false, text: '' });
      const cfg = await getConfig(env.DB);
      const lang = url.searchParams.get('lang') === 'en' ? 'en' : 'vi';
      const user = await getUser(request, env);
      const exempt = cfg.watermark.exemptPremium && user && effectivePlan(user, cfg).id === 'premium';
      const host = siteHost(request, env);
      return json({ enabled: cfg.watermark.enabled && !exempt, text: exempt ? '' : sourceLine(cfg, host, lang), host, spoken: spokenDomain(host, lang) });
    }
    if (path === '/api/vieneu/voices') return json({ success: true, voices: VIENEU_VOICES }, 200, { 'Cache-Control': 'public, max-age=86400' });
    if (path === '/api/vieneu/tts' && request.method === 'POST') return ttsRoute(request, env, vieneuSynthesize, 'VieNeu-TTS', true);

    if (path === '/api/supertonic/voices') return json({ success: true, voices: SUPERTONIC_VOICES }, 200, { 'Cache-Control': 'public, max-age=86400' });
    if (path === '/api/supertonic/tts' && request.method === 'POST') return ttsRoute(request, env, supertonicSynthesize, 'Supertonic 3', true);

    if (path === '/api/edge/voices') {
      try { return json({ success: true, voices: await edgeVoices() }, 200, { 'Cache-Control': 'public, max-age=86400' }); }
      catch (err) { return json({ error: err.message }, 500); }
    }
    if (path === '/api/edge/tts' && request.method === 'POST') return ttsRoute(request, env, edgeSynthesize, 'Edge TTS');

    if (path === '/api/capcut/voices') return json({ success: true, voices: capcutVoices() }, 200, { 'Cache-Control': 'public, max-age=86400' });
    if (path === '/api/capcut/tts' && request.method === 'POST') return ttsRoute(request, env, capcutSynthesize, 'Kho giọng CapCut', true);

    if (path.startsWith('/api/')) return json({ error: 'Không tìm thấy.' }, 404);
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not Found', { status: 404 });
  }
};
