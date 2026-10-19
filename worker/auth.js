// Tài khoản: đăng ký, xác minh email, đăng nhập, quên/đổi mật khẩu, quản trị gói. Lưu trong D1.
import { AUTH_ACTIONS_PER_IP, MAIL_COOLDOWN_MS } from './plans.js';
import { getConfig, publicPlans } from './config.js';
import { consume, used, effectivePlan, subjectFor, sha256Hex, clientIp } from './quota.js';
import { sendMail, smtpConfigured } from './mailer.js';
import { renderEmail } from './emails.js';

const COOKIE = 'vk_sid';
const SESSION_MS = 30 * 24 * 3600 * 1000;
const VERIFY_MS = 24 * 3600 * 1000;
const RESET_MS = 3600 * 1000;
const PBKDF2_ITER = 100000; // tối đa Workers cho phép

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
const fail = (error, status = 400, extra = {}) => json({ error, ...extra }, status);

export const APP_PAYLOAD_SECRET = 'vk_sec_shield_2026';

function toB64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin);
}
function fromB64(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

async function derivePayloadKey(nonce) {
  const enc = new TextEncoder();
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(APP_PAYLOAD_SECRET + ':' + nonce));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptPayload(data, nonce) {
  const key = await derivePayloadKey(nonce);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  const buf = new Uint8Array(iv.length + cipher.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(cipher), iv.length);
  return toB64(buf);
}

export async function decryptPayload(b64, nonce) {
  const key = await derivePayloadKey(nonce);
  const raw = fromB64(b64);
  const iv = raw.slice(0, 12);
  const cipher = raw.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

export async function shieldResponse(data, request, status = 200, headers = {}) {
  const nonce = request ? (request.headers.get('X-Client-Nonce') || request.headers.get('x-client-nonce')) : null;
  const secHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    ...headers
  };
  if (nonce) {
    try {
      const encrypted = await encryptPayload(data, nonce);
      secHeaders['X-Payload-Shielded'] = '1';
      return new Response(JSON.stringify({ payload: encrypted }), { status, headers: secHeaders });
    } catch (e) {
      console.error('Shield encryption error:', e);
    }
  }
  return new Response(JSON.stringify(data), { status, headers: secHeaders });
}

const hex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n = 32) => hex(crypto.getRandomValues(new Uint8Array(n)));
const normEmail = (e) => String(e || '').trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

export async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function adminEmails(env) {
  return String(env.ADMIN_EMAILS || '').split(',').map(normEmail).filter(Boolean);
}
export const isAdmin = (env, user) => !!user && (user.role === 'admin' || adminEmails(env).includes(user.email));
const appUrl = (env, request) => (env.APP_URL || new URL(request.url).origin).replace(/\/$/, '');

function cookieHeader(request, value, maxAgeSec) {
  const secure = new URL(request.url).protocol === 'https:' ? ' Secure;' : '';
  return `${COOKIE}=${value}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAgeSec}`;
}
function readCookie(request) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([a-f0-9]{64})`));
  return m ? m[1] : null;
}

export async function getUser(request, env) {
  if (!env.DB) return null;
  const token = readCookie(request);
  if (!token) return null;
  return await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0`
  ).bind(await sha256Hex(token), Date.now()).first();
}

async function createSession(env, request, userId) {
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, now, now + SESSION_MS, (request.headers.get('User-Agent') || '').slice(0, 200)),
    env.DB.prepare('UPDATE users SET last_login = ? WHERE id = ?').bind(now, userId),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now)
  ]);
  return cookieHeader(request, token, SESSION_MS / 1000);
}

export function publicUser(env, user, cfg) {
  if (!user) return null;
  const plan = effectivePlan(user, cfg);
  return {
    id: user.id, email: user.email, name: user.name, verified: !!user.verified,
    plan: user.plan, planExpires: user.plan_expires, effectivePlan: plan.id,
    admin: isAdmin(env, user), createdAt: user.created_at, credits: user.extra_credits || 0
  };
}

