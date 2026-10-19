// Mua gói Premium qua payOS. Không phụ thuộc webhook: trang chờ / trang quay về tự hỏi payOS và kích hoạt.
import { getConfig } from './config.js';
import { calcCreditsPrice } from './plans.js';
import { effectivePlan } from './quota.js';
import { payosConfigured, newOrderCode, makeDescription, createLink, getLink, cancelLink, verifyWebhook } from './payos.js';
import { getUser, json, readBody, shieldResponse } from './auth.js';
import { sendMail } from './mailer.js';
import { renderEmail, orderTable } from './emails.js';
import { renderInvoice } from './invoice.js';

const appUrl = (env, request) => (env.APP_URL || new URL(request.url).origin).replace(/\/$/, '');
const isAdmin = (env, u) => !!u && (u.role === 'admin' || String(env.ADMIN_EMAILS || '').toLowerCase().split(',').map(s => s.trim()).includes(u.email));

export function publicOrder(o) {
  if (!o) return null;
  return {
    orderCode: o.order_code, packageId: o.package_id, packageName: o.package_name, days: o.days, amount: o.amount,
    status: o.status, description: o.description, checkoutUrl: o.checkout_url, qrCode: o.qr_code,
    bankBin: o.bank_bin, accountNumber: o.account_number, accountName: o.account_name,
    expiredAt: o.expired_at, createdAt: o.created_at, paidAt: o.paid_at, paidVia: o.paid_via, kind: o.kind || 'premium', credits: o.credits || 0,
    invoice: o.invoice ? JSON.parse(o.invoice) : null, invoiceNo: o.invoice_no || null, invoiceIssuedAt: o.invoice_issued_at || null
  };
}

/** Đánh dấu đã trả tiền + cộng ngày Premium. Trả về true nếu lần này mới kích hoạt (an toàn khi gọi nhiều lần). */
export async function activateOrder(env, request, orderCode, via, reference = null, opts = {}) {
  const now = Date.now();
  const order = await env.DB.prepare(
    "UPDATE orders SET status = 'PAID', paid_at = ?, paid_via = ?, reference = COALESCE(?, reference) WHERE order_code = ? AND status != 'PAID' RETURNING *"
  ).bind(now, via, reference, orderCode).first();
  if (!order) return false;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(order.user_id).first();
  if (!user) return true;
  let expires = user.plan_expires;
  if (order.kind === 'credits') {
    await env.DB.prepare('UPDATE users SET extra_credits = extra_credits + ? WHERE id = ?').bind(order.credits, user.id).run();
  } else {
    const lifetime = user.plan === 'premium' && !user.plan_expires;
    const base = user.plan === 'premium' && user.plan_expires > now ? user.plan_expires : now;
    expires = lifetime ? null : base + order.days * 86400000;
    await env.DB.prepare("UPDATE users SET plan = 'premium', plan_expires = ? WHERE id = ?").bind(expires, user.id).run();
  }
  if (opts.mail === false) return true;
  try {
    const base = appUrl(env, request);
    const until = expires ? new Date(expires).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'vĩnh viễn';
    const money = Number(order.amount).toLocaleString('vi-VN') + 'đ';
    const inv = order.invoice ? JSON.parse(order.invoice) : null;
    const isCredits = order.kind === 'credits';
    const itemName = isCredits ? `${Number(order.credits).toLocaleString('vi-VN')} lượt Edge/CapCut mua thêm` : `Premium ${order.package_name}`;
    const mail = await renderEmail(env.DB, 'receipt', {
      item_name: itemName,
      order_code: order.order_code, package_name: order.package_name, amount: money, description: order.description,
      expires_date: until, paid_date: new Date(now).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      invoice_url: `${base}/invoice/${order.order_code}`,
      invoice_line: inv ? `Thông tin xuất hóa đơn cho ${inv.name}${inv.tax_code ? ' (MST ' + inv.tax_code + ')' : ''} đã được ghi nhận.` : '',
      order_table: orderTable([['Mã đơn', '#' + order.order_code], [isCredits ? 'Sản phẩm' : 'Gói', itemName], ['Số tiền', money], ['Nội dung chuyển khoản', order.description], isCredits ? ['Lượt mua thêm hiện có', (Number(user.extra_credits || 0) + Number(order.credits)).toLocaleString('vi-VN') + ' lượt'] : ['Hiệu lực đến', until]])
    }, { appName: 'VoiceKit', appUrl: base, name: user.name || user.email.split('@')[0], email: user.email });
    await sendMail(env, { to: user.email, ...mail });
    if (inv?.email && inv.email !== user.email) { try { await sendMail(env, { to: inv.email, ...mail }); } catch {} }
  } catch (e) { console.log('receipt mail failed', e.message); }
  return true;
}

