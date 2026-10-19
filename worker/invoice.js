// Trang hóa đơn bán hàng (in / lưu PDF) cho đơn đã thanh toán: /invoice/<mã đơn>
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + 'đ';
const vnDate = (t, time = false) => t ? new Date(t).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', ...(time ? {} : { year: 'numeric', month: '2-digit', day: '2-digit' }) }) : '—';

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
  const units = ['', 'nghìn', 'triệu', 'tỷ'], parts = [];
  let i = 0, first = true;
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  for (let k = groups.length - 1; k >= 0; k--) {
    if (groups[k]) { parts.push(three(groups[k], !first) + (units[k] ? ' ' + units[k] : '')); first = false; }
    else if (k === 0) { /* bỏ */ }
    i++;
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim() + ' đồng';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function renderInvoice({ order, user, seller, appName }) {
  const inv = order.invoice ? JSON.parse(order.invoice) : null;
  const buyerName = inv?.name || user.name || user.email;
  const paid = order.status === 'PAID';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Hóa đơn #${order.order_code} · ${esc(appName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box} body{margin:0;background:#eef0f7;font-family:'Be Vietnam Pro',system-ui,sans-serif;color:#1a1e2e}
  .bar{max-width:820px;margin:20px auto 0;display:flex;justify-content:space-between;align-items:center;padding:0 16px}
  .bar a,.bar button{font:inherit;font-size:14px;font-weight:600;border:1px solid #d8dbe8;background:#fff;color:#1a1e2e;padding:9px 16px;border-radius:10px;cursor:pointer;text-decoration:none}
  .bar button{background:linear-gradient(135deg,#6d5dfc,#5b8cff);color:#fff;border:0}
  .paper{max-width:820px;margin:16px auto 40px;background:#fff;border-radius:18px;box-shadow:0 20px 50px rgba(30,40,90,.1);padding:44px 48px;position:relative;overflow:hidden}
  .paper:before{content:'';position:absolute;inset:0 0 auto 0;height:8px;background:linear-gradient(90deg,#6d5dfc,#0ea5c6)}
  .head{display:flex;justify-content:space-between;gap:24px;align-items:flex-start;margin-bottom:28px}
  .brand{display:flex;gap:10px;align-items:center;font-weight:800;font-size:22px}.brand i{width:40px;height:40px;border-radius:12px;background:linear-gradient(135deg,#6d5dfc,#0ea5c6);color:#fff;font-style:normal;display:grid;place-items:center}
  h1{margin:0;font-size:26px;letter-spacing:-.5px;text-align:right}.meta{text-align:right;color:#6a7190;font-size:13.5px;line-height:1.7}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:26px}
  .box{border:1px solid #e6e8f2;border-radius:14px;padding:16px 18px;font-size:14px;line-height:1.7}.box h3{margin:0 0 6px;font-size:12px;letter-spacing:.8px;text-transform:uppercase;color:#8a90a8}
  .box b{font-size:15px}
  table{width:100%;border-collapse:collapse;font-size:14px}th{text-align:left;font-size:12px;letter-spacing:.6px;text-transform:uppercase;color:#8a90a8;padding:10px 12px;border-bottom:2px solid #e6e8f2}
  td{padding:14px 12px;border-bottom:1px solid #eef0f6}.r{text-align:right}
  .tot{margin-left:auto;width:min(340px,100%);margin-top:16px;font-size:14px}.tot div{display:flex;justify-content:space-between;padding:7px 0}
  .tot .big{font-size:20px;font-weight:800;border-top:2px solid #1a1e2e;margin-top:6px;padding-top:12px}
  .words{margin-top:10px;font-size:13.5px;color:#4a5170;font-style:italic;text-align:right}
  .stamp{position:absolute;left:64px;bottom:150px;transform:rotate(-12deg);border:3px solid ${paid ? '#10b981' : '#f59e0b'};color:${paid ? '#10b981' : '#f59e0b'};font-weight:800;font-size:20px;letter-spacing:2px;padding:6px 16px;border-radius:10px;opacity:.85}
  .foot{margin-top:30px;padding-top:18px;border-top:1px dashed #d8dbe8;font-size:12.5px;color:#7b819b;line-height:1.7}
  @media (max-width:640px){.paper{padding:30px 22px}.grid{grid-template-columns:1fr}.head{flex-direction:column}h1,.meta{text-align:left}.stamp{display:none}}
  @media print{body{background:#fff}.bar{display:none}.paper{box-shadow:none;margin:0;max-width:none;border-radius:0}}
</style></head><body>
<div class="bar"><a href="/">← Về ${esc(appName)}</a><button onclick="window.print()">In / Lưu PDF</button></div>
<div class="paper">
  <div class="stamp">${paid ? 'ĐÃ THANH TOÁN' : 'CHƯA THANH TOÁN'}</div>
  <div class="head">
    <div><div class="brand"><i>V</i>${esc(seller.name || appName)}</div>
      <div style="margin-top:10px;font-size:13.5px;color:#4a5170;line-height:1.7">${seller.tax_code ? `MST: ${esc(seller.tax_code)}<br>` : ''}${seller.address ? `${esc(seller.address)}<br>` : ''}${seller.email ? `${esc(seller.email)}` : ''}${seller.phone ? ` · ${esc(seller.phone)}` : ''}</div></div>
    <div><h1>HÓA ĐƠN BÁN HÀNG</h1><div class="meta">Số: <b>#${order.order_code}</b><br>Ngày: ${vnDate(order.paid_at || order.created_at)}${order.invoice_no ? `<br>Số HĐĐT: <b>${esc(order.invoice_no)}</b>` : ''}</div></div>
  </div>
  <div class="grid">
    <div class="box"><h3>Người mua</h3><b>${esc(buyerName)}</b><br>${inv?.tax_code ? `MST: ${esc(inv.tax_code)}<br>` : ''}${inv?.address ? `${esc(inv.address)}<br>` : ''}${esc(inv?.email || user.email)}</div>
    <div class="box"><h3>Thanh toán</h3>Hình thức: Chuyển khoản VietQR (payOS)<br>Nội dung CK: <b>${esc(order.description)}</b><br>${paid ? `Thời gian: ${vnDate(order.paid_at, true)}` : 'Trạng thái: chưa thanh toán'}${order.reference ? `<br>Mã GD: ${esc(order.reference)}` : ''}</div>
  </div>
  <table><thead><tr><th>Dịch vụ</th><th class="r">SL</th><th class="r">Đơn giá</th><th class="r">Thành tiền</th></tr></thead>
    <tbody><tr><td><b>${esc(appName)} Premium ${esc(order.package_name)}</b><br><span style="color:#7b819b;font-size:13px">${order.days} ngày sử dụng gói Premium</span></td><td class="r">1</td><td class="r">${money(order.amount)}</td><td class="r">${money(order.amount)}</td></tr></tbody></table>
  <div class="tot"><div><span>Cộng tiền hàng</span><span>${money(order.amount)}</span></div><div class="big"><span>Tổng thanh toán</span><span>${money(order.amount)}</span></div></div>
  <div class="words">Bằng chữ: ${moneyWords(order.amount)}.</div>
  <div class="foot">${esc(seller.note || 'Hóa đơn bán hàng / biên nhận thanh toán điện tử. Nếu bạn đã yêu cầu xuất hóa đơn GTGT, hóa đơn điện tử sẽ được gửi riêng tới email nhận hóa đơn.')}</div>
</div></body></html>`;
}