async function issueToken(env, userId, kind, ttl) {
  const last = await env.DB.prepare('SELECT created_at FROM email_tokens WHERE user_id = ? AND kind = ? ORDER BY created_at DESC LIMIT 1')
    .bind(userId, kind).first();
  if (last && Date.now() - last.created_at < MAIL_COOLDOWN_MS) {
    const wait = Math.ceil((MAIL_COOLDOWN_MS - (Date.now() - last.created_at)) / 1000);
    const e = new Error(`Vui lòng đợi ${wait} giây rồi gửi lại.`); e.status = 429; throw e;
  }
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_tokens SET used = 1 WHERE user_id = ? AND kind = ? AND used = 0').bind(userId, kind),
    env.DB.prepare('INSERT INTO email_tokens (token_hash, user_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), userId, kind, now, now + ttl)
  ]);
  return token;
}

async function inspectAndConsumeToken(env, token, kind) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) {
    return { ok: false, error: 'Mã xác minh không đúng định dạng.', reason: 'invalid' };
  }
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT user_id, kind, used, expires_at FROM email_tokens WHERE token_hash = ? AND kind = ?'
  ).bind(hash, kind).first();
  if (!row) {
    return { ok: false, error: 'Liên kết không tồn tại hoặc đã bị xóa.', reason: 'not_found' };
  }
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(row.user_id).first();
  if (!user) {
    return { ok: false, error: 'Tài khoản liên kết không tồn tại.', reason: 'user_not_found' };
  }
  if (user.banned) {
    return { ok: false, error: 'Tài khoản này đã bị khóa.', reason: 'banned' };
  }
  if (row.used) {
    if (kind === 'verify' && user.verified) {
      return { ok: true, already: true, user, message: 'Tài khoản này đã được xác minh trước đó rồi.' };
    }
    return { ok: false, error: 'Liên kết này đã được sử dụng rồi.', reason: 'used', user, email: user.email };
  }
  if (Date.now() > row.expires_at) {
    const hours = kind === 'verify' ? 24 : 1;
    return {
      ok: false,
      error: `Liên kết ${kind === 'verify' ? 'xác minh' : 'đặt lại mật khẩu'} đã hết hạn (chỉ có hiệu lực trong ${hours === 24 ? '24 giờ' : '60 phút'}). Hãy gửi lại email mới.`,
      expired: true,
      reason: 'expired',
      user,
      email: user.email
    };
  }
  await env.DB.prepare('UPDATE email_tokens SET used = 1 WHERE token_hash = ? AND kind = ?').bind(hash, kind).run();
  return { ok: true, user };
}

/** Tạo token rồi gửi mail; gửi lỗi thì xóa token để không bị tính thời gian chờ. */
async function mailWithToken(env, user, kind, ttl, build) {
  if (!smtpConfigured(env)) throw Object.assign(new Error('Website chưa cấu hình máy chủ email (SMTP).'), { status: 503 });
  const token = await issueToken(env, user.id, kind, ttl);
  try {
    await sendMail(env, { to: user.email, ...(await build(token)) });
  } catch (e) {
    await env.DB.prepare('DELETE FROM email_tokens WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    throw Object.assign(new Error('Không gửi được email: ' + e.message), { status: 502 });
  }
}

const sendVerify = (env, request, user) =>
  mailWithToken(env, user, 'verify', VERIFY_MS, async token => renderEmail(env.DB, 'verify', {
    action_url: `${appUrl(env, request)}/?verify=${token}`, expires_hours: 24, free_calls: (await getConfig(env.DB)).plans.free.ttsCalls
  }, { appName: 'VoiceKit', appUrl: appUrl(env, request), name: user.name || user.email.split('@')[0], email: user.email }));

async function guardIp(env, request) {
  const n = await consume(env.DB, 'auth:' + (await sha256Hex('vk-auth:' + clientIp(request))).slice(0, 32), AUTH_ACTIONS_PER_IP);
  if (n === null) throw Object.assign(new Error('Quá nhiều thao tác từ mạng của bạn hôm nay. Hãy thử lại vào ngày mai.'), { status: 429 });
}

async function readBody(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    throw Object.assign(new Error('Yêu cầu không hợp lệ.'), { status: 415 });
  }
  let b;
  try { b = await request.json(); } catch { throw Object.assign(new Error('Dữ liệu không hợp lệ.'), { status: 400 }); }
  if (b && typeof b === 'object' && b.payload) {
    const nonce = request.headers.get('X-Client-Nonce') || request.headers.get('x-client-nonce');
    if (nonce) {
      try {
        b = await decryptPayload(b.payload, nonce);
      } catch (err) {
        throw Object.assign(new Error('Mã hóa yêu cầu không hợp lệ.'), { status: 400 });
      }
    }
  }
  return b;
}

