'use strict';
/* VoiceKit - tài khoản, gói, lượt dùng, thanh toán payOS. Dùng chung tiện ích ($, api, toast, showView...) từ app.js. */

const vkAccount = (() => {
  const acc = { enabled: false, smtp: false, user: null, plan: null, usage: null, plans: [], packages: [], payEnabled: false, selectedPkg: null, resetToken: null };
  const post = (url, body = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const initials = (u) => ((u?.name || u?.email || '?').trim()[0] || '?').toUpperCase();
  const fmt = (n) => Number(n).toLocaleString('vi-VN');
  const money = (n) => fmt(n) + 'đ';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function load() {
    let res;
    try { res = await fetch('/api/me', { cache: 'no-store' }); } catch { res = null; }
    // Máy chủ không có tài khoản (start.bat / host tĩnh): 404 hoặc accounts:false -> mở khóa như bản cá nhân
    if (res && res.status === 404) return disable();
    const me = res && res.ok ? await res.json().catch(() => null) : null;
    if (me && me.accounts === false) return disable();
    if (!me) { applyKeyGate(false, null); return; } // lỗi tạm thời: giữ khóa
    Object.assign(acc, { enabled: true, smtp: me.smtp, user: me.user, plan: me.plan, usage: me.usage, plans: me.plans });
    if (me.theme && typeof vkTheme !== 'undefined') vkTheme.apply(me.theme);
    try {
      const p = await api('/api/pay/packages');
      acc.packages = p.packages || []; acc.payEnabled = !!p.enabled; acc.credits = p.credits || { enabled: false };
      if (!acc.packages.some(x => x.id === acc.selectedPkg)) acc.selectedPkg = (acc.packages[1] || acc.packages[0])?.id || null;
    } catch { acc.packages = []; acc.payEnabled = false; }
    $$('[data-acc]').forEach(el => el.hidden = false);
    render();
  }
  function disable() {
    acc.enabled = false;
    $$('[data-acc]').forEach(el => el.hidden = true);
    $('#tab-admin').hidden = true;
    renderQuota();
    applyKeyGate(true, null); // website không bật tài khoản (vd: start.bat) -> ai cũng dùng key được
  }

  function render() {
    const u = acc.user;
    applyKeyGate(!!u, u ? u.id : null);
    $('#acc-avatar').textContent = u ? initials(u) : '?';
    $('#acc-name').textContent = u ? (u.name || u.email.split('@')[0]) : 'Đăng nhập';
    $('#acc-plan').textContent = acc.plan?.name || 'Khách';
    $('#tab-admin').hidden = !u?.admin;
    $('#acc-guest').hidden = !!u && !acc.resetToken;
    $('#acc-user').hidden = !u || !!acc.resetToken;
    $('#acc-title').textContent = acc.resetToken ? 'Đặt lại mật khẩu' : u ? 'Tài khoản của bạn' : 'Đăng nhập / Đăng ký';
    if (u) {
      $('#prof-avatar').textContent = initials(u);
      $('#prof-name').textContent = u.name || u.email.split('@')[0];
      $('#prof-email').textContent = u.email;
      $('#verify-banner').hidden = u.verified;
      $('#prof-plan').textContent = acc.plan.name;
      $('#prof-expire').textContent = u.effectivePlan === 'premium' ? (u.planExpires ? 'Hết hạn ' + new Date(u.planExpires).toLocaleDateString('vi-VN') : 'Vĩnh viễn') : '';
      $('#btn-see-plans').textContent = u.effectivePlan === 'premium' ? 'Gia hạn Premium' : 'Nâng cấp Premium';
    }
    const isPrem = acc.plan.id === 'premium';
    $('#prof-credits').hidden = !(u && (isPrem || acc.usage.credits > 0) && acc.credits?.enabled);
    $('#prof-credits-n').textContent = fmt(acc.usage.credits || 0);
    $('#btn-buy-credits').hidden = !isPrem;
    const used = acc.plan.ttsCalls - acc.usage.remaining;
    $('#prof-bar').style.width = Math.min(100, used / Math.max(1, acc.plan.ttsCalls) * 100) + '%';
    $('#prof-usage').textContent = `Hôm nay đã dùng ${fmt(used)}/${fmt(acc.plan.ttsCalls)} lượt ${acc.plan.id === 'premium' ? 'Edge/CapCut' : 'Edge Neural'} · tối đa ${fmt(acc.plan.maxChars)} ký tự mỗi lượt`;
    renderQuota();
    // Gói đổi -> cập nhật khóa Premium (kho CapCut, nút AI)
    renderLibOptions();
    updateLibLock();
    if (state.raw.length) $('#ai-row').hidden = !(isPremium() && (keyGet('gemini') || keyGet('groq')));
    if ($('#view-plans').classList.contains('active')) renderPlans();
  }

  /* Ô hiển thị lượt còn lại ở trang Chữ -> Giọng (chỉ cho kho chạy qua máy chủ) */
  function renderQuota() {
    const chip = $('#quota-chip');
    const serverLib = ['edge', 'capcut', 'vieneu', 'supertonic'].includes(typeof tts !== 'undefined' ? tts.lib : '');
    if (!acc.enabled || !serverLib) { chip.hidden = true; $('#tts-count').style.color = ''; return; }
    chip.hidden = false;
    const p = acc.plan, r = acc.usage.remaining;
    const freeCalls = acc.plans.find(x => x.id === 'free')?.ttsCalls ?? 50;
    const cta = !acc.user ? `<button data-open="register">Đăng ký để có ${fmt(freeCalls)} lượt/ngày →</button>`
      : !acc.user.verified ? `<button data-open="account">Xác minh email để có ${fmt(freeCalls)} lượt/ngày →</button>`
      : p.id !== 'premium' ? '<button data-open="plans">Nâng cấp Premium →</button>' : '';
    const extra = p.id === 'premium' && acc.usage.credits ? ` · <b>+${fmt(acc.usage.credits)}</b> lượt mua thêm` : '';
    const buy = p.id === 'premium' && acc.credits?.enabled ? `<button data-open="credits">${r === 0 && !acc.usage.credits ? '⚡ Hết lượt, mua thêm →' : 'Mua thêm lượt →'}</button>` : '';
    chip.innerHTML = `<span>Gói <b>${p.name}</b>: còn <b>${fmt(r)}/${fmt(p.ttsCalls)}</b> lượt hôm nay${extra} · tối đa ${fmt(p.maxChars)} ký tự/lượt</span>${cta}${buy}`;
    const len = $('#tts-text').value.length;
    $('#tts-count').textContent = `${fmt(len)} / ${fmt(p.maxChars)} ký tự`;
    $('#tts-count').style.color = len > p.maxChars ? 'var(--danger)' : '';
  }

  /* ---------- Bảng giá ---------- */
  function renderPlans() {
    const cur = acc.plan?.id;
    $('#plans-grid').innerHTML = acc.plans.map(p => `
      <div class="plan-card ${p.id === 'free' ? 'featured' : ''} ${p.id === 'premium' ? 'premium-card' : ''} ${p.id === cur ? 'current' : ''}">
        <h3>${p.name}</h3>
        <div class="plan-price">${p.id === 'premium' && acc.payEnabled && acc.packages.length ? 'từ ' + p.price : p.price || '—'}</div>
        <div class="plan-limit"><b>${fmt(p.ttsCalls)}</b> lượt ${p.id === 'premium' ? 'AI cao cấp (VieNeu, Supertonic, CapCut, Edge)' : 'Edge Neural'}/ngày · <b>${fmt(p.maxChars)}</b> ký tự/lượt</div>
        <ul>${p.perks.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        ${p.id === 'premium' ? premiumBox() : planAction(p)}
      </div>`).join('');
    $$('#plans-grid [data-open]').forEach(b => b.addEventListener('click', () => openFrom(b.dataset.open)));
    $$('#plans-grid .pkg-opt').forEach(el => el.addEventListener('click', () => { acc.selectedPkg = el.dataset.pkg; renderPlans(); }));
    $('#btn-buy')?.addEventListener('click', () => vkPay.start(acc.selectedPkg));
    const cc = $('#credits-card');
    cc.hidden = !(acc.payEnabled && acc.credits?.enabled);
    if (!cc.hidden) {
      const prem = acc.plan?.id === 'premium';
      $('#credits-card-text').textContent = `${fmt(acc.credits.price)}đ / lượt giọng AI · cộng dồn, không hết hạn theo ngày · dùng khi đã hết lượt trong ngày.${prem ? '' : ' Chỉ dành cho gói Premium.'}`;
      $('#btn-credits-card').disabled = !prem;
      $('#btn-credits-card').textContent = prem ? 'Mua thêm lượt' : 'Cần gói Premium';
    }
  }
  function planAction(p) {
    const u = acc.user;
    if (p.id === 'guest') return u ? '' : '<button class="btn" disabled>Đang dùng</button>';
    if (!u) return '<button class="btn primary" data-open="register">Đăng ký miễn phí</button>';
    if (!u.verified) return '<button class="btn primary" data-open="account">Xác minh email</button>';
    return '';
  }
  function premiumBox() {
    if (!acc.payEnabled || !acc.packages.length) return '<button class="btn" disabled>Tạm ngừng bán</button>';
    const list = acc.packages.map(k => `
      <label class="pkg-opt ${k.id === acc.selectedPkg ? 'selected' : ''}" data-pkg="${esc(k.id)}">
        <span><b>${esc(k.name)}</b>${k.save ? `<span class="pkg-save">-${k.save}%</span>` : ''}</span>
        <span class="pkg-price">${money(k.price)}</span>
      </label>`).join('');
    const u = acc.user;
    const btn = !u ? '<button class="btn primary" data-open="register">Đăng ký để mua Premium</button>'
      : !u.verified ? '<button class="btn primary" data-open="account">Xác minh email để mua</button>'
      : `<button class="btn primary" id="btn-buy">${u.effectivePlan === 'premium' ? 'Gia hạn' : 'Mua'} Premium</button>`;
    return `<div class="pkg-list">${list}</div>${btn}`;
  }

  function openFrom(what) {
    if (what === 'plans') { $('#modal-account').hidden = true; showView('plans'); return; }
    if (what === 'credits') { $('#modal-account').hidden = true; return buyCredits(); }
    openModal('#modal-account');
    if (what === 'register' && !acc.user) switchForm('register');
    else if (!acc.user) switchForm('login');
    else loadMyOrders();
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#quota-chip [data-open]');
    if (b) openFrom(b.dataset.open);
  });

  function switchForm(name) {
    $$('.auth-form[data-form]').forEach(f => { if (f.id !== 'form-password') f.hidden = f.dataset.form !== name; });
    $$('#auth-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.auth === name));
    $('#auth-seg').hidden = name === 'reset' || name === 'forgot' || name === 'resend';
  }
  $$('[data-auth]').forEach(b => b.addEventListener('click', () => switchForm(b.dataset.auth)));

  // Hiện / ẩn mật khẩu và thanh độ mạnh mật khẩu
  $$('#modal-account [data-eye]').forEach(b => b.addEventListener('click', () => {
    const i = b.previousElementSibling, show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    show ? i.setAttribute('data-shown', '') : i.removeAttribute('data-shown');
    b.textContent = show ? '🙈' : '👁';
  }));
  $('[data-strength]').addEventListener('input', (e) => {
    const v = e.target.value, meter = $('#pw-meter');
    let score = 0;
    if (v.length >= 8) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v) || v.length >= 14) score++;
    if (v.length < 8) score = Math.min(score, 1);
    meter.dataset.score = v ? score : 0;
    meter.querySelector('span').textContent = v ? ['Rất yếu', 'Yếu', 'Tạm được', 'Khá mạnh', 'Rất mạnh'][score] : '';
  });
  // Mỗi lần mở modal: vẽ lại tranh theo mùa (có hạt rơi mới)
  new MutationObserver(() => { if (!$('#modal-account').hidden && typeof vkTheme !== 'undefined') vkTheme.renderHero(); })
    .observe($('#modal-account'), { attributes: true, attributeFilter: ['hidden'] });

  async function submit(form, fn) {
    const btn = form.querySelector('[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Đang xử lý…';
    try { await fn(Object.fromEntries(new FormData(form))); }
    catch (e) { toast(e.message, 'err'); }
    btn.disabled = false; btn.textContent = label;
  }

  $('#form-login').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/login', d); e.target.reset(); await load(); $('#modal-account').hidden = true; toast('Đăng nhập thành công.', 'ok');
  }); });
  $('#form-register').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    const r = await post('/api/auth/register', d); e.target.reset(); await load();
    toast(r.mailSent ? `Đã tạo tài khoản. Hãy mở email ${r.user.email} để xác minh.` : 'Đã tạo tài khoản nhưng chưa gửi được email xác minh: ' + (r.mailError || ''), r.mailSent ? 'ok' : 'err');
  }); });
  $('#form-resend')?.addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    const r = await post('/api/auth/resend-verify', d);
    e.target.reset();
    toast(r.message || `Đã gửi lại email xác minh tới ${d.email}. Hãy kiểm tra hộp thư.`, 'ok');
    switchForm('login');
  }); });
  $('#form-forgot').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/forgot', d); e.target.reset(); switchForm('login');
    toast('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.', 'ok');
  }); });
  $('#form-reset').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/reset', { token: acc.resetToken, password: d.password });
    acc.resetToken = null; e.target.reset(); await load(); $('#modal-account').hidden = true; toast('Đã đổi mật khẩu và đăng nhập.', 'ok');
  }); });
  $('#form-password').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/password', d); e.target.reset(); e.target.closest('details').open = false; toast('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.', 'ok');
  }); });
  $('#btn-resend').addEventListener('click', async (e) => {
    e.target.disabled = true;
    const oldText = e.target.textContent;
    e.target.textContent = 'Đang gửi…';
    try {
      const r = await post('/api/auth/resend-verify');
      toast(r.message || 'Đã gửi lại email xác minh mới.', 'ok');
    } catch (err) {
      toast(err.message, 'err');
    } finally {
      e.target.disabled = false;
      e.target.textContent = oldText;
    }
  });
  $('#btn-logout').addEventListener('click', async () => { await post('/api/auth/logout').catch(() => {}); await load(); $('#modal-account').hidden = true; toast('Đã đăng xuất.'); });
  $('#btn-see-plans').addEventListener('click', () => openFrom('plans'));
  function buyCredits() {
    if (!acc.credits?.enabled) return toast('Tạm ngừng bán lượt.', 'err');
    if (acc.plan?.id !== 'premium') { toast('Mua thêm lượt chỉ dành cho gói Premium.', 'err'); return showView('plans'); }
    vkPay.startCredits();
  }
  $('#btn-buy-credits').addEventListener('click', () => { $('#modal-account').hidden = true; buyCredits(); });
  $('#btn-credits-card').addEventListener('click', () => { if (!acc.user) return openFrom('register'); buyCredits(); });
  $('#btn-account').addEventListener('click', () => { if (!acc.user) switchForm('login'); else loadMyOrders(); openModal('#modal-account'); });

  /* Đơn hàng gần đây trong hộp tài khoản */
  async function loadMyOrders() {
    const box = $('#prof-orders');
    if (!box || !acc.user) return;
    try {
      const { orders } = await api('/api/pay/my-orders');
      const shown = orders.filter(o => o.status === 'PAID' || o.status === 'PENDING').slice(0, 5);
      const label = { PAID: 'Đã thanh toán', PENDING: 'Đang chờ' };
      box.innerHTML = shown.length ? `<div class="orders-mini">${shown.map(o => `
        <div><span>#${o.orderCode} · ${o.kind === 'credits' ? esc(o.packageName) : 'Premium ' + esc(o.packageName)}</span>
        <span>${money(o.amount)} · <span class="st ${o.status}">${label[o.status]}</span>
        ${o.status === 'PENDING' ? `<button class="copy-mini" data-resume="${o.orderCode}">Tiếp tục</button>` : `<a class="copy-mini" href="/invoice/${o.orderCode}" target="_blank" rel="noopener">Hóa đơn</a>`}</span></div>`).join('')}</div>` : '';
      $$('#prof-orders [data-resume]').forEach(b => b.addEventListener('click', () => { $('#modal-account').hidden = true; vkPay.resume(Number(b.dataset.resume)); }));
    } catch { box.innerHTML = ''; }
  }

  /* Liên kết trong email: ?verify=... ?reset=... và payOS trả về ?pay=return|cancel&order=... */
  async function handleLinks() {
    const q = new URLSearchParams(location.search);
    const verify = q.get('verify'), reset = q.get('reset'), pay = q.get('pay'), order = Number(q.get('order'));
    if (!verify && !reset && !pay) return;
    history.replaceState(null, '', location.pathname);
    if (verify) {
      try {
        const r = await post('/api/auth/verify', { token: verify });
        await load();
        if (r.already) {
          toast('Tài khoản này đã được xác minh trước đó rồi.', 'ok');
        } else {
          toast('🎉 Email đã được xác minh thành công! Gói Miễn phí đã mở.', 'ok');
        }
      } catch (e) {
        if (e.expired || e.message?.includes('hết hạn')) {
          toast('⚠️ Liên kết xác minh đã hết hạn. Hãy nhập email để nhận liên kết mới.', 'err');
          if (e.email) {
            const inp = $('#resend-email');
            if (inp) inp.value = e.email;
          }
          switchForm('resend');
          openModal('#modal-account');
        } else {
          toast(e.message, 'err');
        }
      }
    } else if (reset) {
      acc.resetToken = reset; render(); switchForm('reset'); openModal('#modal-account');
    } else if (pay && order) {
      if (pay === 'cancel') {
        try { await post(`/api/pay/order/${order}/cancel`); } catch {}
        toast('Bạn đã hủy thanh toán. Có thể mua lại bất cứ lúc nào.');
        showView('plans');
      } else vkPay.resume(order);
    }
  }

  /* Gọi từ app.js sau mỗi lần tạo giọng qua máy chủ */
  function onTtsResponse(res) {
    const left = res.headers.get('X-Quota-Remaining');
    const cr = res.headers.get('X-Credits-Remaining');
    if (left !== null && acc.usage) { acc.usage.remaining = Number(left); if (cr !== null) acc.usage.credits = Number(cr); render(); }
  }
  function onQuotaError(err) {
    if (acc.usage && err.error?.includes('Đã hết')) { acc.usage.remaining = 0; acc.usage.credits = 0; render(); }
    if (err.buyCredits) setTimeout(() => { if (confirm('Bạn đã hết lượt hôm nay. Mua thêm lượt để dùng tiếp ngay?')) buyCredits(); }, 300);
  }

  $('#tts-text').addEventListener('input', () => acc.enabled && renderQuota());

  load().then(handleLinks);
  return { load, renderQuota, renderPlans, onTtsResponse, onQuotaError, loadMyOrders, get state() { return acc; } };
})();

