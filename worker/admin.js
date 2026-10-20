// Trang Quản trị: tổng quan, người dùng, đơn hàng, cài đặt gói/giá, payOS, nhật ký.
import { getConfig, saveConfig } from './config.js';
import { calcCreditsPrice } from './plans.js';
import { getUser, isAdmin, json, publicUser, hashPassword, readBody } from './auth.js';
import { vnDay, sha256Hex } from './quota.js';
import { sendMail, smtpConfigured } from './mailer.js';
import { renderEmail, getTemplate, sampleVars, cleanBody } from './emails.js';
import { TEMPLATES, GLOBAL_VARS, FIELDS } from './templates/index.js';
import { payosConfigured, confirmWebhook, cancelLink, newOrderCode, makeDescription } from './payos.js';
import { activateOrder, syncOrder, publicOrder } from './billing.js';

const fail = (error, status = 400) => json({ error }, status);
const appUrl = (env, request) => (env.APP_URL || new URL(request.url).origin).replace(/\/$/, '');
const VN = 7 * 3600 * 1000;
const dayStart = (t = Date.now()) => Math.floor((t + VN) / 86400000) * 86400000 - VN;
const monthStart = () => { const d = new Date(Date.now() + VN); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - VN; };
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map(b => b.toString(16).padStart(2, '0')).join('');