/** Hỏi payOS trạng thái đơn đang chờ và cập nhật D1. */
export async function syncOrder(env, request, order) {
  if (order.status !== 'PENDING' || !payosConfigured(env)) return order;
  try {
    const link = await getLink(env, order.order_code);
    if (link.status === 'PAID' || (link.amountPaid >= order.amount && order.amount > 0)) {
      await activateOrder(env, request, order.order_code, 'check', link.transactions?.[0]?.reference || null);
    } else if (link.status === 'CANCELLED' || link.status === 'EXPIRED') {
      await env.DB.prepare("UPDATE orders SET status = ? WHERE order_code = ? AND status = 'PENDING'").bind(link.status, order.order_code).run();
    }
  } catch (e) {
    // Hết hạn theo giờ mà payOS chưa báo -> coi như hết hạn
    if (order.expired_at && order.expired_at * 1000 < Date.now() - 120000) {
      await env.DB.prepare("UPDATE orders SET status = 'EXPIRED' WHERE order_code = ? AND status = 'PENDING'").bind(order.order_code).run();
    }
  }
  return await env.DB.prepare('SELECT * FROM orders WHERE order_code = ?').bind(order.order_code).first();
}

export async function handleBilling(request, env, path) {
  const fail = (error, status = 400) => shieldResponse({ error }, request, status);
  const ok = (data, status = 200) => shieldResponse(data, request, status);
  if (!env.DB) return fail('Website chưa bật tài khoản.', 503);
  try {
    // Webhook payOS: không cần đăng nhập, xác thực bằng chữ ký
    if (path === '/api/payos/webhook' && request.method === 'POST') {
      if (!payosConfigured(env)) return json({ success: false }, 503);
      const body = await request.json().catch(() => ({}));
      if (!(await verifyWebhook(env, body.data, body.signature))) return json({ error: 'Sai chữ ký' }, 400);
      const code = Number(body.data?.orderCode);
      const order = code ? await env.DB.prepare('SELECT * FROM orders WHERE order_code = ?').bind(code).first() : null;
      if (order && body.success && body.data?.code === '00' && Number(body.data.amount) >= order.amount) {
        await activateOrder(env, request, code, 'webhook', body.data.reference || null);
      }
      return json({ success: true }); // luôn 200 (kể cả webhook thử của payOS khi đăng ký)
    }

    const cfg = await getConfig(env.DB);
    if (path === '/api/pay/packages' && request.method === 'GET') {
      return ok({ enabled: payosConfigured(env), packages: cfg.packages, credits: { ...cfg.credits, enabled: cfg.credits.enabled && payosConfigured(env) } });
    }

    const user = await getUser(request, env);
    if (!user) return fail('Bạn cần đăng nhập để thanh toán.', 401);

    if (path === '/api/pay/create' && request.method === 'POST') {
      if (!payosConfigured(env)) return fail('Website chưa cấu hình cổng thanh toán payOS.', 503);
      if (!user.verified) return fail('Hãy xác minh email trước khi mua gói Premium.', 403);
      const { packageId, invoice, kind, quantity } = await readBody(request).catch(() => ({}));
      let invoiceJson = null;
      if (invoice && invoice.enabled) {
        const inv = {
          type: invoice.type === 'company' ? 'company' : 'personal',
          name: String(invoice.name || '').trim().slice(0, 150),
          tax_code: String(invoice.tax_code || '').trim().slice(0, 20),
          address: String(invoice.address || '').trim().slice(0, 250),
          email: String(invoice.email || '').trim().toLowerCase().slice(0, 190)
        };
        if (!inv.name) return fail(inv.type === 'company' ? 'Nhập tên công ty để xuất hóa đơn.' : 'Nhập họ tên người mua để xuất hóa đơn.');
        if (inv.type === 'company' && !/^\d{10}(-\d{3})?$/.test(inv.tax_code)) return fail('Mã số thuế phải gồm 10 số (hoặc 10 số + "-" + 3 số).');
        if (inv.tax_code && !/^\d{10}(-\d{3})?$/.test(inv.tax_code)) return fail('Mã số thuế không hợp lệ.');
        if (inv.type === 'company' && !inv.address) return fail('Nhập địa chỉ công ty để xuất hóa đơn.');
        if (inv.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(inv.email)) return fail('Email nhận hóa đơn không hợp lệ.');
        invoiceJson = JSON.stringify(inv);
      }
      let pkg;
      if (kind === 'credits') {
        if (!cfg.credits.enabled) return fail('Tạm ngừng bán lượt.');
        if (effectivePlan(user, cfg).id !== 'premium') return fail('Chỉ tài khoản Premium mới mua thêm lượt được.', 403);
        const qty = Math.floor(Number(quantity));
        if (!(qty >= cfg.credits.min && qty <= cfg.credits.max)) return fail(`Số lượt mua từ ${cfg.credits.min.toLocaleString('vi-VN')} đến ${cfg.credits.max.toLocaleString('vi-VN')}.`);
        const amount = calcCreditsPrice(qty, cfg.credits.price);
        if (amount < 2000) return fail('Tổng tiền tối thiểu 2.000đ, hãy mua nhiều lượt hơn.');
        pkg = { id: 'credits', name: `${qty.toLocaleString('vi-VN')} lượt`, days: 0, price: amount, kind: 'credits', credits: qty };
      } else {
        pkg = cfg.packages.find(p => p.id === packageId);
        if (!pkg) return fail('Gói không tồn tại hoặc đã ngừng bán.');
        pkg = { ...pkg, kind: 'premium', credits: 0 };
      }

      // Dùng lại đơn đang chờ cùng gói, cùng giá nếu còn hạn
      const pending = await env.DB.prepare(
        "SELECT * FROM orders WHERE user_id = ? AND package_id = ? AND amount = ? AND status = 'PENDING' AND expired_at > ? ORDER BY created_at DESC LIMIT 1"
      ).bind(user.id, pkg.id, pkg.price, Math.floor(Date.now() / 1000) + 90).first();
      if (pending) {
        if ((pending.invoice || null) !== invoiceJson) {
          await env.DB.prepare('UPDATE orders SET invoice = ? WHERE order_code = ?').bind(invoiceJson, pending.order_code).run();
          pending.invoice = invoiceJson;
        }
        return ok({ order: publicOrder(pending), reused: true });
      }

      const orderCode = newOrderCode();
      const description = makeDescription(env, orderCode, pkg.kind);
      const base = appUrl(env, request);
      const link = await createLink(env, {
        orderCode, amount: pkg.price, description,
        itemName: pkg.kind === 'credits' ? `VoiceKit ${pkg.name} Edge/CapCut` : `VoiceKit Premium ${pkg.name}`,
        buyerName: user.name, buyerEmail: user.email,
        returnUrl: `${base}/?pay=return&order=${orderCode}`,
        cancelUrl: `${base}/?pay=cancel&order=${orderCode}`
      });
      const order = await env.DB.prepare(
        `INSERT INTO orders (order_code, user_id, package_id, package_name, days, amount, description, checkout_url, qr_code,
          bank_bin, account_number, account_name, payment_link_id, expired_at, created_at, invoice, kind, credits)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      ).bind(orderCode, user.id, pkg.id, pkg.name, pkg.days, pkg.price, description, link.checkoutUrl, link.qrCode,
        link.bin || null, link.accountNumber || null, link.accountName || null, link.paymentLinkId || null, link.expiredAt, Date.now(), invoiceJson, pkg.kind, pkg.credits).first();
      return ok({ order: publicOrder(order) }, 201);
    }

    if (path === '/api/pay/my-orders' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').bind(user.id).all();
      return ok({ orders: results.map(publicOrder) });
    }

    const m = path.match(/^\/api\/pay\/order\/(\d+)(\/cancel)?$/);
    if (m) {
      let order = await env.DB.prepare('SELECT * FROM orders WHERE order_code = ?').bind(Number(m[1])).first();
      if (!order || (order.user_id !== user.id && !isAdmin(env, user))) return fail('Không tìm thấy đơn hàng.', 404);
      if (m[2] && request.method === 'POST') {
        if (order.status === 'PENDING') {
          try { await cancelLink(env, order.order_code); } catch {}
          await env.DB.prepare("UPDATE orders SET status = 'CANCELLED' WHERE order_code = ? AND status = 'PENDING'").bind(order.order_code).run();
        }
        order = await env.DB.prepare('SELECT * FROM orders WHERE order_code = ?').bind(order.order_code).first();
        return ok({ order: publicOrder(order) });
      }
      if (request.method === 'GET') {
        order = await syncOrder(env, request, order);
        return ok({ order: publicOrder(order) });
      }
    }
    return fail('Không tìm thấy.', 404);
  } catch (e) {
    return fail(e.message || 'Lỗi thanh toán.', e.status || 500);
  }
}

/** GET /invoice/<mã đơn>: trang hóa đơn in được (chủ đơn hoặc admin) */
export async function handleInvoice(request, env, path) {
  const code = Number(path.split('/')[2]);
  const page = (msg, status) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font-family:system-ui;background:#0b0d14;color:#e9ecf5;display:grid;place-items:center;min-height:100vh;margin:0"><div style="text-align:center"><h2>${msg}</h2><a href="/" style="color:#22d3ee">← Về trang chủ</a></div></body>`, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  if (!env.DB || !code) return page('Không tìm thấy hóa đơn.', 404);
  const user = await getUser(request, env);
  if (!user) return page('Hãy đăng nhập để xem hóa đơn.', 401);
  const order = await env.DB.prepare('SELECT * FROM orders WHERE order_code = ?').bind(code).first();
  if (!order || (order.user_id !== user.id && !isAdmin(env, user))) return page('Không tìm thấy hóa đơn.', 404);
  const owner = order.user_id === user.id ? user : await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(order.user_id).first();
  const cfg = await getConfig(env.DB);
  return new Response(renderInvoice({ order, user: owner, seller: cfg.saved.seller || {}, appName: 'VoiceKit' }), {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' }
  });
}