/** Trạng thái tài khoản + gói + lượt dùng hôm nay (cho giao diện). */
export async function meResponse(request, env, cfg) {
  if (!env.DB) return shieldResponse({ accounts: false }, request);
  const user = await getUser(request, env);
  const plan = effectivePlan(user, cfg);
  const u = await used(env.DB, await subjectFor(request, user));
  return shieldResponse({
    accounts: true, smtp: smtpConfigured(env),
    user: publicUser(env, user, cfg),
    plan: { id: plan.id, name: plan.name, ttsCalls: plan.ttsCalls, maxChars: plan.maxChars },
    usage: { calls: u.calls, remaining: Math.max(0, plan.ttsCalls - u.calls), credits: user?.extra_credits || 0 },
    plans: publicPlans(cfg),
    theme: cfg.saved.theme || 'auto'
  }, request, 200);
}

export async function handleAuth(request, env, path) {
  const ok = (data, status = 200, headers = {}) => shieldResponse(data, request, status, headers);
  const fail = (error, status = 400, extra = {}) => shieldResponse({ error, ...extra }, request, status);

  if (!env.DB) return fail('Website chưa bật tài khoản (thiếu cơ sở dữ liệu D1).', 503);
  try {
    const cfg = await getConfig(env.DB);
    if (path === '/api/me' && request.method === 'GET') return meResponse(request, env, cfg);
    if (request.method !== 'POST') return fail('Phương thức không hỗ trợ.', 405);

    switch (path) {
      case '/api/auth/register': {
        const b = await readBody(request);
        await guardIp(env, request);
        const email = normEmail(b.email), name = String(b.name || '').trim().slice(0, 60), password = String(b.password || '');
        if (!validEmail(email)) return fail('Email không hợp lệ.');
        if (password.length < 8) return fail('Mật khẩu cần ít nhất 8 ký tự.');
        if (password.length > 200) return fail('Mật khẩu quá dài.');
        if (await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) {
          return fail('Email này đã có tài khoản. Hãy đăng nhập hoặc dùng "Quên mật khẩu".', 409);
        }
        const salt = randomHex(16);
        const role = adminEmails(env).includes(email) ? 'admin' : 'user';
        const user = await env.DB.prepare(
          'INSERT INTO users (email, name, pass_hash, pass_salt, role, created_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
        ).bind(email, name, await hashPassword(password, salt), salt, role, Date.now()).first();
        let mailError = null;
        try { await sendVerify(env, request, user); } catch (e) { mailError = e.message; }
        const cookie = await createSession(env, request, user.id);
        return ok({ ok: true, user: publicUser(env, user, cfg), mailSent: !mailError, mailError }, 201, { 'Set-Cookie': cookie });
      }

      case '/api/auth/login': {
        const b = await readBody(request);
        await guardIp(env, request);
        const email = normEmail(b.email);
        const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        const okPass = user && safeEqual(await hashPassword(String(b.password || ''), user.pass_salt), user.pass_hash);
        if (!okPass) return fail('Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.', 401);
        if (user.banned) return fail('Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.', 403);
        if (user.role !== 'admin' && adminEmails(env).includes(email)) {
          await env.DB.prepare("UPDATE users SET role = 'admin' WHERE id = ?").bind(user.id).run();
          user.role = 'admin';
        }
        return ok({
          ok: true,
          message: user.verified ? 'Đăng nhập thành công!' : 'Đăng nhập thành công! Tài khoản của bạn chưa xác minh email.',
          verified: !!user.verified,
          user: publicUser(env, user, cfg)
        }, 200, { 'Set-Cookie': await createSession(env, request, user.id) });
      }

      case '/api/auth/logout': {
        const token = readCookie(request);
        if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
        return ok({ ok: true }, 200, { 'Set-Cookie': cookieHeader(request, '', 0) });
      }

      case '/api/auth/verify': {
        const b = await readBody(request);
        const result = await inspectAndConsumeToken(env, b.token, 'verify');
        if (!result.ok) {
          return fail(result.error, result.expired ? 410 : 400, {
            expired: !!result.expired,
            email: result.email || null,
            reason: result.reason
          });
        }
        if (result.already) {
          return ok({ ok: true, already: true, message: result.message, user: publicUser(env, result.user, cfg) }, 200);
        }
        const user = await env.DB.prepare('UPDATE users SET verified = 1 WHERE id = ? RETURNING *').bind(result.user.id).first();
        try {
          await sendMail(env, {
            to: user.email,
            ...(await renderEmail(env.DB, 'welcome', { free_calls: cfg.plans.free.ttsCalls }, {
              appName: 'VoiceKit', appUrl: appUrl(env, request), name: user.name || user.email.split('@')[0], email: user.email
            }))
          });
        } catch {}
        return ok({ ok: true, user: publicUser(env, user, cfg) }, 200, { 'Set-Cookie': await createSession(env, request, user.id) });
      }

      case '/api/auth/resend-verify': {
        let b = {};
        try { b = await readBody(request); } catch {}
        let user = await getUser(request, env);
        if (!user && b.email) {
          const email = normEmail(b.email);
          user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        }
        if (!user) return fail('Vui lòng đăng nhập hoặc nhập đúng email đã đăng ký.', 401);
        if (user.verified) return ok({ ok: true, already: true, message: 'Tài khoản này đã được xác minh rồi, không cần gửi lại.' });
        if (user.banned) return fail('Tài khoản đã bị khóa.', 403);
        await guardIp(env, request);
        await sendVerify(env, request, user);
        return ok({ ok: true, email: user.email, message: `Đã gửi lại email xác minh tới ${user.email}. Vui lòng kiểm tra hộp thư.` });
      }

      case '/api/auth/forgot': {
        const b = await readBody(request);
        await guardIp(env, request);
        const email = normEmail(b.email);
        if (!validEmail(email)) return fail('Email không hợp lệ.');
        const user = await env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
        if (!smtpConfigured(env)) return fail('Website chưa cấu hình máy chủ email (SMTP).', 503);
        if (user) {
          try {
            await mailWithToken(env, user, 'reset', RESET_MS, token => renderEmail(env.DB, 'reset', { action_url: `${appUrl(env, request)}/?reset=${token}`, expires_minutes: 60 }, { appName: 'VoiceKit', appUrl: appUrl(env, request), name: user.name || user.email.split('@')[0], email: user.email }));
          } catch (e) { if (e.status === 429) return fail(e.message, 429); console.log('reset mail failed', e.message); }
        }
        // Luôn trả lời giống nhau để không lộ email nào đã đăng ký
        return ok({ ok: true });
      }

      case '/api/auth/reset': {
        const b = await readBody(request);
        const password = String(b.password || '');
        if (password.length < 8) return fail('Mật khẩu cần ít nhất 8 ký tự.');
        const result = await inspectAndConsumeToken(env, b.token, 'reset');
        if (!result.ok) {
          return fail(result.error, result.expired ? 410 : 400, {
            expired: !!result.expired,
            reason: result.reason
          });
        }
        const userId = result.user.id;
        const salt = randomHex(16);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, verified = 1 WHERE id = ?').bind(await hashPassword(password, salt), salt, userId),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId)
        ]);
        const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
        return ok({ ok: true, user: publicUser(env, user, cfg) }, 200, { 'Set-Cookie': await createSession(env, request, userId) });
      }

      case '/api/auth/password': {
        const b = await readBody(request);
        const user = await getUser(request, env);
        if (!user) return fail('Bạn chưa đăng nhập.', 401);
        if (!safeEqual(await hashPassword(String(b.current || ''), user.pass_salt), user.pass_hash)) return fail('Mật khẩu hiện tại không đúng.', 401);
        const next = String(b.next || '');
        if (next.length < 8) return fail('Mật khẩu mới cần ít nhất 8 ký tự.');
        const salt = randomHex(16);
        await env.DB.batch([
          env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPassword(next, salt), salt, user.id),
          env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id)
        ]);
        return ok({ ok: true }, 200, { 'Set-Cookie': await createSession(env, request, user.id) });
      }

    }
    return fail('Không tìm thấy.', 404);
  } catch (e) {
    return fail(e.message || 'Lỗi máy chủ.', e.status || 500);
  }
}
