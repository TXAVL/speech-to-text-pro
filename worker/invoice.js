// Trang biên nhận thanh toán in được: /invoice/<mã đơn>
// Chứng từ xác nhận giao dịch điện tử cho TXA Voice
import QRCode from 'qrcode/lib/core/qrcode.js';
import SvgRenderer from 'qrcode/lib/renderer/svg.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + ' ₫';

function vnDate(t, withTime = false) {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false } : {})
  });
}

/** Đọc chữ số tiền tiếng Việt (đến hàng tỷ) */
function moneyWords(n) {
  const d = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  const three = (x, full) => {
    const h = Math.floor(x / 100), t = Math.floor(x % 100 / 10), u = x % 10, out = [];
    if (h || full) out.push(d[h], 'trăm');
    if (t > 1) { out.push(d[t], 'mươi'); if (u === 1) out.push('mốt'); else if (u === 5) out.push('lăm'); else if (u) out.push(d[u]); }
    else if (t === 1) { out.push('mười'); if (u === 5) out.push('lăm'); else if (u) out.push(d[u]); }
    else if (u) { if (h || full) out.push('lẻ'); out.push(d[u]); }
    return out.join(' ');
  };
  if (!n) return 'Không đồng';
  const units = ['', 'nghìn', 'triệu', 'tỷ'], parts = [], groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  let first = true;
  for (let k = groups.length - 1; k >= 0; k--) {
    if (groups[k]) { parts.push(three(groups[k], !first) + (units[k] ? ' ' + units[k] : '')); first = false; }
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim() + ' đồng';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Tạo SVG QR code chuẩn vector, có quiet zone (margin: 2) để camera điện thoại quét tức thì */
function generateQrSvg(text) {
  try {
    const data = QRCode.create(text, { errorCorrectionLevel: 'M' });
    return SvgRenderer.render(data, { margin: 2 });
  } catch (err) {
    console.error('QR code generation error:', err);
    return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" fill="#f1f5f9"/><text x="50" y="55" text-anchor="middle" font-size="11" fill="#64748b">QR</text></svg>`;
  }
}

const STATUS = {
  PAID: { label: 'ĐÃ THANH TOÁN', sub: 'Giao dịch thành công', cls: 'paid', icon: '✓' },
  PENDING: { label: 'CHỜ THANH TOÁN', sub: 'Chưa nhận được chuyển khoản', cls: 'pending', icon: '⏳' },
  CANCELLED: { label: 'ĐÃ HỦY', sub: 'Đơn hàng đã hủy', cls: 'void', icon: '✕' },
  EXPIRED: { label: 'HẾT HẠN', sub: 'Quá thời hạn thanh toán', cls: 'void', icon: '!' }
};

const PAID_VIA = {
  webhook: 'VietQR · payOS (Tự động 24/7)',
  check: 'VietQR · payOS (Tự động 24/7)',
  admin: 'Chuyển khoản · Admin kích hoạt thủ công'
};

export function renderInvoice({ order, user = {}, seller = {}, appName = 'TXA Voice', baseUrl = '' }) {
  const inv = order.invoice ? (typeof order.invoice === 'string' ? JSON.parse(order.invoice) : order.invoice) : null;
  const isCompany = inv?.type === 'company';
  const buyerName = inv?.name || user.name || (user.email ? user.email.split('@')[0] : 'Khách hàng');
  const buyerEmail = inv?.email || user.email || '—';
  const st = STATUS[order.status] || STATUS.PENDING;
  const paid = order.status === 'PAID';

  const sellerPhone = seller.phone && seller.phone !== '0981 246 899' ? seller.phone : '0389 077 187';
  const sellerName = seller.name || 'TĂNG XUÂN ANH';
  const sellerAddress = seller.address || 'Xã Hà Nam, thành phố Hải Phòng, Việt Nam';
  const sellerEmail = seller.email || 'txasoftdev@gmail.com';
  const sellerBank = seller.bank || 'VQRQAMXZO2074 (TANG XUAN ANH) tại Ngân hàng TMCP Quân Đội (MB Bank)';

  const sellerRows = [
    ['Mã số thuế', seller.tax_code],
    ['Địa chỉ', sellerAddress],
    ['Điện thoại', sellerPhone, false, `tel:${sellerPhone.replace(/\s+/g, '')}`],
    ['Email', sellerEmail, false, `mailto:${sellerEmail}`],
    ['Tài khoản', sellerBank]
  ].filter(r => r[1]);

  const buyerRows = [
    [isCompany ? 'Đơn vị / Công ty' : 'Họ và tên', buyerName, true],
    ['Email liên hệ', buyerEmail],
    ['Mã số thuế', inv?.tax_code],
    ['Địa chỉ', inv?.address]
  ].filter(r => r[1]);

  const receiptNo = `TXA-${order.order_code}`;
  const isCredits = order.kind === 'credits';
  const qty = isCredits ? Number(order.credits || 0) : 1;
  const itemName = isCredits
    ? `Gói ${qty.toLocaleString('vi-VN')} lượt tạo giọng AI`
    : `${appName} Premium · ${order.package_name || 'Gói trả phí'}`;
  const itemNote = isCredits
    ? 'Lượt tạo giọng AI cộng dồn vào tài khoản, không hết hạn theo ngày, ưu tiên trừ khi hết lượt ngày.'
    : `Quyền sử dụng toàn bộ tính năng cao cấp Premium trong ${Number(order.days || 30).toLocaleString('vi-VN')} ngày kể từ khi kích hoạt.`;
  const unitPrice = isCredits && qty ? Math.round(order.amount / qty) : order.amount;

  const viewUrl = `${baseUrl}/invoice/${order.order_code}`;
  const qrSvg = generateQrSvg(viewUrl);

  const renderKv = (list) => list.map(([k, v, strong, link]) => {
    const valHtml = link
      ? `<a href="${esc(link)}" class="kv-link">${esc(v)}</a>`
      : `<b class="${strong ? 'strong' : ''}">${esc(v)}</b>`;
    return `<div class="kv"><span class="k">${k}:</span>${valHtml}</div>`;
  }).join('');

  const invoiceInfo = order.invoice_no
    ? `<div class="note ok"><div class="note-icon">🧾</div><div><b>Hóa đơn điện tử đã phát hành:</b> số <code>${esc(order.invoice_no)}</code>${order.invoice_issued_at ? `, ngày ${vnDate(order.invoice_issued_at)}` : ''}. Bản gốc hóa đơn đã được gửi tới địa chỉ <b>${esc(buyerEmail)}</b>.</div></div>`
    : inv
      ? `<div class="note info"><div class="note-icon">ℹ️</div><div><b>Yêu cầu xuất hóa đơn đã ghi nhận:</b> Thông tin hóa đơn GTGT đã được chuyển tới bộ phận kế toán và sẽ gửi về <b>${esc(buyerEmail)}</b> khi phát hành.</div></div>`
      : '';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Biên nhận thanh toán ${receiptNo} · ${esc(appName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #0f172a;
      --ink-2: #334155;
      --muted: #64748b;
      --line: #e2e8f0;
      --line-subtle: #f1f5f9;
      --soft: #f8fafc;
      --brand: #4f46e5;
      --brand-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 35%, #312e81 75%, #4338ca 100%);
      --ok: #059669;
      --ok-bg: #ecfdf5;
      --warn: #d97706;
      --warn-bg: #fffbeb;
      --void: #64748b;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; color: var(--ink); line-height: 1.55; -webkit-font-smoothing: antialiased;
      font-family: 'Be Vietnam Pro', system-ui, -apple-system, sans-serif;
      background: radial-gradient(1000px 500px at 15% -5%, rgba(99, 102, 241, .14), transparent 60%),
                  radial-gradient(900px 450px at 85% 0%, rgba(14, 165, 233, .12), transparent 60%), #eef2f7;
      min-height: 100vh;
      padding-bottom: 40px;
    }

    /* Thanh điều hướng */
    .bar {
      max-width: 820px; margin: 0 auto; padding: 22px 16px 0;
      display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
    }
    .bar a.back {
      color: var(--ink-2); text-decoration: none; font-weight: 600; font-size: 14px;
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 8px; transition: .15s;
    }
    .bar a.back:hover { color: var(--brand); background: rgba(255, 255, 255, 0.6); }
    .bar .acts { display: flex; gap: 10px; flex-wrap: wrap; }
    .btn {
      font: inherit; font-size: 13.5px; font-weight: 600; padding: 9px 18px; border-radius: 10px; cursor: pointer;
      display: inline-flex; align-items: center; gap: 8px; border: 1px solid var(--line); background: #ffffff;
      color: var(--ink-2); transition: all .15s ease; box-shadow: 0 1px 3px rgba(0, 0, 0, .04);
    }
    .btn:hover { border-color: #cbd5e1; background: #f8fafc; color: var(--ink); transform: translateY(-1px); }
    .btn.primary {
      background: linear-gradient(135deg, #4f46e5, #3b82f6); color: #ffffff; border-color: transparent;
      box-shadow: 0 4px 14px rgba(79, 70, 229, .35);
    }
    .btn.primary:hover { background: linear-gradient(135deg, #4338ca, #2563eb); box-shadow: 0 6px 20px rgba(79, 70, 229, .45); }
    .btn svg { width: 16px; height: 16px; flex-shrink: 0; }

    /* Khối biên nhận */
    .paper {
      max-width: 820px; margin: 18px auto 0; background: #ffffff; border-radius: 20px; overflow: hidden;
      border: 1px solid rgba(226, 232, 240, 0.9);
      box-shadow: 0 25px 60px -15px rgba(15, 23, 42, .12), 0 4px 12px rgba(15, 23, 42, .04);
      position: relative;
    }

    /* Đầu trang biên nhận */
    .hero {
      position: relative; padding: 34px 38px 30px; color: #ffffff; overflow: hidden;
      background: var(--brand-gradient);
    }
    .hero::before {
      content: ''; position: absolute; inset: 0;
      background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
      background-size: 20px 20px; opacity: 0.5; pointer-events: none;
    }
    .hero::after {
      content: ''; position: absolute; right: -40px; top: -60px; width: 260px; height: 260px; border-radius: 50%;
      background: radial-gradient(circle, rgba(129, 140, 248, 0.35), transparent 70%); pointer-events: none;
    }
    .hero-top {
      display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; position: relative; z-index: 1;
    }
    .brand { display: flex; align-items: center; gap: 14px; }
    .logo {
      width: 48px; height: 48px; border-radius: 14px; display: grid; place-items: center;
      background: rgba(255, 255, 255, 0.14); border: 1px solid rgba(255, 255, 255, 0.28);
      backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }
    .logo svg { width: 26px; height: 26px; fill: #ffffff; }
    .brand b { display: block; font-size: 21px; font-weight: 800; letter-spacing: -0.3px; line-height: 1.2; }
    .brand small { display: block; opacity: 0.85; font-size: 13px; font-weight: 500; margin-top: 2px; }

    .doc { text-align: right; }
    .doc .badge-title {
      display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase;
      background: rgba(255, 255, 255, 0.16); padding: 4px 10px; border-radius: 6px;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }
    .doc .n {
      font-size: 19px; font-weight: 800; margin-top: 6px; font-family: 'JetBrains Mono', monospace; letter-spacing: 0.5px;
    }
    .doc .d { font-size: 13px; opacity: 0.85; margin-top: 3px; }

    .amount-bar {
      position: relative; z-index: 1; margin-top: 28px; padding-top: 22px;
      border-top: 1px solid rgba(255, 255, 255, 0.18);
      display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap;
    }
    .amount-bar .lbl { font-size: 12.5px; opacity: 0.85; font-weight: 500; text-transform: uppercase; letter-spacing: 0.8px; }
    .amount-bar .v {
      font-size: 38px; font-weight: 800; letter-spacing: -1px; line-height: 1.1; font-variant-numeric: tabular-nums;
      margin-top: 4px; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    }

    .pill {
      display: inline-flex; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.3px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
      background: #ffffff;
    }
    .pill i {
      width: 9px; height: 9px; border-radius: 50%; background: currentColor; display: inline-block;
      box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.2);
    }
    .pill.paid { color: var(--ok); background: #ffffff; }
    .pill.pending { color: var(--warn); background: #ffffff; }
    .pill.void { color: var(--void); background: #ffffff; }

    /* Thân biên lai */
    .body { padding: 32px 38px 36px; }

    /* Bên bán & Khách hàng */
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .party {
      border: 1px solid var(--line); border-radius: 16px; padding: 18px 20px; background: var(--soft);
      position: relative;
    }
    .party .party-head {
      display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
    }
    .party h3 {
      margin: 0; font-size: 11.5px; font-weight: 700; letter-spacing: 1.2px; text-transform: uppercase;
      color: var(--brand); display: flex; align-items: center; gap: 6px;
    }
    .party .party-name { font-size: 16px; font-weight: 800; color: var(--ink); margin-bottom: 10px; line-height: 1.3; }
    .kv { display: flex; gap: 10px; font-size: 13px; padding: 3.5px 0; align-items: baseline; }
    .kv .k { color: var(--muted); width: 85px; flex: none; font-size: 12.5px; }
    .kv b { font-weight: 600; color: var(--ink-2); word-break: break-word; }
    .kv b.strong { font-weight: 800; color: var(--ink); }
    .kv-link { color: var(--brand); text-decoration: none; font-weight: 600; word-break: break-all; }
    .kv-link:hover { text-decoration: underline; }

    /* Bảng chi tiết dịch vụ */
    .table-wrap { margin-top: 28px; border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; font-size: 13.5px; background: #ffffff; }
    thead tr { background: #f8fafc; border-bottom: 1.5px solid var(--line); }
    th {
      text-align: left; font-size: 11.5px; letter-spacing: 0.8px; text-transform: uppercase; color: var(--muted);
      font-weight: 700; padding: 12px 14px;
    }
    td { padding: 16px 14px; border-bottom: 1px solid var(--line); vertical-align: top; }
    tbody tr:last-child td { border-bottom: none; }
    th.r, td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th.c, td.c { text-align: center; }
    .item-title { font-size: 14.5px; font-weight: 700; color: var(--ink); margin-bottom: 3px; }
    .item-desc { color: var(--muted); font-size: 12.5px; line-height: 1.45; }

    /* Tổng cộng và số tiền bằng chữ */
    .sum-section {
      display: grid; grid-template-columns: 1fr 310px; gap: 24px; margin-top: 24px; align-items: start;
    }
    .sum-left { display: flex; flex-direction: column; gap: 14px; }
    .words-box {
      font-size: 13px; color: var(--ink-2); background: #f8fafc; border-radius: 12px; padding: 14px 16px;
      border: 1px solid var(--line);
    }
    .words-box .lbl {
      display: block; font-size: 11px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase;
      color: var(--muted); margin-bottom: 4px;
    }
    .words-box .txt { font-weight: 600; color: var(--ink); font-style: italic; }

    .note-disclaimer {
      font-size: 12px; color: var(--muted); line-height: 1.5; background: #ffffff;
      padding: 10px 14px; border-radius: 10px; border: 1px dashed var(--line);
    }

    .totals {
      position: relative; background: #f8fafc; border: 1px solid var(--line); border-radius: 14px; padding: 16px 18px;
    }
    .totals .row {
      display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }
    .totals .row.final {
      border-top: 1.5px solid var(--line); margin-top: 8px; padding-top: 12px; font-size: 17px;
      font-weight: 800; color: var(--ink);
    }
    .totals .row.final .val { color: var(--brand); font-size: 19px; }

    /* Con dấu thanh toán điện tử */
    .stamp-wrap {
      position: absolute; right: 8px; top: -50px; pointer-events: none; transform: rotate(-10deg);
    }
    .stamp {
      border: 3px double var(--ok); color: var(--ok); border-radius: 12px; padding: 6px 16px;
      font-weight: 900; letter-spacing: 2px; font-size: 16px; text-transform: uppercase;
      background: rgba(236, 253, 245, 0.85); box-shadow: 0 4px 12px rgba(5, 150, 105, 0.15);
      display: inline-flex; align-items: center; gap: 6px;
    }

    /* Thanh thông tin giao dịch */
    .pay-strip {
      margin-top: 26px; display: grid; grid-template-columns: repeat(4, 1fr);
      border: 1px solid var(--line); border-radius: 14px; overflow: hidden; background: #ffffff;
    }
    .pay-strip .col { padding: 14px 16px; }
    .pay-strip .col + .col { border-left: 1px solid var(--line); }
    .pay-strip span { display: block; font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 3px; }
    .pay-strip b { font-size: 13.5px; font-weight: 700; color: var(--ink); word-break: break-all; }
    .pay-strip code { font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 700; color: var(--ink); }

    /* Thông báo hóa đơn */
    .note {
      margin-top: 20px; font-size: 13px; padding: 14px 18px; border-radius: 12px; display: flex; gap: 12px; align-items: flex-start;
    }
    .note-icon { font-size: 18px; flex-shrink: 0; }
    .note.ok { background: var(--ok-bg); border: 1px solid #a7f3d0; color: #065f46; }
    .note.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
    .note code { background: rgba(0, 0, 0, 0.06); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight: 700; }

    /* Chân biên nhận có mã QR chuẩn vector */
    .foot {
      display: flex; justify-content: space-between; align-items: center; gap: 24px;
      padding: 24px 38px; background: #f8fafc; border-top: 1px dashed #cbd5e1;
    }
    .foot-info { font-size: 12.5px; color: var(--muted); max-width: 480px; }
    .foot-info p { margin: 0 0 6px; line-height: 1.5; }
    .foot-info p:last-child { margin-bottom: 0; }
    .foot-info b { color: var(--ink-2); }
    .foot-info a { color: var(--brand); text-decoration: none; font-weight: 600; }
    .foot-info a:hover { text-decoration: underline; }

    .qr-card {
      display: flex; align-items: center; gap: 14px; flex: none; text-align: left;
      background: #ffffff; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--line);
      box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
    }
    .qr-frame {
      display: block; width: 88px; height: 88px; flex-shrink: 0;
      background: #ffffff; padding: 2px; border: 1px solid #e2e8f0; border-radius: 6px;
    }
    .qr-frame svg { width: 100%; height: 100%; display: block; shape-rendering: crispEdges; }
    .qr-label { font-size: 11.5px; color: var(--ink-2); line-height: 1.4; max-width: 140px; }
    .qr-label b { display: block; font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 2px; }
    .qr-label small { color: var(--muted); font-size: 11px; display: block; margin-top: 4px; }

    /* Toast */
    .toast {
      position: fixed; left: 50%; bottom: 26px; transform: translate(-50%, 40px); opacity: 0; transition: .25s ease; pointer-events: none;
      background: #0f172a; color: #ffffff; padding: 11px 22px; border-radius: 999px; font-size: 13.5px; font-weight: 600;
      box-shadow: 0 12px 30px rgba(0, 0, 0, .35); z-index: 999;
    }
    .toast.show { transform: translate(-50%, 0); opacity: 1; }

    @media (max-width: 720px) {
      .paper { margin: 12px 10px 24px; border-radius: 16px; }
      .hero, .body { padding-left: 20px; padding-right: 20px; }
      .hero-top { flex-direction: column; gap: 16px; }
      .doc { text-align: left; }
      .amount-bar .v { font-size: 30px; }
      .parties, .sum-section { grid-template-columns: 1fr; }
      .pay-strip { grid-template-columns: 1fr 1fr; }
      .pay-strip .col:nth-child(3) { border-left: 0; }
      .pay-strip .col:nth-child(n+3) { border-top: 1px solid var(--line); }
      th.hide, td.hide { display: none; }
      .stamp-wrap { display: none; }
      .foot { flex-direction: column-reverse; align-items: stretch; padding: 20px; gap: 18px; }
      .qr-card { justify-content: center; }
    }

    /* Bản in A4 chuẩn sắc nét */
    @media print {
      @page { size: A4 portrait; margin: 10mm; }
      body { background: #ffffff !important; padding: 0 !important; color: #000000 !important; }
      .bar, .toast { display: none !important; }
      .paper { margin: 0 !important; max-width: none !important; box-shadow: none !important; border: 1px solid #cbd5e1 !important; border-radius: 0 !important; }
      .hero {
        background: #1e1b4b !important; color: #ffffff !important;
        -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
      }
      .pill, .party, .words-box, .totals, .note, .foot, .qr-card {
        -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
      }
      .stamp { border-color: #059669 !important; color: #059669 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .btn { display: none !important; }
    }
  </style>
</head>
<body>
  <nav class="bar">
    <a class="back" href="/">← Về trang chủ</a>
    <div class="acts">
      <button class="btn" type="button" onclick="copyLink()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>Chép liên kết
      </button>
      <button class="btn primary" type="button" onclick="window.print()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>In / Lưu PDF
      </button>
    </div>
  </nav>

  <main class="paper">
    <header class="hero">
      <div class="hero-top">
        <div class="brand">
          <span class="logo">
            <svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg>
          </span>
          <div>
            <b>${esc(appName)}</b>
            <small>Hệ thống AI Voice & Speech-to-Text Thông Minh</small>
          </div>
        </div>
        <div class="doc">
          <span class="badge-title">Biên nhận thanh toán điện tử</span>
          <div class="n">${receiptNo}</div>
          <div class="d">Ngày xác nhận: ${vnDate(order.paid_at || order.created_at, true)}</div>
        </div>
      </div>
      <div class="amount-bar">
        <div>
          <div class="lbl">Số tiền ${paid ? 'đã thanh toán' : 'cần thanh toán'}</div>
          <div class="v">${money(order.amount)}</div>
        </div>
        <span class="pill ${st.cls}"><i></i>${st.label}</span>
      </div>
    </header>

    <section class="body">
      <div class="parties">
        <div class="party">
          <div class="party-head">
            <h3>🏢 Bên bán (Đơn vị cung cấp)</h3>
          </div>
          <div class="party-name">${esc(sellerName)}</div>
          ${renderKv(sellerRows)}
        </div>
        <div class="party">
          <div class="party-head">
            <h3>👤 Khách hàng (Bên mua)</h3>
          </div>
          <div class="party-name">${esc(buyerName)}</div>
          ${renderKv(buyerRows)}
        </div>
      </div>

      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th style="width: 50px;" class="c">STT</th>
              <th>Mô tả dịch vụ / Gói đăng ký</th>
              <th class="c hide" style="width: 70px;">SL</th>
              <th class="r hide" style="width: 120px;">Đơn giá</th>
              <th class="r" style="width: 140px;">Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="c">1</td>
              <td>
                <div class="item-title">${esc(itemName)}</div>
                <div class="item-desc">${esc(itemNote)}</div>
              </td>
              <td class="c hide">${qty.toLocaleString('vi-VN')}</td>
              <td class="r hide">${money(unitPrice)}</td>
              <td class="r"><b>${money(order.amount)}</b></td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="sum-section">
        <div class="sum-left">
          <div class="words-box">
            <span class="lbl">Số tiền viết bằng chữ:</span>
            <div class="txt">${moneyWords(order.amount)}.</div>
          </div>
          <div class="note-disclaimer">
            Biên nhận điện tử này được tạo tự động bởi hệ thống <b>${esc(appName)}</b> khi nhận được xác nhận thanh toán hợp lệ từ cổng thanh toán VietQR / payOS. Chứng từ có giá trị đối soát và xác thực quyền sử dụng dịch vụ số.
          </div>
        </div>

        <div class="totals">
          ${paid ? `<div class="stamp-wrap"><div class="stamp">✓ ĐÃ THANH TOÁN</div></div>` : ''}
          <div class="row"><span>Tạm tính</span><span>${money(order.amount)}</span></div>
          <div class="row"><span>Chiết khấu</span><span>0 ₫</span></div>
          <div class="row"><span>Thuế GTGT</span><span>Đã bao gồm</span></div>
          <div class="row final"><span>Tổng thanh toán</span><span class="val">${money(order.amount)}</span></div>
        </div>
      </div>

      <div class="pay-strip">
        <div class="col"><span>Mã đơn hàng</span><code>#${order.order_code}</code></div>
        <div class="col"><span>Cổng thanh toán</span><b>${esc(PAID_VIA[order.paid_via] || 'VietQR · payOS')}</b></div>
        <div class="col"><span>Mã tham chiếu GD</span><b>${esc(order.reference || (paid ? 'Đã khớp tự động' : '—'))}</b></div>
        <div class="col"><span>Thời gian giao dịch</span><b>${paid ? vnDate(order.paid_at, true) : 'Đang xử lý'}</b></div>
      </div>

      ${invoiceInfo}
    </section>

    <footer class="foot">
      <div class="foot-info">
        <p><b>Hỗ trợ khách hàng:</b> Nếu cần hỗ trợ thêm thông tin hoặc xuất hóa đơn doanh nghiệp, vui lòng liên hệ hotline/Zalo: <b>${esc(sellerPhone)}</b> hoặc gửi email tới <a href="mailto:${esc(sellerEmail)}">${esc(sellerEmail)}</a>.</p>
        <p><b>Tra cứu trực tuyến:</b> <a href="${esc(viewUrl)}" target="_blank" rel="noopener">${esc(viewUrl.replace(/^https?:\/\//, ''))}</a></p>
      </div>

      <div class="qr-card">
        <a href="${esc(viewUrl)}" target="_blank" rel="noopener" class="qr-frame" title="Bấm để mở hoặc quét bằng camera điện thoại">
          ${qrSvg}
        </a>
        <div class="qr-label">
          <b>Quét mã QR</b>
          Xác thực biên lai gốc trực tiếp trên hệ thống.
          <small>Hỗ trợ Camera, Zalo & Banking app</small>
        </div>
      </div>
    </footer>
  </main>

  <div class="toast" id="toast"></div>

  <script>
    if (new URLSearchParams(location.search).get('print') === '1') {
      window.addEventListener('load', function () {
        setTimeout(function () { try { window.print(); } catch (e) {} }, 500);
      });
    }
    function toast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg;
      t.classList.add('show');
      clearTimeout(window._t);
      window._t = setTimeout(function () { t.classList.remove('show'); }, 2500);
    }
    function copyLink() {
      var url = ${JSON.stringify(viewUrl)};
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          toast('✓ Đã sao chép liên kết biên nhận vào bộ nhớ tạm');
        }, function () {
          toast(url);
        });
      } else {
        toast(url);
      }
    }
  </script>
</body>
</html>`;
}