async function log(env, admin, action, target, detail) {
  await env.DB.prepare('INSERT INTO admin_logs (admin_id, admin_email, action, target, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(admin.id, admin.email, action, target ? String(target) : null, detail ? JSON.stringify(detail) : null, Date.now()).run();
}

async function mailToken(env, user, kind, ttl) {
  const token = randomHex(32), now = Date.now();
  await env.DB.batch([
    env.DB.prepare('UPDATE email_tokens SET used = 1 WHERE user_id = ? AND kind = ? AND used = 0').bind(user.id, kind),
    env.DB.prepare('INSERT INTO email_tokens (token_hash, user_id, kind, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
      .bind(await sha256Hex(token), user.id, kind, now, now + ttl)
  ]);
  return token;
}

const csv = (rows, cols) => '﻿' + [cols.join(','), ...rows.map(r => cols.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');

export async function handleAdmin(request, env, path) {
  if (!env.DB) return fail('Website chưa bật tài khoản.', 503);
  const admin = await getUser(request, env);
  if (!isAdmin(env, admin)) return fail('Chỉ quản trị viên.', 403);
  const url = new URL(request.url);
  const q = (k, d = '') => (url.searchParams.get(k) ?? d).trim();
  const body = request.method === 'POST' ? await readBody(request).catch(() => ({})) : {};
  const cfg = await getConfig(env.DB);
  const db = env.DB;

  try {
    /* ---------- Tổng quan ---------- */
    if (path === '/api/admin/overview') {
      const now = Date.now(), today = dayStart(), since = dayStart(now - 13 * 86400000);
      const [u, o, usage, signups, revenue, tts, recentOrders, recentUsers] = await Promise.all([
        db.prepare(`SELECT COUNT(*) total, SUM(verified) verified, SUM(banned) banned, COALESCE(SUM(extra_credits), 0) credits,
          SUM(CASE WHEN plan = 'premium' AND (plan_expires IS NULL OR plan_expires > ?1) AND verified = 1 THEN 1 ELSE 0 END) premium,
          SUM(CASE WHEN created_at >= ?2 THEN 1 ELSE 0 END) today, SUM(CASE WHEN created_at >= ?3 THEN 1 ELSE 0 END) week
          FROM users`).bind(now, today, now - 7 * 86400000).first(),
        db.prepare(`SELECT SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END) revenue,
          SUM(CASE WHEN status = 'PAID' AND paid_at >= ?1 THEN amount ELSE 0 END) month,
          SUM(CASE WHEN status = 'PAID' AND paid_at >= ?2 THEN amount ELSE 0 END) today,
          SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) paid, SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) pending
          FROM orders`).bind(monthStart(), today).first(),
        db.prepare(`SELECT (SELECT calls FROM usage WHERE subject = 'global' AND day = ?1) calls,
          (SELECT COUNT(*) FROM usage WHERE day = ?1 AND subject LIKE 'u:%') activeUsers,
          (SELECT COUNT(*) FROM usage WHERE day = ?1 AND subject LIKE 'ip:%') guests`).bind(vnDay()).first(),
        db.prepare(`SELECT date((created_at + ${VN}) / 1000, 'unixepoch') d, COUNT(*) n FROM users WHERE created_at >= ? GROUP BY d`).bind(since).all(),
        db.prepare(`SELECT date((paid_at + ${VN}) / 1000, 'unixepoch') d, SUM(amount) n FROM orders WHERE status = 'PAID' AND paid_at >= ? GROUP BY d`).bind(since).all(),
        db.prepare(`SELECT day d, calls n FROM usage WHERE subject = 'global' AND day >= ?`).bind(vnDay(since)).all(),
        db.prepare(`SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC LIMIT 6`).all(),
        db.prepare(`SELECT id, email, name, verified, plan, plan_expires, created_at FROM users ORDER BY id DESC LIMIT 6`).all()
      ]);
      const days = [...Array(14)].map((_, i) => vnDay(since + i * 86400000));
      const pick = (rows) => { const m = Object.fromEntries(rows.results.map(r => [r.d, r.n])); return days.map(d => m[d] || 0); };
      return json({
        users: u, orders: o, usage: { ...usage, globalLimit: cfg.globalDaily },
        series: { days, signups: pick(signups), revenue: pick(revenue), tts: pick(tts) },
        recentOrders: recentOrders.results.map(r => ({ ...publicOrder(r), email: r.email })),
        recentUsers: recentUsers.results,
        status: { payos: payosConfigured(env), smtp: smtpConfigured(env) }
      });
    }

    /* ---------- Người dùng ---------- */
    if (path === '/api/admin/users' && request.method === 'GET') {
      const now = Date.now();
      const filters = {
        all: ['1=1', []],
        premium: ["plan = 'premium' AND (plan_expires IS NULL OR plan_expires > ?)", [now]],
        free: ["(plan != 'premium' OR plan_expires <= ?)", [now]],
        unverified: ['verified = 0', []], banned: ['banned = 1', []], admin: ["role = 'admin'", []]
      };
      const [cond, condArgs] = filters[q('filter', 'all')] || filters.all;
      const page = Math.max(0, Number(q('page', '0')) || 0);
      const search = `%${q('q').toLowerCase()}%`;
      const where = `(email LIKE ? OR lower(name) LIKE ?) AND ${cond}`;
      const args = [search, search, ...condArgs];
      const { results } = await db.prepare(
        `SELECT id, email, name, plan, plan_expires, role, verified, banned, created_at, last_login, extra_credits,
          (SELECT COALESCE(SUM(amount), 0) FROM orders WHERE user_id = users.id AND status = 'PAID') spent
         FROM users WHERE ${where} ORDER BY id DESC LIMIT 25 OFFSET ?`
      ).bind(...args, page * 25).all();
      const total = await db.prepare(`SELECT COUNT(*) n FROM users WHERE ${where}`).bind(...args).first();
      return json({ users: results, total: total.n, page, pageSize: 25 });
    }

    let m = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (m && request.method === 'GET') {
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(Number(m[1])).first();
      if (!user) return fail('Không tìm thấy người dùng.', 404);
      const [usage, orders, sessions] = await Promise.all([
        db.prepare('SELECT calls, chars FROM usage WHERE subject = ? AND day = ?').bind(`u:${user.id}`, vnDay()).first(),
        db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(user.id).all(),
        db.prepare('SELECT COUNT(*) n, MAX(created_at) last FROM sessions WHERE user_id = ? AND expires_at > ?').bind(user.id, Date.now()).first()
      ]);
      return json({
        user: { ...publicUser(env, user, cfg), role: user.role, banned: !!user.banned, lastLogin: user.last_login, credits: user.extra_credits || 0 },
        usage: usage || { calls: 0, chars: 0 }, orders: orders.results.map(publicOrder), sessions
      });
    }

    m = path.match(/^\/api\/admin\/users\/(\d+)\/action$/);
    if (m && request.method === 'POST') {
      const id = Number(m[1]);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!user) return fail('Không tìm thấy người dùng.', 404);
      const self = user.id === admin.id;
      let message = 'Đã cập nhật.';
      switch (body.action) {
        case 'plan': {
          if (!['free', 'premium'].includes(body.plan)) return fail('Gói không hợp lệ.');
          const days = Math.max(0, Math.min(3650, Number(body.days) || 0));
          let expires = null;
          if (body.plan === 'premium' && days) {
            const base = body.mode === 'extend' && user.plan === 'premium' && user.plan_expires > Date.now() ? user.plan_expires : Date.now();
            expires = base + days * 86400000;
          }
          await db.prepare('UPDATE users SET plan = ?, plan_expires = ? WHERE id = ?').bind(body.plan, expires, id).run();
          if (body.notify) {
            try {
              await sendMail(env, { to: user.email, ...(await renderEmail(db, 'plan', {
                plan_name: cfg.plans[body.plan].name, expires_date: expires ? new Date(expires).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'vĩnh viễn'
              }, { appName: 'TXA Voice', appUrl: appUrl(env, request), name: user.name || user.email.split('@')[0], email: user.email })) });
            } catch {}
          }
          message = body.plan === 'premium' ? `Đã đặt Premium ${days ? (body.mode === 'extend' ? 'thêm ' : '') + days + ' ngày' : 'vĩnh viễn'}.` : 'Đã chuyển về gói Miễn phí.';
          await log(env, admin, 'user.plan', user.email, { plan: body.plan, days, mode: body.mode || 'set' });
          break;
        }
        case 'verify':
          await db.prepare('UPDATE users SET verified = 1 WHERE id = ?').bind(id).run();
          await log(env, admin, 'user.verify', user.email); message = 'Đã xác minh email.'; break;
        case 'resend_verify': {
          const token = await mailToken(env, user, 'verify', 24 * 3600 * 1000);
          await sendMail(env, { to: user.email, ...(await renderEmail(db, 'verify', { action_url: `${appUrl(env, request)}/?verify=${token}`, expires_hours: 24, free_calls: cfg.plans.free.ttsCalls }, { appName: 'TXA Voice', appUrl: appUrl(env, request), name: user.name || user.email.split('@')[0], email: user.email })) });
          await log(env, admin, 'user.resend_verify', user.email); message = 'Đã gửi email xác minh.'; break;
        }
        case 'reset_password': {
          const token = await mailToken(env, user, 'reset', 3600 * 1000);
          await sendMail(env, { to: user.email, ...(await renderEmail(db, 'reset', { action_url: `${appUrl(env, request)}/?reset=${token}`, expires_minutes: 60 }, { appName: 'TXA Voice', appUrl: appUrl(env, request), name: user.name || user.email.split('@')[0], email: user.email })) });
          await log(env, admin, 'user.reset_password', user.email); message = 'Đã gửi email đặt lại mật khẩu.'; break;
        }
        case 'ban':
          if (self) return fail('Không thể tự khóa chính mình.');
          await db.batch([db.prepare('UPDATE users SET banned = 1 WHERE id = ?').bind(id), db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id)]);
          await log(env, admin, 'user.ban', user.email, { reason: body.reason || '' }); message = 'Đã khóa tài khoản và đăng xuất mọi thiết bị.'; break;
        case 'unban':
          await db.prepare('UPDATE users SET banned = 0 WHERE id = ?').bind(id).run();
          await log(env, admin, 'user.unban', user.email); message = 'Đã mở khóa tài khoản.'; break;
        case 'logout_all':
          await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id).run();
          await log(env, admin, 'user.logout_all', user.email); message = 'Đã đăng xuất mọi thiết bị.'; break;
        case 'reset_usage':
          await db.prepare('DELETE FROM usage WHERE subject = ? AND day = ?').bind(`u:${id}`, vnDay()).run();
          await log(env, admin, 'user.reset_usage', user.email); message = 'Đã làm mới lượt dùng hôm nay.'; break;
        case 'role':
          if (self) return fail('Không thể tự đổi quyền của chính mình.');
          if (!['admin', 'user'].includes(body.role)) return fail('Quyền không hợp lệ.');
          await db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(body.role, id).run();
          await log(env, admin, 'user.role', user.email, { role: body.role }); message = body.role === 'admin' ? 'Đã cấp quyền quản trị.' : 'Đã gỡ quyền quản trị.'; break;
        case 'rename':
          await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(String(body.name || '').trim().slice(0, 60), id).run();
          await log(env, admin, 'user.rename', user.email, { name: body.name }); message = 'Đã đổi tên.'; break;
        case 'delete':
          if (self) return fail('Không thể tự xóa chính mình.');
          if (body.confirm !== user.email) return fail('Nhập đúng email để xác nhận xóa.');
          await db.batch([
            db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM email_tokens WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM usage WHERE subject = ?').bind(`u:${id}`),
            db.prepare('DELETE FROM orders WHERE user_id = ?').bind(id),
            db.prepare('DELETE FROM users WHERE id = ?').bind(id)
          ]);
          await log(env, admin, 'user.delete', user.email); message = 'Đã xóa tài khoản.'; break;
        default: return fail('Thao tác không hợp lệ.');
      }
      return json({ ok: true, message });
    }

    /* ---------- Đơn hàng ---------- */
    if ((path === '/api/admin/orders' && request.method === 'GET') || path === '/api/admin/orders.csv') {
      const status = q('status');
      const search = q('q').toLowerCase();
      const page = Math.max(0, Number(q('page', '0')) || 0);
      const conds = ['1=1'], args = [];
      if (['PENDING', 'PAID', 'CANCELLED', 'EXPIRED'].includes(status)) { conds.push('o.status = ?'); args.push(status); }
      if (q('invoice') === 'need') conds.push("o.invoice IS NOT NULL AND o.status = 'PAID' AND o.invoice_issued_at IS NULL");
      if (q('invoice') === 'any') conds.push('o.invoice IS NOT NULL');
      if (search) { conds.push("(u.email LIKE ? OR CAST(o.order_code AS TEXT) LIKE ? OR o.description LIKE ?)"); args.push(`%${search}%`, `%${search}%`, `%${search.toUpperCase()}%`); }
      const where = conds.join(' AND ');
      if (path.endsWith('.csv')) {
        const { results } = await db.prepare(`SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 5000`).bind(...args).all();
        const rows = results.map(r => ({ ...r, created: new Date(r.created_at).toISOString(), paid: r.paid_at ? new Date(r.paid_at).toISOString() : '' }));
        return new Response(csv(rows, ['order_code', 'email', 'package_name', 'amount', 'status', 'description', 'created', 'paid', 'paid_via', 'reference']), {
          headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="voicekit-orders-${vnDay()}.csv"` }
        });
      }
      const { results } = await db.prepare(`SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where} ORDER BY o.created_at DESC LIMIT 25 OFFSET ?`).bind(...args, page * 25).all();
      const total = await db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(CASE WHEN o.status = 'PAID' THEN o.amount END), 0) sum FROM orders o JOIN users u ON u.id = o.user_id WHERE ${where}`).bind(...args).first();
      return json({ orders: results.map(r => ({ ...publicOrder(r), email: r.email, reference: r.reference, note: r.note })), total: total.n, sum: total.sum, page, pageSize: 25 });
    }

    m = path.match(/^\/api\/admin\/orders\/(\d+)\/action$/);
    if (m && request.method === 'POST') {
      const code = Number(m[1]);
      const order = await db.prepare('SELECT * FROM orders WHERE order_code = ?').bind(code).first();
      if (!order) return fail('Không tìm thấy đơn hàng.', 404);
      let message;
      if (body.action === 'sync') {
        const after = await syncOrder(env, request, order);
        message = `Trạng thái payOS: ${after.status}.`;
        await log(env, admin, 'order.sync', code, { status: after.status });
      } else if (body.action === 'mark_paid') {
        const done = await activateOrder(env, request, code, 'admin', body.reference || null);
        if (body.note) await db.prepare('UPDATE orders SET note = ? WHERE order_code = ?').bind(String(body.note).slice(0, 200), code).run();
        message = done ? 'Đã đánh dấu đã thanh toán và kích hoạt Premium.' : 'Đơn này đã được thanh toán từ trước.';
        await log(env, admin, 'order.mark_paid', code, { note: body.note || '' });
      } else if (body.action === 'cancel') {
        if (order.status !== 'PENDING') return fail('Chỉ hủy được đơn đang chờ.');
        try { await cancelLink(env, code, 'Admin huy don'); } catch {}
        await db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE order_code = ?").bind(code).run();
        message = 'Đã hủy đơn.';
        await log(env, admin, 'order.cancel', code);
      } else if (body.action === 'delete') {
        await db.prepare('DELETE FROM orders WHERE order_code = ?').bind(code).run();
        message = 'Đã xóa đơn hàng.';
        await log(env, admin, 'order.delete', code, { status: order.status, amount: order.amount });
      } else if (body.action === 'invoice_issued') {
        const no = String(body.invoice_no || '').trim().slice(0, 60);
        await db.prepare('UPDATE orders SET invoice_no = ?, invoice_issued_at = ? WHERE order_code = ?').bind(no || null, body.undo ? null : Date.now(), code).run();
        message = body.undo ? 'Đã bỏ đánh dấu xuất hóa đơn.' : 'Đã đánh dấu đã xuất hóa đơn.';
        await log(env, admin, 'order.invoice', code, { invoice_no: no, undo: !!body.undo });
      } else return fail('Thao tác không hợp lệ.');
      return json({ ok: true, message });
    }

    if (path === '/api/admin/users.csv') {
      const { results } = await db.prepare(`SELECT id, email, name, plan, plan_expires, role, verified, banned, created_at, last_login FROM users ORDER BY id`).all();
      const rows = results.map(r => ({ ...r, created: new Date(r.created_at).toISOString(), expires: r.plan_expires ? new Date(r.plan_expires).toISOString() : '' }));
      return new Response(csv(rows, ['id', 'email', 'name', 'plan', 'expires', 'role', 'verified', 'banned', 'created']), {
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="voicekit-users-${vnDay()}.csv"` }
      });
    }

    /* ---------- CRUD người dùng ---------- */
    const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
    const normEmail = (e) => String(e || '').trim().toLowerCase();
    const okEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);
    const ctxOf = (u) => ({ appName: 'TXA Voice', appUrl: appUrl(env, request), name: u.name || u.email.split('@')[0], email: u.email });
    const expiryOf = (v) => {
      if (v === null || v === undefined || v === '') return null;
      const t = typeof v === 'number' ? v : Date.parse(String(v) + 'T23:59:59+07:00');
      if (!Number.isFinite(t)) throw bad('Ngày hết hạn không hợp lệ.');
      return t;
    };

    if (path === '/api/admin/users' && request.method === 'POST') {
      const email = normEmail(body.email);
      if (!okEmail(email)) return fail('Email không hợp lệ.');
      if (await db.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first()) return fail('Email này đã có tài khoản.', 409);
      const password = String(body.password || '');
      if (password && password.length < 8) return fail('Mật khẩu cần ít nhất 8 ký tự.');
      const plan = body.plan === 'premium' ? 'premium' : 'free';
      const expires = plan === 'premium' ? expiryOf(body.plan_expires) : null;
      const salt = randomHex(16);
      const user = await db.prepare(
        'INSERT INTO users (email, name, pass_hash, pass_salt, plan, plan_expires, role, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
      ).bind(email, String(body.name || '').trim().slice(0, 60), await hashPassword(password || randomHex(24), salt), salt, plan, expires,
        body.role === 'admin' ? 'admin' : 'user', body.verified === false ? 0 : 1, Date.now()).first();
      let mailNote = '';
      if (!password || body.invite) {
        try {
          const token = await mailToken(env, user, 'reset', 72 * 3600 * 1000);
          await sendMail(env, { to: email, ...(await renderEmail(db, 'invite', { action_url: `${appUrl(env, request)}/?reset=${token}`, expires_hours: 72, plan_name: cfg.plans[plan].name }, ctxOf(user))) });
          mailNote = ' Đã gửi email mời tạo mật khẩu.';
        } catch (e) { mailNote = ' Chưa gửi được email mời: ' + e.message; }
      }
      await log(env, admin, 'user.create', email, { plan, role: user.role });
      return json({ ok: true, message: 'Đã tạo tài khoản.' + mailNote, user: { id: user.id } }, 201);
    }

    m = path.match(/^\/api\/admin\/users\/(\d+)\/update$/);
    if (m && request.method === 'POST') {
      const id = Number(m[1]);
      const user = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
      if (!user) return fail('Không tìm thấy người dùng.', 404);
      const self = id === admin.id;
      const email = body.email !== undefined ? normEmail(body.email) : user.email;
      if (!okEmail(email)) return fail('Email không hợp lệ.');
      if (email !== user.email && await db.prepare('SELECT 1 FROM users WHERE email = ? AND id != ?').bind(email, id).first()) return fail('Email này đã thuộc tài khoản khác.', 409);
      const role = body.role === 'admin' || body.role === 'user' ? body.role : user.role;
      if (self && role !== user.role) return fail('Không thể tự đổi quyền của chính mình.');
      const banned = body.banned !== undefined ? (body.banned ? 1 : 0) : user.banned;
      if (self && banned) return fail('Không thể tự khóa chính mình.');
      const plan = body.plan === 'premium' || body.plan === 'free' ? body.plan : user.plan;
      const expires = plan === 'premium' ? (body.plan_expires !== undefined ? expiryOf(body.plan_expires) : user.plan_expires) : null;
      const verified = body.verified !== undefined ? (body.verified ? 1 : 0) : user.verified;
      const credits = body.credits !== undefined ? Math.max(0, Math.min(10000000, Math.floor(Number(body.credits)) || 0)) : user.extra_credits;
      const stmts = [db.prepare('UPDATE users SET email = ?, name = ?, role = ?, banned = ?, plan = ?, plan_expires = ?, verified = ?, extra_credits = ? WHERE id = ?')
        .bind(email, body.name !== undefined ? String(body.name).trim().slice(0, 60) : user.name, role, banned, plan, expires, verified, credits, id)];
      const password = String(body.password || '');
      if (password) {
        if (password.length < 8) return fail('Mật khẩu mới cần ít nhất 8 ký tự.');
        const salt = randomHex(16);
        stmts.push(db.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(await hashPassword(password, salt), salt, id));
      }
      if (password || (banned && !user.banned) || email !== user.email) stmts.push(db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id));
      await db.batch(stmts);
      await log(env, admin, 'user.update', user.email, { email, role, banned, plan, expires, verified, credits, password: password ? 'đã đổi' : undefined });
      return json({ ok: true, message: 'Đã lưu thông tin người dùng.' + (password ? ' Mật khẩu đã đổi, người dùng bị đăng xuất.' : '') });
    }

    if (path === '/api/admin/users/bulk' && request.method === 'POST') {
      const ids = [...new Set((body.ids || []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 200);
      if (!ids.length) return fail('Chưa chọn người dùng nào.');
      const target = ['ban', 'delete'].includes(body.action) ? ids.filter(i => i !== admin.id) : ids;
      const skipped = ids.length - target.length;
      if (!target.length) return fail('Không thể áp dụng cho chính bạn.');
      const ph = target.map(() => '?').join(',');
      const now = Date.now();
      let message;
      switch (body.action) {
        case 'verify': await db.prepare(`UPDATE users SET verified = 1 WHERE id IN (${ph})`).bind(...target).run(); message = 'Đã xác minh email'; break;
        case 'ban': await db.batch([db.prepare(`UPDATE users SET banned = 1 WHERE id IN (${ph})`).bind(...target), db.prepare(`DELETE FROM sessions WHERE user_id IN (${ph})`).bind(...target)]); message = 'Đã khóa'; break;
        case 'unban': await db.prepare(`UPDATE users SET banned = 0 WHERE id IN (${ph})`).bind(...target).run(); message = 'Đã mở khóa'; break;
        case 'logout_all': await db.prepare(`DELETE FROM sessions WHERE user_id IN (${ph})`).bind(...target).run(); message = 'Đã đăng xuất'; break;
        case 'reset_usage': await db.prepare(`DELETE FROM usage WHERE day = ? AND subject IN (${ph})`).bind(vnDay(), ...target.map(i => `u:${i}`)).run(); message = 'Đã làm mới lượt'; break;
        case 'plan': {
          const days = Math.max(0, Math.min(3650, Number(body.days) || 0));
          if (body.plan === 'free') { await db.prepare(`UPDATE users SET plan = 'free', plan_expires = NULL WHERE id IN (${ph})`).bind(...target).run(); message = 'Đã chuyển về Miễn phí'; break; }
          if (!days) { await db.prepare(`UPDATE users SET plan = 'premium', plan_expires = NULL WHERE id IN (${ph})`).bind(...target).run(); message = 'Đã cấp Premium vĩnh viễn'; break; }
          // Cộng thêm ngày (tính từ hạn hiện tại nếu còn hạn)
          await db.prepare(`UPDATE users SET plan = 'premium', plan_expires =
            CASE WHEN plan = 'premium' AND plan_expires IS NULL THEN NULL
                 WHEN plan = 'premium' AND plan_expires > ?1 THEN plan_expires + ?2 ELSE ?1 + ?2 END
            WHERE id IN (${target.map((_, i) => '?' + (i + 3)).join(',')})`).bind(now, days * 86400000, ...target).run();
          message = `Đã cộng ${days} ngày Premium`; break;
        }
        case 'add_credits': {
          const n = Math.floor(Number(body.amount));
          if (!n || Math.abs(n) > 1000000) return fail('Số lượt không hợp lệ.');
          await db.prepare(`UPDATE users SET extra_credits = MAX(0, extra_credits + ?) WHERE id IN (${target.map(() => '?').join(',')})`).bind(n, ...target).run();
          message = n > 0 ? `Đã cộng ${n} lượt cho` : `Đã trừ ${-n} lượt của`; break;
        }
        case 'delete': {
          if (body.confirm !== 'XOA') return fail('Nhập XOA để xác nhận xóa hàng loạt.');
          await db.batch([
            db.prepare(`DELETE FROM sessions WHERE user_id IN (${ph})`).bind(...target),
            db.prepare(`DELETE FROM email_tokens WHERE user_id IN (${ph})`).bind(...target),
            db.prepare(`DELETE FROM usage WHERE subject IN (${ph})`).bind(...target.map(i => `u:${i}`)),
            db.prepare(`DELETE FROM orders WHERE user_id IN (${ph})`).bind(...target),
            db.prepare(`DELETE FROM users WHERE id IN (${ph})`).bind(...target)
          ]);
          message = 'Đã xóa'; break;
        }
        default: return fail('Thao tác không hợp lệ.');
      }
      await log(env, admin, 'user.bulk.' + body.action, `${target.length} tài khoản`, { ids: target, days: body.days, plan: body.plan });
      return json({ ok: true, message: `${message} ${target.length} tài khoản.${skipped ? ` Bỏ qua ${skipped} (tài khoản của bạn).` : ''}` });
    }

    /* ---------- CRUD đơn hàng ---------- */
    m = path.match(/^\/api\/admin\/orders\/(\d+)$/);
    if (m && request.method === 'GET') {
      const o = await db.prepare('SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id WHERE o.order_code = ?').bind(Number(m[1])).first();
      if (!o) return fail('Không tìm thấy đơn hàng.', 404);
      return json({ order: { ...publicOrder(o), email: o.email, reference: o.reference, note: o.note } });
    }

    if (path === '/api/admin/orders' && request.method === 'POST') {
      const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(normEmail(body.email)).first();
      if (!user) return fail('Không tìm thấy tài khoản với email này.', 404);
      let pkg = cfg.allPackages.find(p => p.id === body.package_id);
      if (body.package_id === 'credits') {
        const qty = Math.floor(Number(body.credits));
        if (!(qty >= 1 && qty <= 1000000)) return fail('Số lượt không hợp lệ.');
        const amount = body.custom?.amount !== undefined && body.custom.amount !== '' ? Math.max(0, Math.floor(Number(body.custom.amount))) : calcCreditsPrice(qty, cfg.credits.price);
        pkg = { id: 'credits', name: `${qty.toLocaleString('vi-VN')} lượt`, days: 0, price: amount, kind: 'credits', credits: qty };
      } else if (!pkg) {
        const c = body.custom || {};
        const amount = Math.floor(Number(c.amount)), days = Math.floor(Number(c.days));
        if (!(amount >= 0 && amount <= 50000000)) return fail('Số tiền không hợp lệ.');
        if (!(days >= 1 && days <= 3650)) return fail('Số ngày phải từ 1 đến 3650.');
        pkg = { id: 'custom', name: String(c.name || `${days} ngày`).trim().slice(0, 30), days, price: amount };
      }
      const code = newOrderCode();
      await db.prepare(`INSERT INTO orders (order_code, user_id, package_id, package_name, days, amount, status, description, created_at, note, kind, credits)
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?, ?, ?)`).bind(code, user.id, pkg.id, pkg.name, pkg.days, pkg.price, makeDescription(env, code, pkg.kind || 'premium'), Date.now(), String(body.note || 'Tạo thủ công').slice(0, 200), pkg.kind || 'premium', pkg.credits || 0).run();
      if (body.status === 'PAID') await activateOrder(env, request, code, 'admin', String(body.reference || '').slice(0, 60) || null, { mail: !!body.send_receipt });
      await log(env, admin, 'order.create', code, { email: user.email, pkg: pkg.name, amount: pkg.price, status: body.status === 'PAID' ? 'PAID' : 'PENDING' });
      return json({ ok: true, message: body.status === 'PAID' ? (pkg.kind === 'credits' ? `Đã tạo đơn #${code} và cộng ${pkg.credits} lượt.` : `Đã tạo đơn #${code} và kích hoạt Premium ${pkg.days} ngày.`) : `Đã tạo đơn chờ #${code}.`, orderCode: code }, 201);
    }

    m = path.match(/^\/api\/admin\/orders\/(\d+)\/update$/);
    if (m && request.method === 'POST') {
      const code = Number(m[1]);
      const order = await db.prepare('SELECT * FROM orders WHERE order_code = ?').bind(code).first();
      if (!order) return fail('Không tìm thấy đơn hàng.', 404);
      let invoice = order.invoice;
      if (body.invoice === null) invoice = null;
      else if (body.invoice && typeof body.invoice === 'object') {
        const iv = (k, n) => String(body.invoice[k] || '').trim().slice(0, n);
        const inv = { type: body.invoice.type === 'company' ? 'company' : 'personal', name: iv('name', 150), tax_code: iv('tax_code', 20), address: iv('address', 250), email: iv('email', 190).toLowerCase() };
        if (!inv.name) return fail('Thông tin hóa đơn cần có tên người mua.');
        if (inv.tax_code && !/^\d{10}(-\d{3})?$/.test(inv.tax_code)) return fail('Mã số thuế không hợp lệ.');
        invoice = JSON.stringify(inv);
      }
      const editable = order.status !== 'PAID';
      const amount = editable && body.amount !== undefined ? Math.max(0, Math.floor(Number(body.amount))) : order.amount;
      const days = editable && body.days !== undefined ? Math.max(1, Math.min(3650, Math.floor(Number(body.days)))) : order.days;
      const pname = editable && body.package_name !== undefined ? String(body.package_name).trim().slice(0, 30) || order.package_name : order.package_name;
      const invoiceNo = body.invoice_no !== undefined ? String(body.invoice_no).trim().slice(0, 60) || null : order.invoice_no;
      await db.prepare('UPDATE orders SET note = ?, invoice = ?, invoice_no = ?, amount = ?, days = ?, package_name = ? WHERE order_code = ?')
        .bind(body.note !== undefined ? String(body.note).slice(0, 200) : order.note, invoice, invoiceNo, amount, days, pname, code).run();
      let extra = '';
      if (body.status && body.status !== order.status) {
        if (body.status === 'PAID') { await activateOrder(env, request, code, 'admin', null, { mail: !!body.send_receipt }); extra = ' Đã kích hoạt Premium.'; }
        else if (body.status === 'CANCELLED' && order.status === 'PENDING') {
          if (order.checkout_url) { try { await cancelLink(env, code, 'Admin huy don'); } catch {} }
          await db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE order_code = ?").bind(code).run(); extra = ' Đã hủy đơn.';
        } else if (order.status === 'PAID') return fail('Đơn đã thanh toán không đổi trạng thái được (hãy xóa hoặc hạ gói người dùng nếu cần).');
      }
      await log(env, admin, 'order.update', code, { note: body.note, invoice_no: invoiceNo, amount, days, status: body.status });
      return json({ ok: true, message: 'Đã lưu đơn hàng.' + extra });
    }

    if (path === '/api/admin/orders/bulk' && request.method === 'POST') {
      const codes = [...new Set((body.codes || []).map(Number).filter(n => Number.isSafeInteger(n) && n > 0))].slice(0, 100);
      if (!codes.length) return fail('Chưa chọn đơn nào.');
      const ph = codes.map(() => '?').join(',');
      const { results: list } = await db.prepare(`SELECT * FROM orders WHERE order_code IN (${ph})`).bind(...codes).all();
      let done = 0, skipped = 0;
      if (body.action === 'delete') {
        if (body.confirm !== 'XOA') return fail('Nhập XOA để xác nhận xóa hàng loạt.');
        await db.prepare(`DELETE FROM orders WHERE order_code IN (${ph})`).bind(...codes).run();
        done = list.length;
      } else if (body.action === 'invoice_issued') {
        const r = await db.prepare(`UPDATE orders SET invoice_issued_at = ? WHERE order_code IN (${ph}) AND status = 'PAID' AND invoice IS NOT NULL AND invoice_issued_at IS NULL`).bind(Date.now(), ...codes).run();
        done = r.meta?.changes ?? 0; skipped = list.length - done;
      } else {
        for (const o of list) {
          if (body.action === 'sync') { if (o.status === 'PENDING' && o.checkout_url) { await syncOrder(env, request, o); done++; } else skipped++; }
          else if (body.action === 'mark_paid') { if (o.status !== 'PAID') { await activateOrder(env, request, o.order_code, 'admin', null, { mail: !!body.send_receipt }); done++; } else skipped++; }
          else if (body.action === 'cancel') {
            if (o.status === 'PENDING') {
              if (o.checkout_url) { try { await cancelLink(env, o.order_code, 'Admin huy don'); } catch {} }
              await db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE order_code = ?").bind(o.order_code).run(); done++;
            } else skipped++;
          } else return fail('Thao tác không hợp lệ.');
        }
      }
      const names = { sync: 'Đã đối soát', mark_paid: 'Đã kích hoạt', cancel: 'Đã hủy', invoice_issued: 'Đã đánh dấu xuất hóa đơn', delete: 'Đã xóa' };
      await log(env, admin, 'order.bulk.' + body.action, `${done} đơn`, { codes });
      return json({ ok: true, message: `${names[body.action]} ${done} đơn.${skipped ? ` Bỏ qua ${skipped} đơn không phù hợp.` : ''}` });
    }

    /* ---------- Cài đặt ---------- */
    if (path === '/api/admin/settings' && request.method === 'GET') {
      return json({
        packages: cfg.allPackages, globalDaily: cfg.globalDaily, theme: cfg.saved.theme || 'auto', seller: cfg.saved.seller || {}, credits: cfg.credits, watermark: cfg.watermark, host: new URL(env.APP_URL || request.url).host,
        limits: Object.fromEntries(Object.values(cfg.plans).map(p => [p.id, { ttsCalls: p.ttsCalls, maxChars: p.maxChars }])),
        payos: payosConfigured(env), smtp: smtpConfigured(env),
        webhookUrl: `${appUrl(env, request)}/api/payos/webhook`, adminEmail: admin.email
      });
    }
    if (path === '/api/admin/settings' && request.method === 'POST') {
      const patch = {};
      if (Array.isArray(body.packages)) {
        const ids = new Set();
        patch.packages = body.packages.slice(0, 8).map((p, i) => {
          const id = String(p.id || `p${i + 1}`).replace(/[^a-z0-9_-]/gi, '').slice(0, 16) || `p${i + 1}`;
          if (ids.has(id)) throw Object.assign(new Error('Mã gói bị trùng: ' + id), { status: 400 });
          ids.add(id);
          const price = Math.floor(Number(p.price));
          if (!(price >= 2000 && price <= 50000000)) throw Object.assign(new Error(`Giá gói "${p.name}" phải từ 2.000đ đến 50.000.000đ.`), { status: 400 });
          return { id, name: String(p.name || '').trim().slice(0, 30) || id, days: Math.max(1, Math.min(3650, Math.floor(Number(p.days)) || 30)), price, active: p.active !== false };
        });
      }
      if (body.limits && typeof body.limits === 'object') {
        patch.limits = {};
        for (const id of ['guest', 'free', 'premium']) {
          const l = body.limits[id] || {};
          patch.limits[id] = { ttsCalls: Math.max(0, Math.min(100000, Math.floor(Number(l.ttsCalls)) || 0)), maxChars: Math.max(50, Math.min(20000, Math.floor(Number(l.maxChars)) || 500)) };
        }
      }
      if (body.globalDaily) patch.globalDaily = Math.max(100, Math.min(95000, Math.floor(Number(body.globalDaily))));
      const THEMES = ['auto', 'none', 'halloween', 'teachers', 'xmas', 'newyear', 'tet', 'valentine', 'women', 'reunify', 'children', 'national', 'midautumn'];
      if (body.watermark && typeof body.watermark === 'object') {
        const w = body.watermark;
        const vi = String(w.vi || '').trim().slice(0, 300), en = String(w.en || '').trim().slice(0, 300);
        if (w.enabled && (!vi.includes('{domain}') || !en.includes('{domain}'))) throw Object.assign(new Error('Câu ghi nguồn cần có {domain}.'), { status: 400 });
        patch.watermark = { enabled: !!w.enabled, vi, en, exemptPremium: !!w.exemptPremium };
      }
      if (body.credits && typeof body.credits === 'object') {
        const c = body.credits;
        const price = Math.floor(Number(c.price)), min = Math.floor(Number(c.min)), max = Math.floor(Number(c.max));
        if (!(price >= 1 && price <= 1000000)) throw Object.assign(new Error('Giá mỗi lượt phải từ 1đ đến 1.000.000đ.'), { status: 400 });
        if (!(min >= 1 && max >= min && max <= 1000000)) throw Object.assign(new Error('Số lượt tối thiểu / tối đa không hợp lệ.'), { status: 400 });
        const presets = String(c.presets || '').split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n >= min && n <= max).slice(0, 6);
        patch.credits = { enabled: !!c.enabled, price, min, max, presets: presets.length ? presets : [min] };
      }
      if (body.seller && typeof body.seller === 'object') {
        const sv = (k, n) => String(body.seller[k] || '').trim().slice(0, n);
        patch.seller = { name: sv('name', 150), tax_code: sv('tax_code', 20), address: sv('address', 250), email: sv('email', 190), phone: sv('phone', 30), note: sv('note', 500) };
      }
      if (body.theme !== undefined) { if (!THEMES.includes(body.theme)) throw Object.assign(new Error('Giao diện không hợp lệ.'), { status: 400 }); patch.theme = body.theme; }
      await saveConfig(db, patch);
      await log(env, admin, 'settings.update', null, patch);
      return json({ ok: true, message: 'Đã lưu cài đặt.' });
    }

    if (path === '/api/admin/payos/webhook' && request.method === 'POST') {
      if (!payosConfigured(env)) return fail('Chưa cấu hình PAYOS_* cho Worker.', 503);
      const webhookUrl = `${appUrl(env, request)}/api/payos/webhook`;
      await confirmWebhook(env, webhookUrl);
      await log(env, admin, 'payos.webhook', webhookUrl);
      return json({ ok: true, message: `Đã đăng ký webhook: ${webhookUrl}` });
    }

    if (path === '/api/admin/test-email' && request.method === 'POST') {
      const r = await renderEmail(db, 'welcome', sampleVars('welcome'), { appName: 'TXA Voice', appUrl: appUrl(env, request), name: admin.name || 'Admin', email: admin.email });
      await sendMail(env, { to: admin.email, subject: '[Thử SMTP] ' + r.subject, html: r.html, text: r.text });
      return json({ ok: true, message: `Đã gửi email thử tới ${admin.email}.` });
    }

    /* ---------- Mẫu email ---------- */
    if (path === '/api/admin/email-templates') {
      const list = [];
      for (const t of Object.values(TEMPLATES)) {
        const g = await getTemplate(db, t.id);
        list.push({ id: t.id, name: t.name, description: t.description, icon: t.icon, customized: g.customized, updatedAt: g.updatedAt, updatedBy: g.updatedBy });
      }
      return json({ templates: list });
    }
    m = path.match(/^\/api\/admin\/email-templates\/([a-z0-9_-]+)(?:\/(preview|test|reset))?$/);
    if (m) {
      const id = m[1], sub = m[2];
      if (!TEMPLATES[id]) return fail('Không có mẫu này.', 404);
      const ctxS = { appName: 'TXA Voice', appUrl: appUrl(env, request), name: admin.name || admin.email.split('@')[0], email: admin.email };
      const draft = body && typeof body === 'object' ? Object.fromEntries(FIELDS.filter(f => typeof body[f] === 'string').map(f => [f, body[f]])) : null;
      if (!sub && request.method === 'GET') {
        const g = await getTemplate(db, id);
        return json({
          ...g, defaults: Object.fromEntries(FIELDS.map(f => [f, TEMPLATES[id][f]])),
          variables: [...Object.entries(GLOBAL_VARS), ...Object.entries(TEMPLATES[id].variables || {})].map(([k, v]) => ({ key: k, desc: v.desc, block: !!v.block }))
        });
      }
      if (!sub && request.method === 'POST') {
        if (!draft.subject?.trim()) return fail('Tiêu đề email không được để trống.');
        if (!draft.heading?.trim()) return fail('Tiêu đề lớn không được để trống.');
        const v = Object.fromEntries(FIELDS.map(f => [f, f === 'body' ? cleanBody(draft[f] ?? TEMPLATES[id][f]).slice(0, 20000) : String(draft[f] ?? TEMPLATES[id][f] ?? '').slice(0, 500)]));
        await db.prepare(`INSERT INTO email_templates (id, subject, preheader, heading, body, button_text, button_url, note, updated_at, updated_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET subject = excluded.subject, preheader = excluded.preheader, heading = excluded.heading,
          body = excluded.body, button_text = excluded.button_text, button_url = excluded.button_url, note = excluded.note, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
          .bind(id, v.subject, v.preheader, v.heading, v.body, v.button_text, v.button_url, v.note, Date.now(), admin.email).run();
        await log(env, admin, 'email.save', id);
        return json({ ok: true, message: 'Đã lưu mẫu email.' });
      }
      if (sub === 'preview' && request.method === 'POST') {
        const r = await renderEmail(db, id, sampleVars(id), ctxS, draft);
        return json({ subject: r.subject, html: r.html, text: r.text });
      }
      if (sub === 'test' && request.method === 'POST') {
        const r = await renderEmail(db, id, sampleVars(id), ctxS, draft);
        await sendMail(env, { to: admin.email, subject: '[Thử] ' + r.subject, html: r.html, text: r.text });
        return json({ ok: true, message: `Đã gửi email thử tới ${admin.email}.` });
      }
      if (sub === 'reset' && request.method === 'POST') {
        await db.prepare('DELETE FROM email_templates WHERE id = ?').bind(id).run();
        await log(env, admin, 'email.reset', id);
        return json({ ok: true, message: 'Đã khôi phục mẫu mặc định.' });
      }
    }

    if (path === '/api/admin/logs') {
      const page = Math.max(0, Number(q('page', '0')) || 0);
      const { results } = await db.prepare('SELECT * FROM admin_logs ORDER BY id DESC LIMIT 50 OFFSET ?').bind(page * 50).all();
      return json({ logs: results, page });
    }

    return fail('Không tìm thấy.', 404);
  } catch (e) {
    return fail(e.message || 'Lỗi máy chủ.', e.status || 500);
  }
}