/* ---------- Thanh toán payOS (VietQR ngay trên trang) ---------- */
const vkPay = (() => {
  let order = null, pollTimer = 0, tickTimer = 0, skew = 0, banks = null, qrLib = null;
  const fmt = (n) => Number(n).toLocaleString('vi-VN');
  const show = (id) => ['pay-confirm', 'pay-loading', 'pay-main', 'pay-done', 'pay-failed'].forEach(x => { $('#' + x).hidden = x !== id; });
  let invType = 'personal', pendingPkg = null, payKind = 'premium';
  const stop = () => { clearInterval(pollTimer); clearInterval(tickTimer); pollTimer = tickTimer = 0; };

  // Đóng hộp thì dừng hỏi trạng thái
  new MutationObserver(() => { if ($('#modal-pay').hidden) stop(); }).observe($('#modal-pay'), { attributes: true, attributeFilter: ['hidden'] });

  async function loadQrLib() {
    if (qrLib) return qrLib;
    await new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
      s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    });
    return (qrLib = window.qrcode);
  }
  async function bankName(bin) {
    if (!bin) return '—';
    try {
      banks ||= (await (await fetch('https://api.vietqr.io/v2/banks')).json()).data || [];
      const b = banks.find(x => x.bin === String(bin));
      return b ? `${b.shortName} (${b.name})` : bin;
    } catch { return bin; }
  }

  async function render(o) {
    order = o;
    $('#pay-title').textContent = o.kind === 'credits' ? `Thanh toán ${o.packageName}` : `Thanh toán Premium ${o.packageName}`;
    $('#pay-amount').textContent = fmt(o.amount) + 'đ';
    $('#pay-pkg').textContent = o.kind === 'credits' ? `Mã đơn #${o.orderCode} · cộng ${fmt(o.credits)} lượt Edge / CapCut` : `Mã đơn #${o.orderCode} · cộng ${fmt(o.days)} ngày Premium`;
    $('#pay-acc').textContent = o.accountNumber || '—';
    $('#pay-name').textContent = o.accountName || '—';
    $('#pay-desc').textContent = o.description;
    $('#pay-open').href = o.checkoutUrl || '#';
    $('#pay-bank').textContent = await bankName(o.bankBin);
    const box = $('#pay-qr');
    box.textContent = '';
    if (o.qrCode) {
      try {
        const qr = (await loadQrLib())(0, 'M');
        qr.addData(o.qrCode); qr.make();
        box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
      } catch { box.innerHTML = '<span class="muted small">Không vẽ được mã QR. Hãy bấm "Mở trang payOS".</span>'; }
    }
    show('pay-main');
    tick();
    clearInterval(tickTimer); tickTimer = setInterval(tick, 1000);
    clearInterval(pollTimer); pollTimer = setInterval(poll, 3000);
  }

  function tick() {
    if (!order?.expiredAt) return;
    const left = Math.max(0, Math.floor(order.expiredAt - (Date.now() + skew) / 1000));
    $('#pay-countdown').textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
    if (left === 0) poll();
  }

  async function poll() {
    if (!order) return;
    try {
      const { order: o } = await api(`/api/pay/order/${order.orderCode}`);
      if (o.status === 'PAID') return finish(o);
      if (o.status === 'CANCELLED' || o.status === 'EXPIRED') {
        stop(); show('pay-failed');
        $('#pay-failed-title').textContent = o.status === 'EXPIRED' ? 'Đơn đã hết hạn' : 'Đơn đã bị hủy';
      }
    } catch { /* mạng chập chờn: thử lại lần sau */ }
  }

  async function finish(o) {
    stop();
    show('pay-done');
    $('#pay-done-text').textContent = o.kind === 'credits' ? `Đã nhận ${fmt(o.amount)}đ. Đã cộng ${fmt(o.credits)} lượt vào tài khoản, biên lai đã gửi về email.` : `Đã nhận ${fmt(o.amount)}đ cho Premium ${o.packageName}. Biên lai đã được gửi về email của bạn.`;
    $('#pay-invoice').href = `/invoice/${o.orderCode}`;
    await vkAccount.load();
    toast(o.kind === 'credits' ? `Đã cộng ${fmt(o.credits)} lượt!` : 'Premium đã được kích hoạt!', 'ok');
  }

  function setInvType(t) {
    invType = t;
    $$('#pc-type .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
    $('#pc-name-label').textContent = t === 'company' ? 'Tên công ty' : 'Họ tên người mua';
    $('#pc-tax-opt').textContent = t === 'company' ? 'bắt buộc' : 'tùy chọn';
    $('#pc-addr-opt').textContent = t === 'company' ? 'bắt buộc' : 'tùy chọn';
  }
  $$('#pc-type .seg-btn').forEach(b => b.addEventListener('click', () => setInvType(b.dataset.type)));
  $('#pc-invoice').addEventListener('change', (e) => { $('#pc-form').hidden = !e.target.checked; if (e.target.checked) $('#pc-name').focus(); });
  $('#pc-tax').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/[^\d-]/g, ''); });

  /** Bước 1: xác nhận gói + (tùy chọn) thông tin xuất hóa đơn */
  function start(packageId) {
    const pkg = vkAccount.state.packages.find(p => p.id === packageId);
    if (!pkg) return toast('Hãy chọn một gói Premium.', 'err');
    pendingPkg = pkg; payKind = 'premium';
    $('#pc-credits').hidden = true;
    const u = vkAccount.state.user || {};
    $('#pay-title').textContent = 'Xác nhận đơn hàng';
    $('#pc-pkg').textContent = `Premium ${pkg.name} · ${fmt(pkg.days)} ngày`;
    $('#pc-amount').textContent = fmt(pkg.price) + 'đ';
    payLabel();
    if (!$('#pc-name').value) $('#pc-name').value = u.name || '';
    if (!$('#pc-email').value) $('#pc-email').value = u.email || '';
    openModal('#modal-pay'); show('pay-confirm');
  }
  const payMode = () => document.querySelector('input[name=pc-mode]:checked')?.value || 'api';
  function payLabel() {
    if (!pendingPkg) return;
    const total = fmt(pendingPkg.price) + 'đ';
    $('#pc-continue').textContent = payMode() === 'redirect' ? `Tiếp tục tới payOS · ${total} →` : `Tạo mã QR · ${total}`;
  }
  $$('input[name=pc-mode]').forEach(r => r.addEventListener('change', payLabel));
  /* Mua thêm lượt: chọn số lượt rồi dùng chung bước xác nhận / thanh toán */
  function creditQty() { return Math.floor(Number($('#pc-qty').value)) || 0; }
  function syncCredits() {
    const c = vkAccount.state.credits, q = creditQty();
    $$('#pc-presets .credit-preset').forEach(b => b.classList.toggle('active', Number(b.dataset.q) === q));
    pendingPkg = { id: 'credits', name: `${fmt(q)} lượt`, days: 0, price: q * c.price };
    $('#pc-pkg').textContent = `${fmt(q)} lượt Edge / CapCut`;
    $('#pc-amount').textContent = fmt(pendingPkg.price) + 'đ';
    payLabel();
  }
  function startCredits() {
    const c = vkAccount.state.credits;
    payKind = 'credits';
    const u = vkAccount.state.user || {};
    $('#pay-title').textContent = 'Mua thêm lượt';
    $('#pc-unit').textContent = `· ${fmt(c.price)}đ / lượt`;
    $('#pc-presets').innerHTML = c.presets.map(q => `<button type="button" class="credit-preset" data-q="${q}"><b>${fmt(q)}</b><small>${fmt(q * c.price)}đ</small></button>`).join('');
    $$('#pc-presets .credit-preset').forEach(b => b.addEventListener('click', () => { $('#pc-qty').value = b.dataset.q; syncCredits(); }));
    const qty = $('#pc-qty');
    qty.min = c.min; qty.max = c.max;
    qty.value = c.presets[1] || c.presets[0] || c.min;
    $('#pc-credits').hidden = false;
    if (!$('#pc-name').value) $('#pc-name').value = u.name || '';
    if (!$('#pc-email').value) $('#pc-email').value = u.email || '';
    syncCredits();
    openModal('#modal-pay'); show('pay-confirm');
  }
  $('#pc-qty').addEventListener('input', () => { if (payKind === 'credits') syncCredits(); });

  $('#pc-continue').addEventListener('click', async () => {
    if (!pendingPkg) return;
    if (payKind === 'credits') {
      const c = vkAccount.state.credits, q = creditQty();
      if (q < c.min || q > c.max) return toast(`Số lượt mua từ ${fmt(c.min)} đến ${fmt(c.max)}.`, 'err');
    }
    const invoice = $('#pc-invoice').checked ? {
      enabled: true, type: invType, name: $('#pc-name').value.trim(), tax_code: $('#pc-tax').value.trim(),
      address: $('#pc-addr').value.trim(), email: $('#pc-email').value.trim()
    } : null;
    if (invoice) {
      if (!invoice.name) return toast(invType === 'company' ? 'Nhập tên công ty.' : 'Nhập họ tên người mua.', 'err');
      if (invType === 'company' && !/^\d{10}(-\d{3})?$/.test(invoice.tax_code)) return toast('Mã số thuế phải gồm 10 số (hoặc 10 số + "-" + 3 số).', 'err');
      if (invType === 'company' && !invoice.address) return toast('Nhập địa chỉ công ty.', 'err');
    }
    show('pay-loading');
    try {
      const mode = payMode();
      const r = await api('/api/pay/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payKind === 'credits' ? { kind: 'credits', quantity: creditQty(), invoice, mode } : { packageId: pendingPkg.id, invoice, mode }) });
      if (mode === 'redirect' && r.order.checkoutUrl) {
        $('#pay-loading span').textContent = 'Đang chuyển sang payOS…';
        location.href = r.order.checkoutUrl;
        return;
      }
      await render(r.order);
    } catch (e) { show('pay-confirm'); toast(e.message, 'err'); }
  });

  async function resume(orderCode) {
    openModal('#modal-pay'); show('pay-loading');
    try {
      const { order: o } = await api(`/api/pay/order/${orderCode}`);
      if (o.status === 'PAID') return finish(o);
      if (o.status !== 'PENDING') { show('pay-failed'); $('#pay-failed-title').textContent = o.status === 'EXPIRED' ? 'Đơn đã hết hạn' : 'Đơn đã bị hủy'; return; }
      await render(o);
    } catch (e) { $('#modal-pay').hidden = true; toast(e.message, 'err'); }
  }

  $('#pay-cancel').addEventListener('click', async () => {
    if (!order || !confirm('Hủy đơn thanh toán này?')) return;
    stop();
    try { await api(`/api/pay/order/${order.orderCode}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
    $('#modal-pay').hidden = true; toast('Đã hủy đơn.');
  });
  $$('#modal-pay [data-copy]').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard.writeText($('#' + b.dataset.copy).textContent.trim()).then(() => toast('Đã chép.', 'ok'));
  }));

  return { start, startCredits, resume };
})();
