// Đếm lượt dùng theo ngày (giờ Việt Nam) trong D1. Tăng có điều kiện nên không vượt giới hạn kể cả khi nhiều request cùng lúc.
import { GLOBAL_SOFT_RATIO } from './plans.js';

export function vnDay(t = Date.now()) {
  return new Date(t + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export async function sha256Hex(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || '0.0.0.0';
}

/** Tăng 1 lượt nếu chưa chạm limit. Trả về số lượt sau khi tăng, hoặc null nếu đã hết. */
export async function consume(db, subject, limit, chars = 0, day = vnDay()) {
  const row = await db.prepare(
    `INSERT INTO usage (subject, day, calls, chars) VALUES (?1, ?2, 1, ?3)
     ON CONFLICT(subject, day) DO UPDATE SET calls = calls + 1, chars = chars + ?3 WHERE usage.calls < ?4
     RETURNING calls`
  ).bind(subject, day, chars, limit).first();
  return row ? row.calls : null;
}

export async function refund(db, subject, chars = 0, day = vnDay()) {
  await db.prepare('UPDATE usage SET calls = MAX(calls - 1, 0), chars = MAX(chars - ?3, 0) WHERE subject = ?1 AND day = ?2')
    .bind(subject, day, chars).run();
}

export async function used(db, subject, day = vnDay()) {
  const row = await db.prepare('SELECT calls, chars FROM usage WHERE subject = ? AND day = ?').bind(subject, day).first();
  return row || { calls: 0, chars: 0 };
}

/** Gói đang có hiệu lực của người dùng (premium hết hạn -> free, chưa xác minh email -> guest). */
export function effectivePlan(user, cfg) {
  const P = cfg.plans;
  if (!user || !user.verified || user.banned) return P.guest;
  if (user.plan === 'premium' && (!user.plan_expires || user.plan_expires > Date.now())) return P.premium;
  return P.free;
}

export async function subjectFor(request, user) {
  return user ? `u:${user.id}` : `ip:${(await sha256Hex('vk-ip:' + clientIp(request))).slice(0, 32)}`;
}

/**
 * Trừ 1 lượt TTS (gói của người dùng + giới hạn tổng hệ thống).
 * Trả về { ok, plan, remaining, refund } hoặc { ok:false, status, error }.
 */
export async function takeTtsQuota(db, request, user, textLength, cfg) {
  const plan = effectivePlan(user, cfg);
  if (textLength > plan.maxChars) {
    return { ok: false, status: 413, error: `Gói ${plan.name} cho tối đa ${plan.maxChars.toLocaleString('vi-VN')} ký tự mỗi lượt (bạn gửi ${textLength.toLocaleString('vi-VN')}).`, plan };
  }
  const subject = await subjectFor(request, user);
  const count = await consume(db, subject, plan.ttsCalls, textLength);
  if (count === null) {
    return { ok: false, status: 429, error: `Đã hết ${plan.ttsCalls} lượt Edge/CapCut hôm nay của gói ${plan.name}. Lượt mới có lúc 0h (giờ Việt Nam).`, plan };
  }
  const globalLimit = plan.id === 'premium' ? cfg.globalDaily : Math.floor(cfg.globalDaily * GLOBAL_SOFT_RATIO);
  if ((await consume(db, 'global', globalLimit, textLength)) === null) {
    await refund(db, subject, textLength);
    return { ok: false, status: 503, error: 'Hệ thống đã dùng hết lượt Edge/CapCut hôm nay. Hãy dùng Piper / MMS (chạy trên máy bạn, không giới hạn) hoặc thử lại sau 0h.', plan };
  }
  return {
    ok: true, plan, remaining: plan.ttsCalls - count,
    refund: async () => { await refund(db, subject, textLength); await refund(db, 'global', textLength); }
  };
}
