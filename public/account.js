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
    let me;
    try {
      me = await api('/api/me');
    } catch (e) {
      if (e.status === 404 || e.accounts === false) return disable();
      applyKeyGate(false, null);
      return;
    }
    if (!me || me.accounts === false) return disable();
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
    applyKeyGate(!!u && !!u.verified, u ? u.id : null);
    $('#acc-avatar').textContent = u ? initials(u) : '?';
    $('#acc-name').textContent = u ? (u.name || u.email.split('@')[0]) : 'Đăng nhập';
    $('#acc-plan').textContent = acc.plan?.name || 'Khách';
    $('#btn-account').classList.toggle('is-premium', acc.plan?.id === 'premium');
    $('#tts-text').maxLength = acc.plan?.id === 'premium' ? TTS_LONG_MAX : 20000;
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
    // Gói đổi -> cập nhật khóa Premium (kho CapCut, nút AI, danh sách model STT)
    renderLibOptions();
    updateLibLock();
    if (typeof renderLocalEngines === 'function') renderLocalEngines();
    if (typeof updateSrtPanel === 'function') updateSrtPanel();
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
    const long = p.id === 'premium' && len > p.maxChars;
    const limit = p.id === 'premium' ? TTS_LONG_MAX : p.maxChars;
    $('#tts-count').textContent = long
      ? `${fmt(len)} / ${fmt(limit)} ký tự · văn bản dài, chia ~${Math.ceil(len / p.maxChars)} đoạn`
      : `${fmt(len)} / ${fmt(p.id === 'premium' ? p.maxChars : limit)} ký tự`;
    $('#tts-count').style.color = len > limit ? 'var(--danger)' : long ? 'var(--gold)' : '';
  }

  /* ---------- Bảng giá ---------- */
  const PLAN_META = {
    guest: { icon: '👋', tag: 'Dùng thử nhanh, không cần tài khoản' },
    free: { icon: '🎧', tag: 'Cho cá nhân dùng hằng ngày' },
    premium: { icon: '👑', tag: 'Cho nhà sáng tạo nội dung, sách nói, video' }
  };
  // Số perk đầu tiên được tô nổi bật trên thẻ Premium
  const PREMIUM_HIGHLIGHTS = 4;

  function selectedPackage() {
    return acc.packages.find(k => k.id === acc.selectedPkg) || acc.packages[0] || null;
  }

  function renderPlans() {
    const cur = acc.plan?.id;
    renderPeriod();
    $('#plans-grid').innerHTML = acc.plans.map(p => {
      const meta = PLAN_META[p.id] || { icon: '•', tag: '' };
      const prem = p.id === 'premium';
      const perks = p.perks.map((x, i) => `<li class="${prem && i > 0 && i <= PREMIUM_HIGHLIGHTS ? 'hl' : ''}"><svg><use href="#i-check"/></svg><span>${esc(x)}</span></li>`).join('');
      return `
      <div class="plan-card ${prem ? 'premium-card' : ''} ${p.id === cur ? 'current' : ''}">
        ${prem ? '<span class="plan-ribbon">Phổ biến nhất</span>' : ''}
        <div class="plan-head">
          <span class="plan-icon">${meta.icon}</span>
          <div><h3>${esc(p.name)}</h3><p class="plan-tag">${meta.tag}</p></div>
        </div>
        ${prem ? premiumPrice() : `<div class="plan-price"><b>${esc(p.price || '0đ')}</b></div><div class="plan-sub muted small">${p.id === 'guest' ? 'Không cần đăng ký' : 'Mãi mãi, chỉ cần xác minh email'}</div>`}
        <div class="plan-stats">
          <div><b>${fmt(p.ttsCalls)}</b><small>lượt / ngày</small></div>
          <div><b>${fmt(p.maxChars)}</b><small>ký tự / lượt</small></div>
          <div><b>${prem ? '4' : '1'}</b><small>kho giọng AI</small></div>
        </div>
        ${prem ? premiumAction() : planAction(p)}
        <ul class="plan-perks">${perks}</ul>
      </div>`;
    }).join('');
    $$('#plans-grid [data-open]').forEach(b => b.addEventListener('click', () => openFrom(b.dataset.open)));
    $('#btn-buy')?.addEventListener('click', () => vkPay.start(acc.selectedPkg));
    renderCompare();
    renderCreditTiers();
  }

  function renderPeriod() {
    const box = $('#pr-period');
    const show = acc.payEnabled && acc.packages.length > 1;
    box.hidden = !show;
    if (!show) return;
    box.innerHTML = acc.packages.map(k => `
      <button type="button" role="tab" class="${k.id === acc.selectedPkg ? 'active' : ''}" data-pkg="${esc(k.id)}">
        ${esc(k.name)}${k.save ? `<em>-${k.save}%</em>` : ''}
      </button>`).join('');
    $$('#pr-period button').forEach(b => b.addEventListener('click', () => { acc.selectedPkg = b.dataset.pkg; renderPlans(); }));
  }

  function premiumPrice() {
    const k = acc.payEnabled ? selectedPackage() : null;
    if (!k) return '<div class="plan-price"><b>Tạm ngừng bán</b></div><div class="plan-sub muted small">Vui lòng quay lại sau</div>';
    const months = Math.max(1, k.days / 30);
    const perMonth = Math.round(k.price / months / 1000) * 1000;
    const base = acc.packages.find(x => x.days <= 31);
    const full = base && base !== k ? Math.round(base.price * (k.days / base.days)) : 0;
    return `
      <div class="plan-price"><b>${money(perMonth)}</b><span>/tháng</span></div>
      <div class="plan-sub small">
        Thanh toán <b>${money(k.price)}</b> cho ${esc(k.name)}
        ${full > k.price ? `<s class="muted">${money(full)}</s><span class="pkg-save">Tiết kiệm ${money(full - k.price)}</span>` : ''}
      </div>`;
  }

  function planAction(p) {
    const u = acc.user;
    if (p.id === 'guest') return `<button class="btn block" disabled>${u ? 'Gói cơ bản' : 'Đang dùng'}</button>`;
    if (!u) return '<button class="btn block" data-open="register">Đăng ký miễn phí</button>';
    if (!u.verified) return '<button class="btn block" data-open="account">Xác minh email</button>';
    return `<button class="btn block" disabled>${acc.plan?.id === 'free' ? 'Gói hiện tại' : 'Đã bao gồm'}</button>`;
  }

  function premiumAction() {
    if (!acc.payEnabled || !acc.packages.length) return '<button class="btn block" disabled>Tạm ngừng bán</button>';
    const u = acc.user;
    if (!u) return '<button class="btn gold block" data-open="register">Đăng ký để mua Premium</button>';
    if (!u.verified) return '<button class="btn gold block" data-open="account">Xác minh email để mua</button>';
    const k = selectedPackage();
    const renew = u.effectivePlan === 'premium';
    return `<button class="btn gold block" id="btn-buy">${renew ? 'Gia hạn' : 'Nâng cấp'} Premium ${esc(k?.name || '')} →</button>
      ${renew && u.planExpires ? `<p class="plan-sub muted small center-t">Đang dùng đến ${new Date(u.planExpires).toLocaleDateString('vi-VN')}, gia hạn được cộng dồn</p>` : ''}`;
  }

  function renderCompare() {
    const P = Object.fromEntries(acc.plans.map(p => [p.id, p]));
    const ids = acc.plans.map(p => p.id);
    const Y = '<span class="yes">✓</span>', N = '<span class="no">—</span>';
    const row = (label, vals) => `<tr><th scope="row">${label}</th>${ids.map(id => `<td class="${id === 'premium' ? 'col-prem' : ''}">${vals(id)}</td>`).join('')}</tr>`;
    const only = (...allowed) => (id) => allowed.includes(id) ? Y : N;
    const all = () => Y;
    const group = (t) => `<tr class="grp"><th colspan="${ids.length + 1}">${t}</th></tr>`;
    $('#pr-compare').innerHTML = `
      <thead><tr><th></th>${ids.map(id => `<th class="${id === 'premium' ? 'col-prem' : ''}">${PLAN_META[id]?.icon || ''} ${esc(P[id].name)}</th>`).join('')}</tr></thead>
      <tbody>
        ${group('Hạn mức')}
        ${row('Lượt giọng AI máy chủ mỗi ngày', id => `<b>${fmt(P[id].ttsCalls)}</b>`)}
        ${row('Ký tự mỗi lượt', id => `<b>${fmt(P[id].maxChars)}</b>`)}
        ${row('Đọc văn bản dài (tự chia đoạn, tới 100.000 ký tự)', only('premium'))}
        ${row('Mua thêm lượt cộng dồn', only('premium'))}
        ${group('Kho giọng Text-to-Speech')}
        ${row('Microsoft Edge Neural (300+ giọng)', all)}
        ${row('Piper, Meta MMS, giọng trình duyệt (chạy trên máy)', all)}
        ${row('VieNeu-TTS Studio Pro: 35 giọng Bắc · Trung · Nam (Review phim, VTV, Kể chuyện trinh thám, MC Bán hàng, ASMR...)', only('premium'))}
        ${row('Supertonic 3 Pro: 20 giọng nam nữ, 31 ngôn ngữ quốc tế', only('premium'))}
        ${row('CapCut / TikTok Global: 30+ giọng viral Việt Nam và Quốc tế', only('premium'))}
        ${row('Gemini TTS / Groq bằng API key riêng', only('free', 'premium'))}
        ${group('Chuyển giọng nói → văn bản (STT)')}
        ${row('Whisper Small, Tiny, Base & Moonshine Tiny (Miễn phí)', all)}
        ${row('Model STT Siêu cấp: Whisper Large v3 Turbo, PhoWhisper VinAI, Kotoba SOTA...', only('premium'))}
        ${row('Xuất phụ đề SRT / VTT / TXT mốc thời gian', all)}
        ${row('Thẻ nghỉ chính xác [nghỉ 2s], xuất WAV 48 kHz', all)}
        ${row('Thẻ cảm xúc [cười], [thở dài]', only('premium'))}
        ${row('Phụ đề SRT tự động cho giọng đọc', only('premium'))}
        ${row('Tóm tắt, làm sạch, dịch văn bản bằng AI', only('premium'))}
        ${row('Từ điển phát âm & lịch sử chuyển đổi', only('free', 'premium'))}
        ${row('Không chèn câu ghi nguồn vào file âm thanh', only('premium'))}
        ${row('Ưu tiên hàng đợi giờ cao điểm', only('premium'))}
      </tbody>`;
  }

  function renderCreditTiers() {
    const cc = $('#credits-card');
    cc.hidden = !(acc.payEnabled && acc.credits?.enabled);
    if (cc.hidden) return;
    const prem = acc.plan?.id === 'premium';
    const c = acc.credits;
    $('#credits-card-text').textContent = `Lượt mua thêm cộng dồn, không hết hạn theo ngày, chỉ dùng khi đã hết lượt trong ngày.${prem ? '' : ' Dành cho thành viên Premium.'}`;
    $('#btn-credits-card').disabled = !prem;
    $('#btn-credits-card').textContent = prem ? 'Chọn số lượng khác' : 'Cần gói Premium';
    const presets = Array.isArray(c.presets) && c.presets.length ? c.presets : [10, 20, 30, 50, 100];
    const best = Math.max(...presets);
    $('#pr-credit-tiers').innerHTML = presets.map(q => {
      const price = vkPay.calcCreditsPrice(q, c.price);
      const off = Math.round((1 - price / (q * c.price)) * 100);
      return `<button type="button" class="pr-tier ${q === best ? 'best' : ''}" data-q="${q}" ${prem ? '' : 'disabled'}>
        ${q === best ? '<span class="pr-tier-tag">Tốt nhất</span>' : off > 0 ? `<span class="pr-tier-tag soft">-${off}%</span>` : ''}
        <b>${fmt(q)}</b><small>lượt</small>
        <span class="pr-tier-price">${money(price)}</span>
        <span class="muted small">${fmt(Math.round(price / q))}đ / lượt</span>
      </button>`;
    }).join('');
    $$('#pr-credit-tiers .pr-tier').forEach(b => b.addEventListener('click', () => {
      if (!acc.credits?.enabled) return;
      vkPay.startCredits(Number(b.dataset.q));
    }));
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

  function showFormAlert(form, msg, type = 'err') {
    if (!form) return;
    let el = form.querySelector('.auth-alert');
    if (!el) {
      el = document.createElement('div');
      el.className = 'auth-alert';
      form.prepend(el);
    }
    el.className = 'auth-alert ' + type;
    el.textContent = msg;
    el.hidden = false;
  }
  function clearFormAlert(form) {
    if (!form) return;
    const el = form.querySelector('.auth-alert');
    if (el) el.hidden = true;
  }

  function switchForm(name) {
    $$('.auth-form[data-form]').forEach(f => {
      clearFormAlert(f);
      if (f.id !== 'form-password') f.hidden = f.dataset.form !== name;
    });
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
    clearFormAlert(form);
    const btn = form.querySelector('[type=submit]'), label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Đang xử lý…';
    try {
      await fn(Object.fromEntries(new FormData(form)));
    } catch (e) {
      showFormAlert(form, e.message || 'Thao tác không thành công. Vui lòng kiểm tra lại.', 'err');
      toast(e.message || 'Thao tác không thành công.', 'err');
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  $('#form-login').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    const r = await post('/api/auth/login', d);
    e.target.reset();
    showFormAlert(e.target, '✓ ' + (r.message || 'Đăng nhập thành công! Đang tải thông tin...'), 'ok');
    await load();
    setTimeout(() => {
      $('#modal-account').hidden = true;
      if (r.user?.verified) {
        toast(`🎉 Đăng nhập thành công! Chào mừng ${r.user.name || r.user.email}.`, 'ok');
      } else {
        toast('⚠️ Đăng nhập thành công! Tài khoản của bạn chưa xác minh email.', 'err');
      }
    }, 400);
  }); });
  $('#form-register').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    const r = await post('/api/auth/register', d);
    e.target.reset();
    await load();
    if (r.mailSent) {
      showFormAlert(e.target, `✓ Tạo tài khoản thành công! Hãy mở email ${r.user.email} để bấm liên kết xác minh (nhớ kiểm tra cả thư mục Spam/Rác).`, 'ok');
      toast(`Đã tạo tài khoản thành công. Hãy mở email ${r.user.email} để xác minh.`, 'ok');
      if (window.customAlert) {
        window.customAlert(`🎉 Đăng ký tài khoản thành công!\n\nEmail xác nhận đã được gửi đến: ${r.user.email}.\n\n⚠️ Lưu ý quan trọng: Nếu không thấy trong Hộp thư đến, bạn vui lòng kiểm tra kỹ thư mục Spam / Thư rác / Quảng cáo nhé!`, 'Đã gửi email xác minh');
      }
    } else {
      showFormAlert(e.target, `Đã tạo tài khoản nhưng chưa gửi được email: ${r.mailError || ''}`, 'warn');
      toast('Đã tạo tài khoản nhưng chưa gửi được email: ' + (r.mailError || ''), 'err');
    }
  }); });
  $('#form-resend')?.addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    const r = await post('/api/auth/resend-verify', d);
    e.target.reset();
    showFormAlert(e.target, `✓ ${r.message || 'Đã gửi lại email xác minh thành công!'}`, 'ok');
    toast(r.message || `Đã gửi lại email xác minh tới ${d.email}.`, 'ok');
    setTimeout(() => switchForm('login'), 1500);
  }); });
  $('#form-forgot').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/forgot', d);
    e.target.reset();
    showFormAlert(e.target, '✓ Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi đến hộp thư.', 'ok');
    toast('Nếu email đã đăng ký, liên kết đặt lại mật khẩu đã được gửi.', 'ok');
    setTimeout(() => switchForm('login'), 1500);
  }); });
  $('#form-reset').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/reset', { token: acc.resetToken, password: d.password });
    acc.resetToken = null;
    e.target.reset();
    await load();
    $('#modal-account').hidden = true;
    toast('✓ Đã đổi mật khẩu thành công và tự động đăng nhập.', 'ok');
  }); });
  $('#form-password').addEventListener('submit', e => { e.preventDefault(); submit(e.target, async d => {
    await post('/api/auth/password', d);
    e.target.reset();
    e.target.closest('details').open = false;
    toast('✓ Đã đổi mật khẩu thành công. Các thiết bị khác đã được đăng xuất.', 'ok');
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
          if (window.customAlert) await window.customAlert('Tài khoản này đã được xác minh trước đó rồi.\n\nBạn có thể sử dụng đầy đủ các tính năng của TXA Voice!', 'Thông báo xác minh');
          else toast('Tài khoản này đã được xác minh trước đó rồi.', 'ok');
        } else {
          if (window.customAlert) await window.customAlert('🎉 Chúc mừng bạn!\n\nEmail đã được xác minh thành công. Gói tài khoản của bạn đã được kích hoạt!', 'Xác minh thành công');
          else toast('🎉 Email đã được xác minh thành công! Gói Miễn phí đã mở.', 'ok');
        }
      } catch (e) {
        if (e.expired || e.message?.includes('hết hạn')) {
          if (window.customAlert) await window.customAlert('⚠️ Liên kết xác minh đã hết hạn hoặc không hợp lệ.\n\nVui lòng nhập email để nhận liên kết mới.', 'Liên kết hết hạn');
          else toast('⚠️ Liên kết xác minh đã hết hạn. Hãy nhập email để nhận liên kết mới.', 'err');
          if (e.email) {
            const inp = $('#resend-email');
            if (inp) inp.value = e.email;
          }
          switchForm('resend');
          openModal('#modal-account');
        } else {
          if (window.customAlert) await window.customAlert('❌ Xác minh không thành công:\n\n' + (e.message || 'Liên kết không hợp lệ.'), 'Lỗi xác minh');
          else toast(e.message, 'err');
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
    if (err.buyCredits) setTimeout(async () => {
      const ok = await (window.customConfirm ? window.customConfirm('Bạn đã hết lượt hôm nay. Mua thêm lượt để dùng tiếp ngay?', 'Hết lượt sử dụng') : confirm('Bạn đã hết lượt hôm nay. Mua thêm lượt để dùng tiếp ngay?'));
      if (ok) buyCredits();
    }, 300);
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
  async function bankInfo(bin) {
    if (!bin) return { text: '—', logo: '' };
    try {
      banks ||= (await (await fetch('https://api.vietqr.io/v2/banks')).json()).data || [];
      const b = banks.find(x => x.bin === String(bin));
      return b ? { text: `${b.shortName} (${b.name})`, logo: b.logo || '', short: b.shortName } : { text: bin, logo: '' };
    } catch { return { text: bin, logo: '' }; }
  }
  const bankName = async (bin) => (await bankInfo(bin)).text;

  /* ---------- Mã QR kiểu VietQR ---------- */
  /** Đọc chuỗi EMVCo dạng TLV (id 2 ký tự + độ dài 2 chữ số + giá trị) */
  function parseEmv(s) {
    const m = {};
    for (let i = 0; i + 4 <= s.length;) {
      const len = Number(s.slice(i + 2, i + 4));
      if (!Number.isInteger(len) || i + 4 + len > s.length) return null;
      m[s.slice(i, i + 2)] = s.slice(i + 4, i + 4 + len);
      i += 4 + len;
    }
    return m;
  }
  /** CRC-16/CCITT-FALSE của chuỗi VietQR (4 ký tự cuối là CRC, tính trên phần còn lại kể cả "6304") */
  function crc16(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  /** Mã QR có khớp đơn hàng không: CRC, số tiền, nội dung chuyển khoản, ngân hàng và số tài khoản */
  function checkQr(o) {
    const t = String(o.qrCode || '');
    const m = parseEmv(t);
    if (!m) return { ok: false, issues: ['không đọc được chuỗi QR'] };
    const issues = [];
    if (!(t.slice(-8, -4) === '6304' && crc16(t.slice(0, -4)) === t.slice(-4).toUpperCase())) issues.push('sai mã kiểm tra CRC');
    if (Number(m['54']) !== Number(o.amount)) issues.push(`số tiền trong mã (${fmt(m['54'] || 0)}đ) khác đơn (${fmt(o.amount)}đ)`);
    const add = m['62'] ? parseEmv(m['62']) || {} : {};
    if (add['08'] && add['08'] !== o.description) issues.push('nội dung chuyển khoản trong mã khác đơn');
    const acc = m['38'] ? parseEmv(m['38']) : null, who = acc && acc['01'] ? parseEmv(acc['01']) : null;
    if (who) {
      if (o.accountNumber && who['01'] && who['01'] !== String(o.accountNumber)) issues.push('số tài khoản trong mã khác đơn');
      if (o.bankBin && who['00'] && who['00'] !== String(o.bankBin)) issues.push('ngân hàng trong mã khác đơn');
    }
    return { ok: !issues.length, issues, hasMemo: !!add['08'] };
  }

  /**
   * Vẽ mã QR thành SVG: vùng trống 2 ô quanh mã, ô dữ liệu bo nhẹ, ba ô định vị bo tròn,
   * chừa chỗ giữa cho logo (mức sửa lỗi Q chịu được 25%, logo chỉ che ~3%).
   */
  function qrSvg(make, text) {
    const qr = make(0, 'Q');
    qr.addData(text); qr.make();
    const n = qr.getModuleCount(), Q = 2, S = n + Q * 2, DARK = '#0b1b3b';
    const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const logo = Math.max(7, Math.round(n * 0.17) | 1), lo = Math.floor((n - logo) / 2) - 1, hi = lo + logo + 2; // vùng logo (kèm viền 1 ô)
    const inLogo = (r, c) => r >= lo && r < hi && c >= lo && c < hi;
    let rects = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n;) {
        if (!qr.isDark(r, c) || finder(r, c) || inLogo(r, c)) { c++; continue; }
        let e = c;
        while (e < n && qr.isDark(r, e) && !finder(r, e) && !inLogo(r, e)) e++;
        rects += `<rect x="${c + Q}" y="${r + Q}" width="${e - c}" height="1" rx=".32"/>`;
        c = e;
      }
    }
    const eye = (x, y) => `<rect x="${x + Q}" y="${y + Q}" width="7" height="7" rx="2"/><rect x="${x + Q + 1}" y="${y + Q + 1}" width="5" height="5" rx="1.4" fill="#fff"/><rect x="${x + Q + 2}" y="${y + Q + 2}" width="3" height="3" rx="1"/>`;
    const mid = S / 2, bw = (hi - lo - 1) + 0.2, bx = mid - bw / 2;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="geometricPrecision" role="img" aria-label="Mã QR VietQR">
      <rect width="${S}" height="${S}" fill="#fff"/>
      <g fill="${DARK}">${rects}${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</g>
      <defs><linearGradient id="vqg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5dfc"/><stop offset="1" stop-color="#0ea5c6"/></linearGradient></defs>
      <rect x="${bx}" y="${bx}" width="${bw}" height="${bw}" rx="${bw * 0.26}" fill="#fff"/>
      <rect x="${bx + bw * 0.1}" y="${bx + bw * 0.1}" width="${bw * 0.8}" height="${bw * 0.8}" rx="${bw * 0.22}" fill="url(#vqg)"/>
      <text x="${mid}" y="${mid + bw * 0.17}" text-anchor="middle" font-family="Be Vietnam Pro,Segoe UI,Arial,sans-serif" font-weight="800" font-size="${bw * 0.5}" fill="#fff">V</text>
    </svg>`;
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
    const bank = await bankInfo(o.bankBin);
    $('#pay-bank').textContent = bank.text;
    // Chân thẻ VietQR: logo + tên ngân hàng, chủ tài khoản, số tài khoản
    const logo = $('#pay-bank-logo');
    logo.hidden = !bank.logo; if (bank.logo) logo.src = bank.logo;
    $('#pay-qr-bank').textContent = bank.short || bank.text;
    $('#pay-qr-name').textContent = o.accountName || '—';
    $('#pay-qr-acc').textContent = o.accountNumber || '—';
    $('#pay-qr-amount').textContent = fmt(o.amount) + 'đ';
    const box = $('#pay-qr'), verify = $('#pay-qr-verify');
    box.textContent = ''; verify.hidden = true;
    if (o.qrCode) {
      try {
        box.innerHTML = qrSvg(await loadQrLib(), o.qrCode);
        const chk = checkQr(o);
        verify.hidden = false;
        verify.className = 'qr-verify ' + (chk.ok ? 'ok' : 'bad');
        verify.textContent = chk.ok
          ? `✓ Mã QR đã kiểm tra: đúng số tiền ${fmt(o.amount)}đ${chk.hasMemo ? ', đúng nội dung' : ''}, đúng tài khoản nhận`
          : `⚠ Mã QR không khớp đơn (${chk.issues.join('; ')}). Hãy chuyển khoản theo thông tin bên cạnh hoặc bấm "Mở trang payOS".`;
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
    $('#pay-done-text').textContent = o.kind === 'credits'
      ? `Đã nhận ${fmt(o.amount)}đ. Đã cộng ${fmt(o.credits)} lượt vào tài khoản, biên lai đã gửi về email.`
      : `Đã nhận ${fmt(o.amount)}đ cho Premium ${o.packageName}. Biên lai đã được gửi về email của bạn.`;

    const invUrl = `/invoice/${o.orderCode}`;
    const invPrintUrl = `/invoice/${o.orderCode}?print=1`;
    if ($('#pay-invoice')) $('#pay-invoice').href = invUrl;
    if ($('#pay-invoice-print')) $('#pay-invoice-print').href = invPrintUrl;

    const inv = o.invoice;
    const invDesc = $('#pay-done-inv-desc');
    if (invDesc) {
      if (inv && (inv.name || inv.tax_code)) {
        const nm = inv.name || 'Quý khách';
        const mst = inv.tax_code ? ` (MST: ${inv.tax_code})` : '';
        invDesc.innerHTML = `Hóa đơn GTGT điện tử phát hành cho: <b style="color:#f1f5f9">${esc(nm)}</b>${mst}. Hệ thống đã mở hóa đơn trong tab mới để bạn in/lưu.`;
      } else {
        invDesc.innerHTML = `Hóa đơn bán hàng điện tử số <b>#${o.orderCode}</b> đã được tạo. Bạn có thể in ra giấy hoặc lưu bản PDF ngay.`;
      }
    }

    // Nếu người mua chọn xuất hóa đơn khi tạo đơn, tự động mở ngay trang hóa đơn để in
    const wantsInvoice = Boolean(inv || $('#pc-invoice')?.checked);
    if (wantsInvoice) {
      try {
        const win = window.open(invPrintUrl, '_blank');
        if (win) {
          toast('Đã mở hóa đơn điện tử trong tab mới để in!', 'ok');
        } else {
          toast('Hóa đơn đã sẵn sàng! Bấm "In hóa đơn ngay" để mở bản in.', 'info');
        }
      } catch (err) {
        /* Popup blocker */
      }
    }

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
    if ($('#pc-alert')) $('#pc-alert').hidden = true;
    const u = vkAccount.state.user || {};
    $('#pay-title').textContent = 'Xác nhận đơn hàng';
    $('#pc-pkg').textContent = `Premium ${pkg.name} · ${fmt(pkg.days)} ngày`;
    $('#pc-amount').textContent = fmt(pkg.price) + 'đ';
    payLabel();
    if (!$('#pc-name').value) $('#pc-name').value = u.name || '';
    if ($('#pc-email')) { $('#pc-email').value = u.email || ''; $('#pc-email').readOnly = true; }
    openModal('#modal-pay'); show('pay-confirm');
  }
  const payMode = () => document.querySelector('input[name=pc-mode]:checked')?.value || 'api';
  function payLabel() {
    if (!pendingPkg) return;
    const total = fmt(pendingPkg.price) + 'đ';
    $('#pc-sticky-amount').textContent = total;
    $('#pc-sticky-label').textContent = payKind === 'credits' ? `Tổng thanh toán · ${pendingPkg.name}` : `Tổng thanh toán · Premium ${pendingPkg.name}`;
    $('#pc-continue').textContent = payMode() === 'redirect' ? `Tiếp tục tới payOS · ${total} →` : `Tạo mã QR · ${total}`;
  }
  $$('input[name=pc-mode]').forEach(r => r.addEventListener('change', payLabel));
  /* Mua thêm lượt: có chiết khấu số lượng (bắt đầu từ 10 lượt, làm tròn 20, 30, 50, kịch kim ở 100 lượt) */
  function calcCreditsPrice(qty, basePrice = 200) {
    qty = Math.floor(Number(qty)) || 0;
    if (qty <= 0) return 0;
    basePrice = Number(basePrice) > 0 ? Number(basePrice) : 200;

    let amount = 0;
    if (qty < 10) {
      amount = qty * 200;
    } else if (qty <= 20) {
      amount = 2000 + ((qty - 10) / 10) * 1500;
    } else if (qty <= 30) {
      amount = 3500 + ((qty - 20) / 10) * 1500;
    } else if (qty <= 50) {
      amount = 5000 + ((qty - 30) / 20) * 2500;
    } else if (qty <= 100) {
      amount = 7500 + ((qty - 50) / 50) * 4500;
    } else {
      amount = 12000 + (qty - 100) * 115;
    }

    if (basePrice !== 200) {
      amount = (amount / 200) * basePrice;
    }

    const unit = amount >= 10000 ? 1000 : 500;
    return Math.max(2000, Math.round(amount / unit) * unit);
  }

  function creditQty() { return Math.floor(Number($('#pc-qty').value)) || 0; }
  function syncCredits() {
    const c = vkAccount.state.credits, q = creditQty();
    $$('#pc-presets .credit-preset').forEach(b => b.classList.toggle('active', Number(b.dataset.q) === q));
    const price = calcCreditsPrice(q, c.price);
    const unitPrice = q > 0 ? Math.round(price / q) : c.price;
    const baseTotal = q * c.price;
    const discountPercent = baseTotal > 0 ? Math.round((1 - price / baseTotal) * 100) : 0;

    pendingPkg = { id: 'credits', name: `${fmt(q)} lượt`, days: 0, price };
    $('#pc-pkg').textContent = `${fmt(q)} lượt Edge / CapCut`;
    $('#pc-amount').textContent = fmt(price) + 'đ';

    if ($('#pc-unit')) {
      if (discountPercent > 0) {
        $('#pc-unit').innerHTML = `· <b style="color:var(--accent)">${fmt(unitPrice)}đ</b> / lượt <span class="tag-save">Giảm ${discountPercent}%</span>`;
      } else {
        $('#pc-unit').textContent = `· ${fmt(unitPrice)}đ / lượt`;
      }
    }

    // Thanh kéo + thẻ thông tin: đơn giá, tiết kiệm, số dư sau khi mua, thời lượng đọc ước tính
    const range = $('#pc-range');
    range.value = Math.min(q, Number(range.max));
    range.style.setProperty('--fill', ((range.value - range.min) / (range.max - range.min) * 100) + '%');
    const have = vkAccount.state.usage?.credits || 0, saving = Math.max(0, baseTotal - price);
    const maxChars = vkAccount.state.plan?.maxChars || 20000;
    const hours = q * maxChars / 15 / 3600; // ~15 ký tự mỗi giây
    const span = hours >= 1 ? `${hours.toFixed(hours < 10 ? 1 : 0)} giờ` : `${Math.max(1, Math.round(hours * 60))} phút`;
    $('#pc-facts').innerHTML = `
      <div><small>Đơn giá</small><b>${fmt(unitPrice)}đ / lượt</b></div>
      <div class="${saving ? 'good' : ''}"><small>Tiết kiệm so với mua lẻ</small><b>${saving ? `${fmt(saving)}đ (−${discountPercent}%)` : 'Chưa có ưu đãi'}</b></div>
      <div><small>Lượt mua thêm của bạn</small><b>${fmt(have)} → ${fmt(have + q)}</b></div>
      <div title="Ước tính nếu mỗi lượt đọc đủ ${fmt(maxChars)} ký tự"><small>Đọc được tối đa khoảng</small><b>≈ ${span} giọng đọc</b></div>`;

    const noteEl = $('#pc-credits-note');
    if (noteEl) {
      if (q < 100) {
        noteEl.innerHTML = `💡 Mua mốc <b>100 lượt</b> để nhận ưu đãi kịch kim chỉ <b>120đ/lượt</b> (-40%). Lượt cộng dồn vĩnh viễn không hết hạn.`;
      } else if (q === 100) {
        noteEl.innerHTML = `🔥 Bạn đang nhận mức ưu đãi lớn nhất (<b>120đ/lượt · Tiết kiệm 40%</b>). Lượt cộng dồn vĩnh viễn.`;
      } else {
        noteEl.innerHTML = `✨ Đã gồm trọn gói ưu đãi 100 lượt kịch kim + các lượt mua thêm không thời hạn.`;
      }
    }

    payLabel();
  }

  function startCredits(initialQty) {
    const c = vkAccount.state.credits;
    payKind = 'credits';
    const u = vkAccount.state.user || {};
    $('#pay-title').textContent = 'Mua thêm lượt';
    if ($('#pc-alert')) $('#pc-alert').hidden = true;

    const presets = Array.isArray(c.presets) && c.presets.length ? c.presets : [10, 20, 30, 50, 100];
    let last = 0;
    try { last = Math.floor(Number(localStorage.getItem('vk-last-credits'))) || 0; } catch {}
    const chips = last >= (c.min || 10) && last <= (c.max || 10000) && !presets.includes(last) ? [...presets, last] : presets;
    $('#pc-presets').innerHTML = chips.map(q => {
      const p = calcCreditsPrice(q, c.price);
      const discount = Math.round((1 - p / (q * c.price)) * 100);
      let badge = '';
      if (q === 100) {
        badge = `<span class="preset-tag hot">Kịch kim 🔥</span>`;
      } else if (discount > 0) {
        badge = `<span class="preset-tag">-${discount}%</span>`;
      }
      if (q === last && !presets.includes(q)) badge = `<span class="preset-tag last">Lần trước</span>`;
      return `<button type="button" class="credit-preset" data-q="${q}">
        ${badge}
        <b>${fmt(q)}</b>
        <small>${fmt(p)}đ</small>
      </button>`;
    }).join('');

    $$('#pc-presets .credit-preset').forEach(b => b.addEventListener('click', () => {
      $('#pc-qty').value = b.dataset.q;
      syncCredits();
    }));

    const qty = $('#pc-qty');
    qty.min = Math.max(10, c.min || 10);
    qty.max = c.max || 10000;
    qty.step = '10';
    const range = $('#pc-range');
    range.min = qty.min; range.max = Math.max(Number(qty.min), Math.min(Number(qty.max), 500)); range.step = '10';
    qty.value = initialQty > 0 ? initialQty : presets.includes(30) ? 30 : (presets[1] || 20);
    $('#pc-credits').hidden = false;
    if (!$('#pc-name').value) $('#pc-name').value = u.name || '';
    if ($('#pc-email')) { $('#pc-email').value = u.email || ''; $('#pc-email').readOnly = true; }
    syncCredits();
    openModal('#modal-pay'); show('pay-confirm');
  }
  $('#pc-qty').addEventListener('input', () => { if (payKind === 'credits') syncCredits(); });
  $('#pc-range').addEventListener('input', (e) => { $('#pc-qty').value = e.target.value; syncCredits(); });
  const stepQty = (d) => {
    const c = vkAccount.state.credits, q = Math.round(creditQty() / 10) * 10 + d;
    $('#pc-qty').value = Math.max(c.min || 10, Math.min(c.max || 10000, q));
    syncCredits();
  };
  $('#pc-minus').addEventListener('click', () => stepQty(-10));
  $('#pc-plus').addEventListener('click', () => stepQty(10));

  $('#pc-continue').addEventListener('click', async () => {
    if (!pendingPkg) return;
    const alertBox = $('#pc-alert');
    const alertMsg = $('#pc-alert-msg');
    if (alertBox) alertBox.hidden = true;

    if (payKind === 'credits') {
      const c = vkAccount.state.credits, q = creditQty();
      if (q < c.min || q > c.max) {
        const msg = `Số lượt mua từ ${fmt(c.min)} đến ${fmt(c.max)}.`;
        if (alertBox && alertMsg) { alertMsg.textContent = msg; alertBox.hidden = false; }
        return toast(msg, 'err');
      }
      try { localStorage.setItem('vk-last-credits', String(q)); } catch {}
    }
    const invoice = $('#pc-invoice').checked ? {
      enabled: true, type: invType, name: $('#pc-name').value.trim(), tax_code: $('#pc-tax').value.trim(),
      address: $('#pc-addr').value.trim(), email: (vkAccount.state.user?.email || $('#pc-email').value || '').trim()
    } : null;
    if (invoice) {
      if (!invoice.name) {
        const msg = invType === 'company' ? 'Nhập tên công ty để xuất hóa đơn.' : 'Nhập họ tên người mua để xuất hóa đơn.';
        if (alertBox && alertMsg) { alertMsg.textContent = msg; alertBox.hidden = false; }
        return toast(msg, 'err');
      }
      if (invType === 'company' && !/^\d{10}(-\d{3})?$/.test(invoice.tax_code)) {
        const msg = 'Mã số thuế phải gồm 10 số (hoặc 10 số + "-" + 3 số).';
        if (alertBox && alertMsg) { alertMsg.textContent = msg; alertBox.hidden = false; }
        return toast(msg, 'err');
      }
      if (invType === 'company' && !invoice.address) {
        const msg = 'Nhập địa chỉ công ty để xuất hóa đơn.';
        if (alertBox && alertMsg) { alertMsg.textContent = msg; alertBox.hidden = false; }
        return toast(msg, 'err');
      }
    }

    const btn = $('#pc-continue');
    const oldBtnText = btn.textContent;
    btn.disabled = true;
    show('pay-loading');

    try {
      const mode = payMode();
      const payload = payKind === 'credits'
        ? { kind: 'credits', quantity: creditQty(), invoice, mode }
        : { packageId: pendingPkg.id, invoice, mode };

      const r = await api('/api/pay/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (mode === 'redirect' && r.order?.checkoutUrl) {
        $('#pay-loading span').textContent = 'Đang chuyển sang payOS…';
        location.href = r.order.checkoutUrl;
        return;
      }
      await render(r.order);
    } catch (e) {
      show('pay-confirm');
      btn.disabled = false;
      btn.textContent = oldBtnText;
      if (alertBox && alertMsg) {
        alertMsg.textContent = e.message || 'Lỗi tạo đơn thanh toán.';
        alertBox.hidden = false;
      }
      toast(e.message || 'Lỗi tạo đơn thanh toán.', 'err');
    } finally {
      btn.disabled = false;
    }
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
    if (!order) return;
    const ok = await (window.customConfirm ? window.customConfirm('Hủy đơn thanh toán này?', 'Xác nhận hủy') : confirm('Hủy đơn thanh toán này?'));
    if (!ok) return;
    stop();
    try { await api(`/api/pay/order/${order.orderCode}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
    $('#modal-pay').hidden = true; toast('Đã hủy đơn.');
  });
  $$('#modal-pay [data-copy]').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard.writeText($('#' + b.dataset.copy).textContent.trim()).then(() => toast('Đã chép.', 'ok'));
  }));

  return { start, startCredits, resume, calcCreditsPrice };
})();
