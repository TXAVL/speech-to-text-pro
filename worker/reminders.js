// Nhắc hạn Premium: chạy mỗi ngày lúc 9h sáng giờ Việt Nam (cron trong wrangler.toml), gửi
//  - "Premium sắp hết hạn" cho tài khoản còn tối đa 3 ngày
//  - "Premium đã hết hạn" cho tài khoản vừa hết hạn trong 3 ngày qua
// Mỗi kỳ hạn chỉ gửi một lần (đánh dấu bằng cột expiry_notice / expired_notice, xem migrations/0005_reminders.sql);
// gia hạn xong thì plan_expires đổi nên kỳ hạn mới lại được nhắc.
import { getConfig } from './config.js';
import { renderEmail } from './emails.js';
import { sendMail, smtpConfigured } from './mailer.js';

const DAY = 86400000;
const WINDOW = 3 * DAY;
const MAX_PER_RUN = 100; // giữ trong giới hạn gửi mail của SMTP (Gmail ~500 thư/ngày)
const vnDate = (ms) => new Date(ms).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

/** opts.dry: chỉ liệt kê người sẽ nhận, không gửi và không đánh dấu */
export async function sendExpiryReminders(env, { dry = false } = {}) {
  const out = { expiring: [], expired: [], sent: 0, failed: 0, skipped: '' };
  if (!env.DB) return { ...out, skipped: 'Website chưa bật tài khoản.' };
  const cfg = await getConfig(env.DB);
  const base = String(env.APP_URL || cfg.saved.siteUrl || '').replace(/\/$/, '');
  if (!dry && !smtpConfigured(env)) return { ...out, skipped: 'Chưa cấu hình SMTP.' };
  if (!dry && !base) return { ...out, skipped: 'Chưa biết địa chỉ website: mở trang Quản trị một lần hoặc đặt APP_URL trong wrangler.toml.' };

  const now = Date.now();
  const q = (cond, col) => env.DB.prepare(
    `SELECT id, email, name, plan_expires FROM users WHERE plan = 'premium' AND plan_expires IS NOT NULL AND verified = 1 AND banned = 0
     AND ${cond} AND COALESCE(${col}, 0) != plan_expires ORDER BY plan_expires LIMIT ${MAX_PER_RUN}`);
  const soon = (await q('plan_expires > ? AND plan_expires <= ?', 'expiry_notice').bind(now, now + WINDOW).all()).results || [];
  const gone = (await q('plan_expires <= ? AND plan_expires > ?', 'expired_notice').bind(now, now - WINDOW).all()).results || [];
  const brief = (u) => ({ email: u.email, expires: vnDate(u.plan_expires) });
  out.expiring = soon.map(brief);
  out.expired = gone.map(brief);
  if (dry) return out;

  const deliver = async (u, id, vars, column) => {
    try {
      const ctx = { appName: 'TXA Voice', appUrl: base, name: u.name || u.email.split('@')[0], email: u.email };
      await sendMail(env, { to: u.email, ...(await renderEmail(env.DB, id, vars, ctx)) });
      await env.DB.prepare(`UPDATE users SET ${column} = ? WHERE id = ?`).bind(u.plan_expires, u.id).run();
      out.sent++;
    } catch (e) { out.failed++; console.log('reminder failed', id, u.email, e.message); }
  };
  for (const u of soon) await deliver(u, 'premium_expiring', { expires_date: vnDate(u.plan_expires), days_left: Math.max(1, Math.ceil((u.plan_expires - now) / DAY)) }, 'expiry_notice');
  for (const u of gone) await deliver(u, 'premium_expired', { expired_date: vnDate(u.plan_expires) }, 'expired_notice');
  return out;
}
