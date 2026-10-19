'use strict';
/* VoiceKit - tài khoản, gói, lượt dùng, quản trị. Dùng chung tiện ích ($, api, toast, showView...) từ app.js. */

const vkAccount = (() => {
  const acc = { enabled: false, smtp: false, user: null, plan: null, usage: null, plans: [], resetToken: null };
  const post = (url, body = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const initials = (u) => ((u?.name || u?.email || '?').trim()[0] || '?').toUpperCase();
  const fmt = (n) => Number(n).toLocaleString('vi-VN');

  async function load() {
    let res;
    try { res = await fetch('/api/me', { cache: 'no-store' }); } catch { res = null; }
    // Máy chủ không có tài khoản (start.bat / host tĩnh): 404 hoặc accounts:false -> mở khóa như bản cá nhân
    if (res && res.status === 404) return disable();
    const me = res && res.ok ? await res.json().catch(() => null) : null;
    if (me && me.accounts === false) return disable();
    if (!me) {
      // Lỗi tạm thời: giữ khóa các tính năng cần đăng nhập, không coi là "không có tài khoản"
      applyKeyGate(false, null);
      return;
    }
    Object.assign(acc, { enabled: true, smtp: me.smtp, user: me.user, plan: me.plan, usage: me.usage, plans: me.plans });
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
      $('#prof-expire').textContent = u.effectivePlan === 'premium' && u.planExpires ? 'Hết hạn ' + new Date(u.planExpires).toLocaleDateString('vi-VN') : '';
    }
    const used = acc.plan.ttsCalls - acc.usage.remaining;
    $('#prof-bar').style.width = Math.min(100, used / acc.plan.ttsCalls * 100) + '%';
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
    const serverLib = ['edge', 'capcut'].includes(typeof tts !== 'undefined' ? tts.lib : '');
    if (!acc.enabled || !serverLib) { chip.hidden = true; $('#tts-count').style.color = ''; return; }
    chip.hidden = false;
    const p = acc.plan, r = acc.usage.remaining;
    const cta = !acc.user ? '<button data-open="register">Đăng ký để có 50 lượt/ngày →</button>'
      : !acc.user.verified ? '<button data-open="account">Xác minh email để có 50 lượt/ngày →</button>'
      : p.id !== 'premium' ? '<button data-open="plans">Xem gói Premium →</button>' : '';
    chip.innerHTML = `<span>Gói <b>${p.name}</b>: còn <b>${fmt(r)}/${fmt(p.ttsCalls)}</b> lượt hôm nay · tối đa ${fmt(p.maxChars)} ký tự/lượt</span>${cta}`;
    const len = $('#tts-text').value.length;
    $('#tts-count').textContent = `${fmt(len)} / ${fmt(p.maxChars)} ký tự`;
    $('#tts-count').style.color = len > p.maxChars ? 'var(--danger)' : '';
  }

  function renderPlans() {
    const cur = acc.plan?.id;
    $('#plans-grid').innerHTML = acc.plans.map(p => `
      <div class="plan-card ${p.id === 'free' ? 'featured' : ''} ${p.id === cur ? 'current' : ''}">
        <h3>${p.name}</h3>
        <div class="plan-price">${p.price}</div>
        <div class="plan-limit"><b>${fmt(p.ttsCalls)}</b> lượt ${p.id === 'premium' ? 'Edge/CapCut' : 'Edge Neural'}/ngày · <b>${fmt(p.maxChars)}</b> ký tự/lượt</div>
        <ul>${p.perks.map(x => `<li>${x}</li>`).join('')}</ul>
        ${planAction(p)}
      </div>`).join('');
    $$('#plans-grid [data-open]').forEach(b => b.addEventListener('click', () => openFrom(b.dataset.open)));
  }
  function planAction(p) {
    const u = acc.user;
    if (p.id === 'guest') return u ? '' : '<button class="btn" disabled>Đang dùng</button>';
    if (p.id === 'free') {
      if (!u) return '<button class="btn primary" data-open="register">Đăng ký miễn phí</button>';
      if (!u.verified) return '<button class="btn primary" data-open="account">Xác minh email</button>';
      return '';
    }
    return u ? '<button class="btn accent" disabled>Liên hệ quản trị viên để nâng cấp</button>'
      : '<button class="btn" data-open="register">Đăng ký trước</button>';
  }

  function openFrom(what) {
    if (what === 'plans') { $('#modal-account').hidden = true; showView('plans'); return; }
    openModal('#modal-account');
    if (what === 'register' && !acc.user) switchForm('register');
    else if (!acc.user) switchForm('login');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('#quota-chip [data-open]');
    if (b) openFrom(b.dataset.open);
  });

  function switchForm(name) {
    $$('.auth-form[data-form]').forEach(f => { if (f.id !== 'form-password') f.hidden = f.dataset.form !== name; });
    $$('#auth-seg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.auth === name));
    $('#auth-seg').hidden = name === 'reset' || name === 'forgot';
  }
  $$('[data-auth]').forEach(b => b.addEventListener('click', () => switchForm(b.dataset.auth)));

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
    try { await post('/api/auth/resend-verify'); toast('Đã gửi lại email xác minh.', 'ok'); } catch (err) { toast(err.message, 'err'); }
    e.target.disabled = false;
  });
  $('#btn-logout').addEventListener('click', async () => { await post('/api/auth/logout').catch(() => {}); await load(); $('#modal-account').hidden = true; toast('Đã đăng xuất.'); });
  $('#btn-see-plans').addEventListener('click', () => openFrom('plans'));
  $('#btn-account').addEventListener('click', () => { if (!acc.user) switchForm('login'); openModal('#modal-account'); });

  /* Liên kết trong email: ?verify=... hoặc ?reset=... */
  async function handleLinks() {
    const q = new URLSearchParams(location.search);
    const verify = q.get('verify'), reset = q.get('reset');
    if (!verify && !reset) return;
    history.replaceState(null, '', location.pathname);
    if (verify) {
      try { await post('/api/auth/verify', { token: verify }); await load(); toast('Email đã được xác minh. Gói Miễn phí đã mở!', 'ok'); }
      catch (e) { toast(e.message, 'err'); }
    } else {
      acc.resetToken = reset; render(); switchForm('reset'); openModal('#modal-account');
    }
  }

  /* Gọi từ app.js sau mỗi lần tạo giọng qua máy chủ */
  function onTtsResponse(res) {
    const left = res.headers.get('X-Quota-Remaining');
    if (left !== null && acc.usage) { acc.usage.remaining = Number(left); render(); }
  }
  function onQuotaError(err) {
    if (acc.usage && err.error?.includes('Đã hết')) { acc.usage.remaining = 0; render(); }
  }

  /* ---------- Quản trị ---------- */
  async function loadAdmin() {
    try {
      const r = await api('/api/admin/users?q=' + encodeURIComponent($('#admin-q').value.trim()));
      $('#admin-stats').textContent = `${fmt(r.total)} tài khoản · hôm nay hệ thống đã dùng ${fmt(r.globalToday)} lượt Edge/CapCut`;
      $('#admin-rows').innerHTML = r.users.map(u => {
        const prem = u.plan === 'premium' && (!u.plan_expires || u.plan_expires > Date.now());
        return `<tr data-id="${u.id}">
          <td><b>${escapeHtml(u.name || '—')}</b><small>${escapeHtml(u.email)}</small></td>
          <td>${u.verified ? '<span class="tag ok">Đã xác minh</span>' : '<span class="tag warn">Chưa xác minh</span>'} ${u.role === 'admin' ? '<span class="tag pro">Admin</span>' : ''}
            <small>Tạo ${new Date(u.created_at).toLocaleDateString('vi-VN')}</small></td>
          <td>${prem ? '<span class="tag pro">Premium</span>' : '<span class="tag">Miễn phí</span>'}<small>${prem && u.plan_expires ? 'đến ' + new Date(u.plan_expires).toLocaleDateString('vi-VN') : ''}</small></td>
          <td><div class="act">
            <select data-plan><option value="free">Miễn phí</option><option value="premium" ${prem ? 'selected' : ''}>Premium</option></select>
            <input type="number" min="0" max="3650" placeholder="ngày" data-days title="Số ngày Premium (0 = vĩnh viễn)">
            <label class="small"><input type="checkbox" data-notify checked style="width:auto"> Báo email</label>
            <button class="btn sm" data-save>Lưu</button>
          </div></td></tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">Không có tài khoản nào.</td></tr>';
      $$('#admin-rows [data-save]').forEach(b => b.addEventListener('click', async () => {
        const row = b.closest('tr');
        b.disabled = true;
        try {
          const res = await post('/api/admin/plan', {
            userId: Number(row.dataset.id), plan: row.querySelector('[data-plan]').value,
            days: Number(row.querySelector('[data-days]').value) || 0, notify: row.querySelector('[data-notify]').checked
          });
          toast(`Đã chuyển ${res.user.email} sang gói ${res.user.effectivePlan === 'premium' ? 'Premium' : 'Miễn phí'}${res.mailSent ? ' và đã gửi email' : ''}.`, 'ok');
          loadAdmin();
        } catch (e) { toast(e.message, 'err'); b.disabled = false; }
      }));
    } catch (e) { $('#admin-stats').textContent = e.message; }
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  $('#admin-search').addEventListener('click', loadAdmin);
  $('#admin-q').addEventListener('keydown', e => { if (e.key === 'Enter') loadAdmin(); });

  $('#tts-text').addEventListener('input', () => acc.enabled && renderQuota());

  load().then(handleLinks);
  return { load, renderQuota, renderPlans, loadAdmin, onTtsResponse, onQuotaError, get state() { return acc; } };
})();
