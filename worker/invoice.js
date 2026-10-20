// Trang biên nhận thanh toán in được: /invoice/<mã đơn>
// Đây là chứng từ xác nhận giao dịch, không phải hóa đơn GTGT. Khi admin đã phát hành hóa đơn điện tử thật
// (ghi số vào invoice_no) thì trang hiển thị số hóa đơn đó để tra cứu.
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + ' ₫';

function vnDate(t, withTime = false) {
  if (!t) return '—';
  return new Date(t).toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {})
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

const STATUS = {
  PAID: { label: 'Đã thanh toán', cls: 'paid' },
  PENDING: { label: 'Chờ thanh toán', cls: 'pending' },
  CANCELLED: { label: 'Đã hủy', cls: 'void' },
  EXPIRED: { label: 'Đã hết hạn', cls: 'void' }
};
const PAID_VIA = { webhook: 'VietQR · payOS (tự động)', check: 'VietQR · payOS (tự động)', admin: 'Chuyển khoản · xác nhận thủ công' };

export function renderInvoice({ order, user, seller = {}, appName = 'TXA Voice', baseUrl = '' }) {
  const inv = order.invoice ? (typeof order.invoice === 'string' ? JSON.parse(order.invoice) : order.invoice) : null;
  const isCompany = inv?.type === 'company';
  const buyerName = inv?.name || user.name || user.email.split('@')[0];
  const buyerEmail = inv?.email || user.email;
  const st = STATUS[order.status] || STATUS.PENDING;
  const paid = order.status === 'PAID';

  const sellerRows = [
    ['Mã số thuế', seller.tax_code], ['Địa chỉ', seller.address], ['Điện thoại', seller.phone],
    ['Email', seller.email], ['Tài khoản', seller.bank]
  ].filter(r => r[1]);
  const buyerRows = [
    [isCompany ? 'Đơn vị' : 'Họ tên', buyerName, true], ['Mã số thuế', inv?.tax_code], ['Địa chỉ', inv?.address], ['Email', buyerEmail]
  ].filter(r => r[1]);

  const receiptNo = `TXA-${order.order_code}`;
  const isCredits = order.kind === 'credits';
  const qty = isCredits ? Number(order.credits || 0) : 1;
  const itemName = isCredits ? `Gói ${qty.toLocaleString('vi-VN')} lượt tạo giọng AI` : `${appName} Premium · ${order.package_name || 'Gói trả phí'}`;
  const itemNote = isCredits
    ? 'Lượt cộng dồn vào tài khoản, không hết hạn theo ngày, dùng khi đã hết lượt trong ngày.'
    : `Quyền sử dụng gói Premium trong ${Number(order.days || 30).toLocaleString('vi-VN')} ngày kể từ khi kích hoạt.`;
  const unitPrice = isCredits && qty ? order.amount / qty : order.amount;

  const viewUrl = `${baseUrl}/invoice/${order.order_code}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&margin=0&data=${encodeURIComponent(viewUrl)}`;

  const rows = (list) => list.map(([k, v, strong]) => `<div class="kv"><span>${k}</span><b class="${strong ? 'strong' : ''}">${esc(v)}</b></div>`).join('');

  const invoiceInfo = order.invoice_no
    ? `<div class="note ok"><b>Hóa đơn điện tử đã phát hành:</b> số ${esc(order.invoice_no)}${order.invoice_issued_at ? `, ngày ${vnDate(order.invoice_issued_at)}` : ''}. Hóa đơn gốc đã được gửi tới ${esc(buyerEmail)}.</div>`
    : inv
      ? `<div class="note"><b>Yêu cầu xuất hóa đơn đã được ghi nhận.</b> Hóa đơn sẽ được gửi tới ${esc(buyerEmail)} sau khi phát hành.</div>`
      : '';

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Biên nhận ${receiptNo} · ${esc(appName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --ink: #0f172a; --ink-2: #334155; --muted: #64748b; --line: #e2e8f0; --soft: #f8fafc;
      --brand: #6d5efc; --brand-2: #22c3e6; --ok: #059669; --warn: #d97706; --void: #94a3b8;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0; color: var(--ink); line-height: 1.5; -webkit-font-smoothing: antialiased;
      font-family: 'Be Vietnam Pro', system-ui, -apple-system, 'Segoe UI', sans-serif;
      background: radial-gradient(900px 400px at 10% -10%, rgba(109, 94, 252, .16), transparent 60%),
                  radial-gradient(800px 400px at 100% 0%, rgba(34, 195, 230, .12), transparent 60%), #eef1f7;
      min-height: 100vh;
    }

    /* Thanh thao tác (chỉ hiện trên màn hình) */
    .bar { max-width: 820px; margin: 0 auto; padding: 20px 16px 0; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
    .bar a.back { color: var(--ink-2); text-decoration: none; font-weight: 600; font-size: 14px; }
    .bar a.back:hover { color: var(--brand); }
    .bar .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .btn { font: inherit; font-size: 13.5px; font-weight: 600; padding: 9px 16px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 7px;
      border: 1px solid var(--line); background: #fff; color: var(--ink); transition: .15s; }
    .btn:hover { border-color: var(--brand); transform: translateY(-1px); }
    .btn.primary { background: linear-gradient(135deg, var(--brand), #5b8cff); color: #fff; border-color: transparent; box-shadow: 0 8px 22px rgba(109, 94, 252, .35); }
    .btn svg { width: 16px; height: 16px; }

    /* Tờ biên nhận */
    .paper { max-width: 820px; margin: 16px auto 48px; background: #fff; border-radius: 22px; overflow: hidden;
      box-shadow: 0 30px 70px rgba(15, 23, 42, .12), 0 2px 6px rgba(15, 23, 42, .05); position: relative; }
    .hero { position: relative; padding: 32px 40px 28px; color: #fff; overflow: hidden;
      background: linear-gradient(125deg, #1e1b4b 0%, #3b2fb8 45%, #6d5efc 75%, #22c3e6 120%); }
    .hero::after { content: ''; position: absolute; right: -80px; top: -80px; width: 300px; height: 300px; border-radius: 50%;
      background: radial-gradient(circle, rgba(255, 255, 255, .18), transparent 65%); }
    .hero-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; position: relative; z-index: 1; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: rgba(255, 255, 255, .16);
      border: 1px solid rgba(255, 255, 255, .3); }
    .logo svg { width: 24px; height: 24px; fill: #fff; }
    .brand b { display: block; font-size: 20px; letter-spacing: -.3px; }
    .brand small { opacity: .75; font-size: 12.5px; }
    .doc { text-align: right; }
    .doc .t { font-size: 12px; font-weight: 700; letter-spacing: 1.6px; text-transform: uppercase; opacity: .8; }
    .doc .n { font-size: 18px; font-weight: 800; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .doc .d { font-size: 13px; opacity: .8; }
    .amount { position: relative; z-index: 1; margin-top: 28px; display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .amount .lbl { font-size: 13px; opacity: .8; }
    .amount .v { font-size: 40px; font-weight: 800; letter-spacing: -1px; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .pill { display: inline-flex; align-items: center; gap: 7px; padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 700;
      background: rgba(255, 255, 255, .95); }
    .pill i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    .pill.paid { color: var(--ok); } .pill.pending { color: var(--warn); } .pill.void { color: #64748b; }

    .body { padding: 30px 40px 34px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .party { border: 1px solid var(--line); border-radius: 16px; padding: 16px 18px; background: var(--soft); }
    .party h3 { margin: 0 0 10px; font-size: 11.5px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--brand); }
    .party .name { font-size: 15.5px; font-weight: 700; margin-bottom: 8px; }
    .kv { display: flex; gap: 12px; font-size: 13px; padding: 3px 0; }
    .kv span { color: var(--muted); width: 82px; flex: none; }
    .kv b { font-weight: 500; color: var(--ink-2); word-break: break-word; }
    .kv b.strong { font-weight: 700; color: var(--ink); }

    table { width: 100%; border-collapse: collapse; margin-top: 26px; font-size: 13.5px; }
    th { text-align: left; font-size: 11.5px; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); font-weight: 700;
      padding: 0 12px 10px; border-bottom: 1.5px solid var(--ink); }
    td { padding: 16px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
    th.r, td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th.c, td.c { text-align: center; }
    .item b { display: block; font-size: 14.5px; }
    .item small { color: var(--muted); font-size: 12.5px; }

    .sum { display: grid; grid-template-columns: 1fr 300px; gap: 24px; margin-top: 20px; align-items: start; }
    .words { font-size: 13px; color: var(--ink-2); background: var(--soft); border-radius: 12px; padding: 12px 14px; border: 1px solid var(--line); }
    .words b { display: block; font-size: 11.5px; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
    .totals .row.final { border-top: 1.5px solid var(--ink); margin-top: 6px; padding-top: 12px; font-size: 17px; font-weight: 800; color: var(--ink); }

    .pay { margin-top: 26px; display: grid; grid-template-columns: repeat(4, 1fr); border: 1px solid var(--line); border-radius: 16px; overflow: hidden; }
    .pay div { padding: 12px 16px; }
    .pay div + div { border-left: 1px solid var(--line); }
    .pay span { display: block; font-size: 11.5px; color: var(--muted); text-transform: uppercase; letter-spacing: .6px; }
    .pay b { font-size: 13.5px; word-break: break-all; }

    .note { margin-top: 18px; font-size: 13px; padding: 12px 16px; border-radius: 12px; background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }
    .note.ok { background: #ecfdf5; border-color: #a7f3d0; color: #065f46; }

    .totals { position: relative; }
    .stamp { position: absolute; right: 0; top: -58px; transform: rotate(-12deg); border: 3px solid var(--ok); color: var(--ok);
      border-radius: 12px; padding: 6px 16px; font-weight: 800; letter-spacing: 2px; font-size: 18px; opacity: .22; pointer-events: none; text-transform: uppercase; }

    .foot { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding: 22px 40px; background: var(--soft); border-top: 1px dashed #cbd5e1; }
    .foot p { margin: 0; font-size: 12.5px; color: var(--muted); max-width: 520px; }
    .foot p b { color: var(--ink-2); }
    .foot a { color: var(--brand); text-decoration: none; word-break: break-all; }
    .qr { display: flex; align-items: center; gap: 10px; flex: none; font-size: 11.5px; color: var(--muted); text-align: right; }
    .qr img { width: 78px; height: 78px; border-radius: 10px; background: #fff; padding: 5px; border: 1px solid var(--line); }

    .toast { position: fixed; left: 50%; bottom: 26px; transform: translate(-50%, 40px); opacity: 0; transition: .25s; pointer-events: none;
      background: var(--ink); color: #fff; padding: 11px 20px; border-radius: 999px; font-size: 13.5px; font-weight: 600; box-shadow: 0 12px 30px rgba(0, 0, 0, .3); }
    .toast.show { transform: translate(-50%, 0); opacity: 1; }

    @media (max-width: 680px) {
      .paper { margin: 14px 12px 32px; border-radius: 18px; }
      .hero, .body { padding-left: 20px; padding-right: 20px; }
      .hero-top { flex-direction: column; }
      .doc { text-align: left; }
      .amount .v { font-size: 32px; }
      .parties, .sum { grid-template-columns: 1fr; }
      .pay { grid-template-columns: 1fr 1fr; }
      .pay div:nth-child(3) { border-left: 0; }
      .pay div:nth-child(n+3) { border-top: 1px solid var(--line); }
      th.hide, td.hide { display: none; }
      .stamp { display: none; }
      .foot { flex-direction: column; align-items: flex-start; padding: 20px; }
      .qr { text-align: left; flex-direction: row-reverse; }
    }
    @media print {
      @page { size: A4 portrait; margin: 12mm; }
      body { background: #fff; }
      .bar, .toast { display: none !important; }
      .paper { margin: 0; max-width: none; box-shadow: none; border-radius: 0; }
      .hero, .pill, .party, .words, .note, .foot { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <nav class="bar">
    <a class="back" href="/">← ${esc(appName)}</a>
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
          <span class="logo"><svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z"/></svg></span>
          <div><b>${esc(appName)}</b><small>Giọng nói ⇄ Văn bản bằng AI</small></div>
        </div>
        <div class="doc">
          <div class="t">Biên nhận thanh toán</div>
          <div class="n">${receiptNo}</div>
          <div class="d">Ngày ${vnDate(order.paid_at || order.created_at)}</div>
        </div>
      </div>
      <div class="amount">
        <div><div class="lbl">Số tiền ${paid ? 'đã thanh toán' : 'cần thanh toán'}</div><div class="v">${money(order.amount)}</div></div>
        <span class="pill ${st.cls}"><i></i>${st.label}</span>
      </div>
    </header>

    <section class="body">
      <div class="parties">
        <div class="party">
          <h3>Bên bán</h3>
          <div class="name">${esc(seller.name || appName)}</div>
          ${rows(sellerRows)}
        </div>
        <div class="party">
          <h3>Khách hàng</h3>
          ${rows(buyerRows)}
        </div>
      </div>

      <table>
        <thead><tr><th>Dịch vụ</th><th class="c hide">SL</th><th class="r hide">Đơn giá</th><th class="r">Thành tiền</th></tr></thead>
        <tbody>
          <tr>
            <td class="item"><b>${esc(itemName)}</b><small>${esc(itemNote)}</small></td>
            <td class="c hide">${qty.toLocaleString('vi-VN')}</td>
            <td class="r hide">${money(Math.round(unitPrice))}</td>
            <td class="r"><b>${money(order.amount)}</b></td>
          </tr>
        </tbody>
      </table>

      <div class="sum">
        <div class="words"><b>Bằng chữ</b>${moneyWords(order.amount)}.</div>
        <div class="totals">
          ${paid ? '<div class="stamp">Đã thanh toán</div>' : ''}
          <div class="row"><span>Tạm tính</span><span>${money(order.amount)}</span></div>
          <div class="row"><span>Giảm giá</span><span>0 ₫</span></div>
          <div class="row final"><span>Tổng cộng</span><span>${money(order.amount)}</span></div>
        </div>
      </div>

      <div class="pay">
        <div><span>Mã đơn</span><b>#${order.order_code}</b></div>
        <div><span>Phương thức</span><b>${esc(PAID_VIA[order.paid_via] || 'VietQR · payOS')}</b></div>
        <div><span>Mã giao dịch</span><b>${esc(order.reference || '—')}</b></div>
        <div><span>Thời gian</span><b>${paid ? vnDate(order.paid_at, true) : '—'}</b></div>
      </div>

      ${invoiceInfo}
    </section>

    <footer class="foot">
      <p>Biên nhận này xác nhận giao dịch thanh toán trên <b>${esc(appName)}</b> và không thay thế hóa đơn GTGT.
        Cần hỗ trợ? ${seller.email ? `Liên hệ <a href="mailto:${esc(seller.email)}">${esc(seller.email)}</a>` : 'Liên hệ quản trị viên'}${seller.phone ? ` · ${esc(seller.phone)}` : ''}.<br>
        Xem trực tuyến: <a href="${esc(viewUrl)}">${esc(viewUrl.replace(/^https?:\/\//, ''))}</a></p>
      <div class="qr"><span>Quét để mở<br>biên nhận</span><img src="${esc(qrSrc)}" alt="QR biên nhận"></div>
    </footer>
  </main>

  <div class="toast" id="toast"></div>
  <script>
    if (new URLSearchParams(location.search).get('print') === '1') addEventListener('load', function () { setTimeout(function () { try { print(); } catch (e) {} }, 500); });
    function toast(msg) {
      var t = document.getElementById('toast');
      t.textContent = msg; t.classList.add('show');
      clearTimeout(window._t); window._t = setTimeout(function () { t.classList.remove('show'); }, 2500);
    }
    function copyLink() {
      var url = ${JSON.stringify(viewUrl)};
      navigator.clipboard.writeText(url).then(function () { toast('Đã chép liên kết biên nhận'); }, function () { toast(url); });
    }
  </script>
</body>
</html>`;
}
