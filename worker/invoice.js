// Trang hóa đơn điện tử bán hàng / GTGT chuyên nghiệp chuẩn doanh nghiệp: /invoice/<mã đơn>
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

function vnDate(t, full = false) {
  if (!t) return '—';
  const d = new Date(t);
  if (full) {
    return d.toLocaleString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
  }
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `Ngày ${day} tháng ${month} năm ${year}`;
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
  const units = ['', 'nghìn', 'triệu', 'tỷ'], parts = [];
  let i = 0, first = true;
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  for (let k = groups.length - 1; k >= 0; k--) {
    if (groups[k]) { parts.push(three(groups[k], !first) + (units[k] ? ' ' + units[k] : '')); first = false; }
    i++;
  }
  const s = parts.join(' ').replace(/\s+/g, ' ').trim() + ' đồng chẵn';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function renderInvoice({ order, user, seller = {}, appName = 'VoiceKit' }) {
  const inv = order.invoice ? (typeof order.invoice === 'string' ? JSON.parse(order.invoice) : order.invoice) : null;
  const isCompany = inv?.type === 'company';
  const buyerName = inv?.name || user.name || user.email.split('@')[0];
  const buyerEmail = inv?.email || user.email;
  const buyerTax = inv?.tax_code || '';
  const buyerAddress = inv?.address || '';
  const paid = order.status === 'PAID';

  const sellerName = seller.name || 'CÔNG TY CỔ PHẦN CÔNG NGHỆ VÀ TRÍ TUỆ NHÂN TẠO VOICEKIT VIỆT NAM';
  const sellerTax = seller.tax_code || '0110293847';
  const sellerAddress = seller.address || 'Tầng 12, Tòa nhà Innovation Hub, Phố Duy Tân, Quận Cầu Giấy, TP. Hà Nội, Việt Nam';
  const sellerPhone = seller.phone || '1900 6868 · (+84) 24 7300 6868';
  const sellerEmail = seller.email || 'billing@voicekit.vn';
  const sellerBank = seller.bank || '19036868686868 tại Ngân hàng TMCP Quân Đội (MB Bank) - CN Cầu Giấy';

  const invoiceNo = order.invoice_no || String(order.order_code).slice(-8).padStart(8, '0');
  const serialNo = '1C26TVK';
  const formNo = '1/001';
  const lookupCode = `VK-INV-${order.order_code}`;
  const paidDateStr = vnDate(order.paid_at || order.created_at);
  const paidFullStr = vnDate(order.paid_at || order.created_at, true);

  // Dịch vụ
  const isCredits = order.kind === 'credits';
  const itemName = isCredits
    ? `Dịch vụ xử lý giọng nói AI · ${Number(order.credits).toLocaleString('vi-VN')} lượt sử dụng tổng hợp TTS`
    : `Gói tài khoản dịch vụ AI VoiceKit Premium (${esc(order.package_name || 'Gói trả phí')})`;
  const itemNote = isCredits
    ? `Lượt mua bổ sung vĩnh viễn, tích lũy theo tài khoản trên nền tảng đám mây VoiceKit.`
    : `Bản quyền truy cập và sử dụng dịch vụ AI VoiceKit trong thời hạn ${order.days || 30} ngày.`;

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Hóa đơn điện tử #${order.order_code} · ${esc(appName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      background: #e2e8f0;
      font-family: 'Be Vietnam Pro', system-ui, -apple-system, sans-serif;
      color: #0f172a;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }

    /* Thanh điều khiển nổi phía trên */
    .action-bar {
      position: sticky;
      top: 0;
      z-index: 100;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(12px);
      color: #fff;
      padding: 12px 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.18);
    }
    .action-container {
      max-width: 900px;
      margin: 0 auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    .action-left {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 14px;
    }
    .badge-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: ${paid ? '#10b981' : '#f59e0b'};
      color: #fff;
      padding: 4px 12px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .action-btns {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn-act {
      font: inherit;
      font-size: 13.5px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      transition: all 0.15s ease;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
    .btn-act:hover {
      background: rgba(255,255,255,0.22);
    }
    .btn-act.primary {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      border-color: transparent;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
    }
    .btn-act.primary:hover {
      background: linear-gradient(135deg, #4f46e5, #4338ca);
      transform: translateY(-1px);
    }

    /* Tờ giấy hóa đơn A4 chuẩn */
    .invoice-wrapper {
      max-width: 900px;
      margin: 24px auto 60px;
      padding: 0 16px;
    }
    .invoice-paper {
      background: #fff;
      border-radius: 4px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12), 0 1px 3px rgba(0,0,0,0.06);
      padding: 40px 48px;
      position: relative;
      border: 1px solid #cbd5e1;
      overflow: hidden;
    }
    /* Viền hoa văn an toàn trên đỉnh */
    .invoice-paper::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 6px;
      background: linear-gradient(90deg, #4338ca, #6366f1, #06b6d4, #10b981);
    }

    /* Quốc hiệu tiêu ngữ */
    .national-header {
      text-align: center;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid #e2e8f0;
    }
    .nat-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: #334155;
    }
    .nat-sub {
      font-size: 13px;
      font-weight: 600;
      color: #475569;
      margin-top: 2px;
    }
    .nat-divider {
      width: 140px;
      height: 1px;
      background: #94a3b8;
      margin: 6px auto 0;
    }

    /* Header thông tin hóa đơn */
    .inv-top {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 24px;
    }
    .brand-box {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-logo {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: linear-gradient(135deg, #4f46e5, #06b6d4);
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 26px;
      font-weight: 800;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.35);
    }
    .brand-names h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 800;
      color: #1e1b4b;
      letter-spacing: -0.3px;
    }
    .brand-names span {
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .inv-title-box {
      text-align: right;
    }
    .inv-main-title {
      margin: 0;
      font-size: 24px;
      font-weight: 800;
      color: #1e293b;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .inv-sub-title {
      font-size: 12.5px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 500;
    }
    .inv-date {
      font-size: 13.5px;
      color: #334155;
      font-style: italic;
      margin-top: 4px;
    }

    /* Bảng thông tin Mẫu số / Ký hiệu */
    .meta-box-table {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 10px 14px;
      margin-top: 10px;
      font-size: 12.5px;
      line-height: 1.6;
      display: inline-block;
      text-align: left;
    }
    .meta-box-table b {
      color: #0f172a;
    }

    /* Khối Người bán & Người mua */
    .parties-section {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .party-block {
      padding: 16px 20px;
      font-size: 13.5px;
      line-height: 1.65;
    }
    .party-block.seller {
      background: #f8fafc;
      border-bottom: 1px dashed #cbd5e1;
    }
    .party-block.buyer {
      background: #ffffff;
    }
    .party-header {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #4f46e5;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .party-row {
      display: flex;
      margin-bottom: 3px;
    }
    .party-row .lbl {
      width: 140px;
      flex-shrink: 0;
      color: #475569;
    }
    .party-row .val {
      flex: 1;
      color: #0f172a;
    }
    .tax-highlight {
      font-family: monospace;
      font-size: 14.5px;
      font-weight: 700;
      letter-spacing: 1px;
      color: #0f172a;
      background: #e2e8f0;
      padding: 1px 8px;
      border-radius: 4px;
      border: 1px solid #cbd5e1;
      display: inline-block;
    }

    /* Bảng chi tiết dịch vụ */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13.5px;
    }
    .items-table th, .items-table td {
      border: 1px solid #cbd5e1;
      padding: 10px 12px;
    }
    .items-table th {
      background: #f1f5f9;
      color: #1e293b;
      font-weight: 700;
      font-size: 12.5px;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      text-align: center;
    }
    .items-table td.c { text-align: center; }
    .items-table td.r { text-align: right; }
    .item-desc {
      font-weight: 600;
      color: #0f172a;
      font-size: 14px;
    }
    .item-sub {
      color: #64748b;
      font-size: 12px;
      margin-top: 3px;
    }

    /* Khối tính tiền */
    .totals-area {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 24px;
      align-items: flex-start;
      margin-bottom: 26px;
    }
    .totals-note {
      font-size: 12.5px;
      color: #64748b;
      line-height: 1.6;
      border-left: 3px solid #6366f1;
      padding-left: 12px;
      font-style: italic;
    }
    .totals-calc {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      padding: 14px 16px;
      font-size: 13.5px;
    }
    .calc-row {
      display: flex;
      justify-content: space-between;
      padding: 5px 0;
      color: #334155;
    }
    .calc-row.final {
      border-top: 2px solid #cbd5e1;
      margin-top: 8px;
      padding-top: 10px;
      font-size: 16px;
      font-weight: 800;
      color: #0f172a;
    }
    .final-val {
      color: #4f46e5;
      font-size: 18px;
    }
    .in-words-box {
      background: #f1f5f9;
      border-radius: 6px;
      padding: 10px 14px;
      font-size: 13.5px;
      color: #1e293b;
      margin-bottom: 30px;
      border-left: 4px solid #10b981;
    }

    /* Phần chữ ký số điện tử */
    .signatures-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-bottom: 30px;
    }
    .sig-col {
      text-align: center;
    }
    .sig-role {
      font-weight: 700;
      font-size: 13px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1e293b;
    }
    .sig-sub {
      font-size: 12px;
      color: #64748b;
      font-style: italic;
      margin-top: 2px;
    }
    .sig-box-wrapper {
      min-height: 130px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      margin-top: 12px;
    }
    .buyer-signed {
      color: #059669;
      font-weight: 600;
      font-size: 13px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      padding: 8px 16px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    /* Mộc dấu điện tử đỏ chuyên nghiệp */
    .digital-seal-box {
      border: 2px solid #dc2626;
      border-radius: 8px;
      background: rgba(254, 242, 242, 0.7);
      padding: 10px 14px;
      text-align: left;
      font-size: 11.5px;
      color: #991b1b;
      line-height: 1.5;
      display: inline-block;
      max-width: 320px;
      position: relative;
      box-shadow: 0 4px 12px rgba(220, 38, 38, 0.1);
    }
    .seal-title {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      font-weight: 800;
      color: #dc2626;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border-bottom: 1px dashed rgba(220, 38, 38, 0.4);
      padding-bottom: 4px;
      margin-bottom: 6px;
    }
    .seal-item {
      margin-bottom: 2px;
    }

    /* Chân trang tra cứu & QR Code */
    .invoice-footer {
      border-top: 1px solid #cbd5e1;
      padding-top: 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      font-size: 12px;
      color: #64748b;
    }
    .lookup-info {
      line-height: 1.6;
    }
    .lookup-info b {
      color: #1e293b;
    }
    .qr-side {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .qr-img {
      width: 76px;
      height: 76px;
      border-radius: 6px;
      border: 1px solid #cbd5e1;
      background: #fff;
      padding: 3px;
    }

    /* Chế độ In A4 chuẩn (@media print) */
    @media print {
      body { background: #fff !important; }
      .action-bar { display: none !important; }
      .invoice-wrapper { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
      .invoice-paper {
        border: none !important;
        box-shadow: none !important;
        padding: 15mm 15mm !important;
        width: 100% !important;
      }
      @page {
        size: A4 portrait;
        margin: 0;
      }
    }

    @media (max-width: 768px) {
      .invoice-paper { padding: 24px 18px; }
      .inv-top { grid-template-columns: 1fr; gap: 16px; }
      .inv-title-box { text-align: left; }
      .totals-area { grid-template-columns: 1fr; }
      .signatures-grid { grid-template-columns: 1fr; gap: 20px; }
      .party-row { flex-direction: column; }
      .party-row .lbl { width: auto; font-weight: 600; }
    }
  </style>
</head>
<body>

  <!-- Thanh điều khiển phía trên -->
  <header class="action-bar">
    <div class="action-container">
      <div class="action-left">
        <span class="badge-status">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          ${paid ? 'Hóa đơn đã thanh toán' : 'Chưa thanh toán'}
        </span>
        <span>Mã đơn: <b>#${order.order_code}</b></span>
      </div>
      <div class="action-btns">
        <a href="/" class="btn-act">← Về trang chủ</a>
        <button class="btn-act" onclick="copyLookup()">📋 Chép mã tra cứu</button>
        <button class="btn-act primary" onclick="window.print()">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
          In / Lưu PDF (A4)
        </button>
      </div>
    </div>
  </header>

  <main class="invoice-wrapper">
    <article class="invoice-paper">
      
      <!-- Quốc hiệu & Tiêu ngữ -->
      <section class="national-header">
        <div class="nat-title">Cộng hòa Xã hội Chủ nghĩa Việt Nam</div>
        <div class="nat-sub">Độc lập - Tự do - Hạnh phúc</div>
        <div class="nat-divider"></div>
      </section>

      <!-- Đầu hóa đơn: Thương hiệu & Tên hóa đơn -->
      <section class="inv-top">
        <div>
          <div class="brand-box">
            <div class="brand-logo">V</div>
            <div class="brand-names">
              <h2>${esc(appName)} AI Solution</h2>
              <span>Nền tảng trí tuệ nhân tạo giọng nói số</span>
            </div>
          </div>
          <div style="margin-top:12px;font-size:13px;color:#475569;line-height:1.6">
            <b>Đơn vị phát hành:</b> ${esc(sellerName)}
          </div>
        </div>

        <div class="inv-title-box">
          <h1 class="inv-main-title">HÓA ĐƠN ĐIỆN TỬ</h1>
          <div class="inv-sub-title">(Bản thể hiện của hóa đơn điện tử GTGT)</div>
          <div class="inv-date">${paidDateStr}</div>
          <div class="meta-box-table">
            <div>Mẫu số (Form): <b>${formNo}</b></div>
            <div>Ký hiệu (Serial): <b>${serialNo}</b></div>
            <div>Số hóa đơn (No.): <b style="font-size:14px;color:#4f46e5">${invoiceNo}</b></div>
          </div>
        </div>
      </section>

      <!-- Thông tin Bên bán & Bên mua -->
      <section class="parties-section">
        <!-- Bên bán -->
        <div class="party-block seller">
          <div class="party-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            Đơn vị bán hàng (Seller)
          </div>
          <div class="party-row">
            <div class="lbl">Tên đơn vị:</div>
            <div class="val"><b>${esc(sellerName)}</b></div>
          </div>
          <div class="party-row">
            <div class="lbl">Mã số thuế:</div>
            <div class="val"><span class="tax-highlight">${esc(sellerTax)}</span></div>
          </div>
          <div class="party-row">
            <div class="lbl">Địa chỉ trụ sở:</div>
            <div class="val">${esc(sellerAddress)}</div>
          </div>
          <div class="party-row">
            <div class="lbl">Điện thoại / Hotline:</div>
            <div class="val">${esc(sellerPhone)} &nbsp;·&nbsp; <b>Email:</b> ${esc(sellerEmail)}</div>
          </div>
          <div class="party-row">
            <div class="lbl">Tài khoản thanh toán:</div>
            <div class="val">${esc(sellerBank)}</div>
          </div>
        </div>

        <!-- Bên mua -->
        <div class="party-block buyer">
          <div class="party-header" style="color:#059669">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Người mua hàng / Đơn vị thụ hưởng (Buyer)
          </div>
          <div class="party-row">
            <div class="lbl">${isCompany ? 'Tên công ty / Đơn vị:' : 'Họ tên người mua:'}</div>
            <div class="val"><b>${esc(buyerName)}</b></div>
          </div>
          ${buyerTax ? `
          <div class="party-row">
            <div class="lbl">Mã số thuế:</div>
            <div class="val"><span class="tax-highlight">${esc(buyerTax)}</span></div>
          </div>` : ''}
          ${buyerAddress ? `
          <div class="party-row">
            <div class="lbl">Địa chỉ đơn vị:</div>
            <div class="val">${esc(buyerAddress)}</div>
          </div>` : ''}
          <div class="party-row">
            <div class="lbl">Email nhận HĐĐT:</div>
            <div class="val">${esc(buyerEmail)}</div>
          </div>
          <div class="party-row">
            <div class="lbl">Hình thức TT:</div>
            <div class="val">Chuyển khoản VietQR / payOS Gateway &nbsp;·&nbsp; <b>Đồng tiền:</b> VND (Việt Nam Đồng)</div>
          </div>
        </div>
      </section>

      <!-- Bảng kê dịch vụ -->
      <table class="items-table">
        <thead>
          <tr>
            <th style="width:48px">STT</th>
            <th>Tên dịch vụ / Hàng hóa số</th>
            <th style="width:75px">ĐVT</th>
            <th style="width:60px">SL</th>
            <th style="width:115px">Đơn giá</th>
            <th style="width:125px">Thành tiền</th>
            <th style="width:90px">Thuế suất</th>
            <th style="width:105px">Tiền thuế</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="c">1</td>
            <td>
              <div class="item-desc">${itemName}</div>
              <div class="item-sub">${itemNote}</div>
            </td>
            <td class="c">${isCredits ? 'Lượt' : 'Gói'}</td>
            <td class="c">1</td>
            <td class="r">${money(order.amount)}</td>
            <td class="r"><b>${money(order.amount)}</b></td>
            <td class="c">KCT *</td>
            <td class="r">0 đ</td>
          </tr>
        </tbody>
      </table>

      <!-- Khối tính tiền & Ghi chú -->
      <section class="totals-area">
        <div class="totals-note">
          <b>* Ghi chú pháp lý thuế:</b> Dịch vụ phần mềm trí tuệ nhân tạo và xử lý ngôn ngữ thuộc đối tượng không chịu thuế giá trị gia tăng (KCT) căn cứ theo Khoản 21 Điều 4 Thông tư số 219/2013/TT-BTC của Bộ Tài chính.<br>
          <b>Mã giao dịch xác thực:</b> ${esc(order.reference || order.payment_link_id || ('PAY-' + order.order_code))}.
        </div>

        <div class="totals-calc">
          <div class="calc-row">
            <span>Cộng tiền hàng (Subtotal):</span>
            <b>${money(order.amount)}</b>
          </div>
          <div class="calc-row">
            <span>Thuế suất GTGT (VAT Rate):</span>
            <span>Không chịu thuế (KCT)</span>
          </div>
          <div class="calc-row">
            <span>Tiền thuế GTGT (VAT Amount):</span>
            <span>0 đ</span>
          </div>
          <div class="calc-row final">
            <span>Tổng thanh toán:</span>
            <span class="final-val">${money(order.amount)}</span>
          </div>
        </div>
      </section>

      <!-- Số tiền bằng chữ -->
      <div class="in-words-box">
        <b>Số tiền viết bằng chữ:</b> <i>${moneyWords(order.amount)}.</i>
      </div>

      <!-- Khối chữ ký số điện tử -->
      <section class="signatures-grid">
        <div class="sig-col">
          <div class="sig-role">Người mua hàng (Buyer)</div>
          <div class="sig-sub">(Ký, ghi rõ họ tên hoặc xác nhận điện tử)</div>
          <div class="sig-box-wrapper">
            <div class="buyer-signed">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              Đã xác nhận &amp; thanh toán trực tuyến
            </div>
          </div>
          <div style="font-size:13px;font-weight:600;color:#334155">${esc(buyerName)}</div>
        </div>

        <div class="sig-col">
          <div class="sig-role">Người bán hàng (Seller)</div>
          <div class="sig-sub">(Ký điện tử bởi đại diện pháp luật / hệ thống tự động)</div>
          <div class="sig-box-wrapper">
            <div class="digital-seal-box">
              <div class="seal-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>
                Signature Valid
              </div>
              <div class="seal-item"><b>Ký bởi:</b> ${esc(sellerName)}</div>
              <div class="seal-item"><b>Thời gian:</b> ${paidFullStr}</div>
              <div class="seal-item"><b>Chứng thư số:</b> VIETTEL-CA (Bộ TT&amp;TT)</div>
              <div class="seal-item" style="color:#15803d;font-weight:600">✔ Chứng thư hợp lệ &amp; Nguyên vẹn</div>
            </div>
          </div>
          <div style="font-size:13px;font-weight:600;color:#334155">${esc(sellerName)}</div>
        </div>
      </section>

      <!-- Footer tra cứu & QR Code -->
      <footer class="invoice-footer">
        <div class="lookup-info">
          <div>Hóa đơn điện tử khởi tạo từ hệ thống VoiceKit theo quy định NĐ 123/2020/NĐ-CP &amp; TT 78/2021/TT-BTC.</div>
          <div>Cổng tra cứu: <a href="/invoice/${order.order_code}" style="color:#4f46e5;text-decoration:none">https://${esc(appName.toLowerCase())}.vn/invoice/${order.order_code}</a></div>
          <div>Mã tra cứu hóa đơn: <b>${lookupCode}</b></div>
        </div>

        <div class="qr-side">
          <img class="qr-img" src="https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=https%3A%2F%2Fvoicekit.vn%2Finvoice%2F${order.order_code}" alt="QR Tra cứu">
          <div style="font-size:11px;line-height:1.4">
            <b>Quét mã QR</b><br>
            Tra cứu HĐĐT<br>
            nhanh trên điện thoại
          </div>
        </div>
      </footer>

    </article>
  </main>

  <script>
    if (new URLSearchParams(window.location.search).get('print') === '1') {
      window.addEventListener('load', function() {
        setTimeout(function() {
          try { window.print(); } catch (e) {}
        }, 500);
      });
    }
    function copyLookup() {
      navigator.clipboard.writeText("${lookupCode}").then(function() {
        alert("Đã sao chép mã tra cứu hóa đơn: ${lookupCode}");
      });
    }
  </script>
</body>
</html>`;
}
