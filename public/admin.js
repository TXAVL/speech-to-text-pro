'use strict';
/* VoiceKit - trang Quản trị: tổng quan, người dùng, đơn hàng, gói & giá, hệ thống, nhật ký. */

const vkAdmin = (() => {
  const S = { tab: 'overview', overview: null, chart: 'revenue', users: { q: '', filter: 'all', page: 0 }, orders: { q: '', status: '', page: 0 } };
  const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');
  const money = (n) => fmt(n) + 'đ';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const date = (t) => t ? new Date(t).toLocaleDateString('vi-VN') : '—';
  const dt = (t) => t ? new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
  const post = (url, body = {}) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const body = () => $('#adm-body');
  const THEME_OPTS = [['auto', 'Tự động theo ngày lễ'], ['none', 'Tắt (giao diện thường)'], ['halloween', '🎃 Halloween'], ['teachers', '📚 Nhà giáo 20/11'], ['xmas', '🎄 Giáng sinh'], ['newyear', '🎆 Năm mới'], ['tet', '🧧 Tết Âm lịch'], ['valentine', '💝 Valentine'], ['women', '🌸 8/3'], ['reunify', '🇻🇳 30/4 – 1/5'], ['children', '🎈 Thiếu nhi 1/6'], ['national', '🇻🇳 Quốc khánh 2/9'], ['midautumn', '🏮 Trung thu']];
  const ST = { PAID: 'Đã thanh toán', PENDING: 'Đang chờ', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn' };
  const isPrem = (u) => u.plan === 'premium' && (!u.plan_expires || u.plan_expires > Date.now());
  const userTags = (u) => [
    u.verified ? '<span class="tag ok">Đã xác minh</span>' : '<span class="tag warn">Chưa xác minh</span>',
    u.banned ? '<span class="tag" style="color:var(--danger)">Bị khóa</span>' : '',
    u.role === 'admin' ? '<span class="tag pro">Admin</span>' : ''
  ].join(' ');
  const loading = () => { body().innerHTML = '<div class="card"><div class="pay-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div></div></div>'; };

  function open(tab) {
    if (tab) S.tab = tab;
    $$('#adm-tabs .adm-tab').forEach(b => b.classList.toggle('active', b.dataset.adm === S.tab));
    ({ overview, users, orders, settings, email, system, logs })[S.tab]();
  }
  $$('#adm-tabs .adm-tab').forEach(b => b.addEventListener('click', () => open(b.dataset.adm)));

  async function run(btn, fn) {
    if (btn) btn.disabled = true;
    try { const r = await fn(); if (r?.message) toast(r.message, 'ok'); return r; }
    catch (e) { toast(e.message, 'err'); }
    finally { if (btn) btn.disabled = false; }
  }

  /* ---------------- Tổng quan ---------------- */
  async function overview() {
    loading();
    let d;
    try { d = S.overview = await api('/api/admin/overview'); } catch (e) { body().innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    $('#adm-status').innerHTML = `<span class="tag ${d.status.payos ? 'ok' : 'warn'}">payOS ${d.status.payos ? 'đã kết nối' : 'chưa cấu hình'}</span>
      <span class="tag ${d.status.smtp ? 'ok' : 'warn'}">SMTP ${d.status.smtp ? 'đã kết nối' : 'chưa cấu hình'}</span>`;
    const u = d.users, o = d.orders, us = d.usage;
    const pct = Math.min(100, (us.calls || 0) / us.globalLimit * 100);
    body().innerHTML = `
      <div class="kpis">
        <div class="kpi money"><span>Doanh thu tháng này</span><b>${money(o.month)}</b><small>Hôm nay ${money(o.today)} · Tổng ${money(o.revenue)}</small></div>
        <div class="kpi"><span>Người dùng</span><b>${fmt(u.total)}</b><small>+${fmt(u.today)} hôm nay · +${fmt(u.week)} trong 7 ngày</small></div>
        <div class="kpi"><span>Premium đang hoạt động</span><b>${fmt(u.premium)}</b><small>${fmt(u.verified)} đã xác minh · ${fmt(u.credits)} lượt mua thêm đang tồn</small></div>
        <div class="kpi"><span>Đơn hàng</span><b>${fmt(o.paid)}</b><small>đã thanh toán · ${fmt(o.pending)} đang chờ</small></div>
      </div>
      <div class="adm-grid-2">
        <div class="card">
          <h4><span>14 ngày qua</span><span class="chart-switch">
            <button data-chart="revenue">Doanh thu</button><button data-chart="signups">Đăng ký</button><button data-chart="tts">Lượt TTS</button></span></h4>
          <div class="chart" id="adm-chart"></div>
        </div>
        <div class="card">
          <h4>Hôm nay</h4>
          <div class="muted small">Lượt Edge/CapCut toàn hệ thống</div>
          <div class="meter"><div style="width:${pct}%"></div></div>
          <div class="small"><b>${fmt(us.calls)}</b> / ${fmt(us.globalLimit)} lượt (${pct.toFixed(1)}%)</div>
          <div class="info-grid" style="margin-top:14px;grid-template-columns:1fr 1fr">
            <div><small>Thành viên hoạt động</small><b>${fmt(us.activeUsers)}</b></div>
            <div><small>Khách dùng TTS</small><b>${fmt(us.guests)}</b></div>
          </div>
        </div>
      </div>
      <div class="adm-grid-2">
        <div class="card"><h4><span>Đơn gần đây</span><button class="link-btn" data-go="orders">Xem tất cả →</button></h4>
          <div class="mini-list">${d.recentOrders.map(r => `<div class="row" data-order="${r.orderCode}">
            <span>#${r.orderCode} · ${esc(r.email)}<br><small>Premium ${esc(r.packageName)} · ${dt(r.createdAt)}</small></span>
            <span style="text-align:right">${money(r.amount)}<br><span class="st ${r.status}">${ST[r.status]}</span></span></div>`).join('') || '<span class="muted">Chưa có đơn nào.</span>'}</div>
        </div>
        <div class="card"><h4><span>Thành viên mới</span><button class="link-btn" data-go="users">Xem tất cả →</button></h4>
          <div class="mini-list">${d.recentUsers.map(r => `<div class="row" data-user="${r.id}">
            <span>${esc(r.name || r.email.split('@')[0])}<br><small>${esc(r.email)}</small></span>
            <span style="text-align:right"><small>${date(r.created_at)}</small><br>${isPrem(r) ? '<span class="tag pro">Premium</span>' : r.verified ? '<span class="tag ok">Free</span>' : '<span class="tag warn">Chưa xác minh</span>'}</span></div>`).join('')}</div>
        </div>
      </div>`;
    drawChart();
    $$('#adm-body [data-chart]').forEach(b => b.addEventListener('click', () => { S.chart = b.dataset.chart; drawChart(); }));
    $$('#adm-body [data-go]').forEach(b => b.addEventListener('click', () => open(b.dataset.go)));
    $$('#adm-body [data-user]').forEach(r => r.addEventListener('click', () => userModal(Number(r.dataset.user))));
    $$('#adm-body [data-order]').forEach(r => r.addEventListener('click', () => { S.orders.q = r.dataset.order; open('orders'); }));
  }
  function drawChart() {
    const s = S.overview.series, vals = s[S.chart], max = Math.max(1, ...vals);
    $$('#adm-body [data-chart]').forEach(b => b.classList.toggle('active', b.dataset.chart === S.chart));
    $('#adm-chart').innerHTML = vals.map((v, i) => `<div class="col"><div class="bar-v" style="height:${Math.max(1, v / max * 100)}%" data-v="${S.chart === 'revenue' ? money(v) : fmt(v)}"></div><small>${s.days[i].slice(8)}</small></div>`).join('');
  }

  /* ---------------- Người dùng ---------------- */
  const sel = { users: new Map(), orders: new Map() };   // id -> dữ liệu hàng (để xuất CSV)

  function bulkBar(kind, actionsHtml) {
    const n = sel[kind].size;
    const bar = $(`#${kind}-bulk`);
    if (!bar) return;
    bar.hidden = !n;
    if (!n) return;
    bar.querySelector('[data-count]').textContent = `Đã chọn ${fmt(n)}`;
  }
  function wireSelection(kind, rowsSel, keyAttr) {
    const all = $(`#${kind}-all`);
    const boxes = $$(`${rowsSel} input[data-pick]`);
    const sync = () => { all.checked = boxes.length > 0 && boxes.every(b => b.checked); all.indeterminate = !all.checked && boxes.some(b => b.checked); bulkBar(kind); };
    boxes.forEach(b => {
      b.checked = sel[kind].has(b.dataset.pick);
      b.addEventListener('click', (e) => e.stopPropagation());
      b.addEventListener('change', () => { b.checked ? sel[kind].set(b.dataset.pick, JSON.parse(b.dataset.row)) : sel[kind].delete(b.dataset.pick); sync(); });
    });
    all.addEventListener('change', () => { boxes.forEach(b => { b.checked = all.checked; all.checked ? sel[kind].set(b.dataset.pick, JSON.parse(b.dataset.row)) : sel[kind].delete(b.dataset.pick); }); sync(); });
    sync();
  }
  function downloadCsv(name, rows, cols) {
    const csv = '﻿' + [cols.map(c => c[1]).join(','), ...rows.map(r => cols.map(([k]) => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\r\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  const rowData = (o) => esc(JSON.stringify(o));

  async function users() {
    const f = S.users;
    body().innerHTML = `<div class="card">
      <div class="toolbar">
        <input type="text" id="u-q" placeholder="Tìm theo email hoặc tên…" value="${esc(f.q)}">
        <select id="u-filter">${[['all', 'Tất cả'], ['premium', 'Premium'], ['free', 'Miễn phí'], ['unverified', 'Chưa xác minh'], ['banned', 'Bị khóa'], ['admin', 'Admin']]
          .map(([v, l]) => `<option value="${v}" ${f.filter === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm" id="u-search">Tìm</button>
        <a class="btn sm" href="/api/admin/users.csv">Xuất tất cả CSV</a>
        <button class="btn sm primary" id="u-new">+ Thêm người dùng</button>
      </div>
      <div class="bulk-bar" id="users-bulk" hidden>
        <b data-count></b>
        <select id="ub-action">
          <option value="">Chọn thao tác…</option>
          <option value="plan-premium">Cộng ngày Premium</option><option value="plan-free">Chuyển về Miễn phí</option><option value="add_credits">Cộng / trừ lượt mua thêm</option>
          <option value="verify">Xác minh email</option><option value="reset_usage">Làm mới lượt hôm nay</option>
          <option value="logout_all">Đăng xuất mọi thiết bị</option><option value="ban">Khóa tài khoản</option><option value="unban">Mở khóa</option>
          <option value="export">Xuất CSV mục đã chọn</option><option value="delete">Xóa vĩnh viễn</option>
        </select>
        <span id="ub-days-wrap" hidden><input type="number" id="ub-days" min="0" max="3650" value="30" title="Số ngày (0 = vĩnh viễn)"></span>
        <span id="ub-credits-wrap" hidden><input type="number" id="ub-credits" min="-100000" max="100000" step="10" value="100" title="Số lượt (số âm để trừ)"></span>
        <button class="btn sm primary" id="ub-apply">Áp dụng</button>
        <button class="btn sm" id="ub-clear">Bỏ chọn</button>
      </div>
      <div class="table-wrap"><table class="admin-table"><thead><tr><th class="pick"><input type="checkbox" id="users-all" title="Chọn cả trang"></th><th>Người dùng</th><th>Trạng thái</th><th>Gói</th><th>Đã chi</th><th>Đăng nhập cuối</th></tr></thead>
      <tbody id="u-rows"><tr><td colspan="6" class="muted">Đang tải…</td></tr></tbody></table></div>
      <div class="pager" id="u-pager"></div></div>`;
    const go = () => { f.q = $('#u-q').value.trim(); f.filter = $('#u-filter').value; f.page = 0; users(); };
    $('#u-search').addEventListener('click', go);
    $('#u-filter').addEventListener('change', go);
    $('#u-q').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#u-new').addEventListener('click', createUserModal);
    $('#ub-action').addEventListener('change', () => { $('#ub-days-wrap').hidden = $('#ub-action').value !== 'plan-premium'; $('#ub-credits-wrap').hidden = $('#ub-action').value !== 'add_credits'; });
    $('#ub-clear').addEventListener('click', () => { sel.users.clear(); users(); });
    $('#ub-apply').addEventListener('click', (e) => run(e.target, async () => {
      const v = $('#ub-action').value, ids = [...sel.users.keys()].map(Number);
      if (!v) throw new Error('Hãy chọn thao tác.');
      if (v === 'export') {
        downloadCsv(`voicekit-users-chon-${ids.length}.csv`, [...sel.users.values()], [['id', 'ID'], ['email', 'Email'], ['name', 'Tên'], ['plan', 'Gói'], ['plan_expires_text', 'Hết hạn'], ['extra_credits', 'Lượt mua thêm'], ['verified', 'Xác minh'], ['banned', 'Khóa'], ['role', 'Quyền'], ['spent', 'Đã chi']]);
        return;
      }
      const payload = { ids };
      if (v.startsWith('plan-')) { payload.action = 'plan'; payload.plan = v.slice(5); payload.days = Number($('#ub-days').value) || 0; }
      else payload.action = v;
      if (v === 'add_credits') payload.amount = Number($('#ub-credits').value) || 0;
      if (v === 'delete') {
        const c = await (window.customPrompt ? window.customPrompt(`Xóa vĩnh viễn ${ids.length} tài khoản cùng lượt dùng và đơn hàng. Nhập XOA để xác nhận:`, '', 'Xác nhận xóa tài khoản') : prompt(`Xóa vĩnh viễn ${ids.length} tài khoản cùng lượt dùng và đơn hàng. Nhập XOA để xác nhận:`));
        if (c === null) return;
        payload.confirm = c.trim();
      } else {
        const ok = await (window.customConfirm ? window.customConfirm(`Áp dụng "${$('#ub-action').selectedOptions[0].textContent}" cho ${ids.length} tài khoản?`, 'Xác nhận áp dụng') : confirm(`Áp dụng "${$('#ub-action').selectedOptions[0].textContent}" cho ${ids.length} tài khoản?`));
        if (!ok) return;
      }
      const r = await post('/api/admin/users/bulk', payload);
      sel.users.clear(); users();
      return r;
    }));
    try {
      const r = await api(`/api/admin/users?q=${encodeURIComponent(f.q)}&filter=${f.filter}&page=${f.page}`);
      $('#u-rows').innerHTML = r.users.map(u => `<tr data-user="${u.id}">
        <td class="pick"><input type="checkbox" data-pick="${u.id}" data-row="${rowData({ ...u, plan_expires_text: u.plan_expires ? date(u.plan_expires) : '' })}"></td>
        <td><b>${esc(u.name || '—')}</b><small>${esc(u.email)}</small></td>
        <td>${userTags(u)}<small>Tạo ${date(u.created_at)}</small></td>
        <td>${isPrem(u) ? '<span class="tag pro">Premium</span>' : '<span class="tag">Miễn phí</span>'}<small>${isPrem(u) ? (u.plan_expires ? 'đến ' + date(u.plan_expires) : 'vĩnh viễn') : ''}</small>${u.extra_credits ? `<small>⚡ ${fmt(u.extra_credits)} lượt mua thêm</small>` : ''}</td>
        <td>${money(u.spent)}</td>
        <td><small>${dt(u.last_login)}</small></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Không có kết quả.</td></tr>';
      $$('#u-rows [data-user]').forEach(tr => tr.addEventListener('click', () => userModal(Number(tr.dataset.user))));
      wireSelection('users', '#u-rows');
      pager('#u-pager', r.total, r.page, r.pageSize, (p) => { f.page = p; users(); });
    } catch (e) { $('#u-rows').innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`; }
  }

  /* Hộp form dùng chung (tạo / sửa) */
  function formModal(title, html, onSubmit, submitText = 'Lưu') {
    $('#adm-form-title').textContent = title;
    $('#adm-form-body').innerHTML = `<form id="adm-form" novalidate>${html}<div class="modal-foot spread" style="margin-top:16px"><span></span><button class="btn primary" type="submit">${submitText}</button></div></form>`;
    openModal('#modal-adm-form');
    const form = $('#adm-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(form.querySelector('[type=submit]'), async () => { const r = await onSubmit(new FormData(form), form); if (r !== false) $('#modal-adm-form').hidden = true; return r; });
    });
    return form;
  }

  function createUserModal() {
    const form = formModal('Thêm người dùng', `
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Email</span><input type="email" name="email" required autocomplete="off"></label>
        <label class="field"><span>Tên hiển thị</span><input type="text" name="name" maxlength="60" autocomplete="off"></label>
      </div>
      <label class="field"><span>Mật khẩu <em class="muted">để trống = gửi email mời tự tạo mật khẩu</em></span><input type="text" name="password" minlength="8" autocomplete="new-password" placeholder="Ít nhất 8 ký tự"></label>
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Gói</span><select name="plan"><option value="free">Miễn phí</option><option value="premium">Premium</option></select></label>
        <label class="field"><span>Premium hết hạn <em class="muted">trống = vĩnh viễn</em></span><input type="date" name="plan_expires"></label>
      </div>
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Quyền</span><select name="role"><option value="user">Người dùng</option><option value="admin">Quản trị viên</option></select></label>
        <div class="field"><span>Tùy chọn</span><label><input type="checkbox" name="verified" checked> Đánh dấu đã xác minh email</label><label><input type="checkbox" name="invite"> Gửi email mời kể cả khi đặt mật khẩu</label></div>
      </div>`, async (fd) => {
      const r = await post('/api/admin/users', {
        email: fd.get('email'), name: fd.get('name'), password: fd.get('password'), plan: fd.get('plan'), plan_expires: fd.get('plan_expires') || null,
        role: fd.get('role'), verified: fd.has('verified'), invite: fd.has('invite')
      });
      users();
      return r;
    }, 'Tạo tài khoản');
    const toggle = () => { form.plan_expires.closest('.field').style.opacity = form.plan.value === 'premium' ? 1 : .4; form.plan_expires.disabled = form.plan.value !== 'premium'; };
    form.plan.addEventListener('change', toggle); toggle();
    form.email.focus();
  }

  function pager(sel, total, page, size, go) {

    const pages = Math.max(1, Math.ceil(total / size));
    $(sel).innerHTML = `<span>${fmt(total)} kết quả · trang ${page + 1}/${pages}</span><span>
      <button class="btn sm" ${page <= 0 ? 'disabled' : ''} data-p="${page - 1}">← Trước</button>
      <button class="btn sm" ${page >= pages - 1 ? 'disabled' : ''} data-p="${page + 1}">Sau →</button></span>`;
    $$(sel + ' [data-p]').forEach(b => b.addEventListener('click', () => go(Number(b.dataset.p))));
  }

  async function userModal(id) {
    openModal('#modal-adm-user');
    const box = $('#adm-user-body');
    box.innerHTML = '<div class="pay-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div></div>';
    let d;
    try { d = await api(`/api/admin/users/${id}`); } catch (e) {
      box.innerHTML = `<div class="pay-center"><span style="font-size:30px">⚠️</span><b>Không tải được chi tiết người dùng</b><span class="muted small">${esc(e.message)}</span><button class="btn sm primary" id="am-retry">Thử lại</button></div>`;
      $('#am-retry').addEventListener('click', () => userModal(id));
      return;
    }
    const u = d.user, prem = u.effectivePlan === 'premium';
    const self = u.id === vkAccount.state.user?.id;
    const act = (action, extra = {}) => post(`/api/admin/users/${id}/action`, { action, ...extra });
    box.innerHTML = `
      <div class="profile"><span class="avatar lg">${esc((u.name || u.email)[0].toUpperCase())}</span>
        <div><strong>${esc(u.name || '—')}</strong><span class="muted small">${esc(u.email)} · ID ${u.id}</span><span>${userTags({ ...u, role: u.role, banned: u.banned })}</span></div></div>
      <div class="info-grid">
        <div><small>Gói hiện tại</small><b>${prem ? 'Premium' : u.verified ? 'Miễn phí' : 'Khách'}</b>${prem ? `<small>${u.planExpires ? 'đến ' + date(u.planExpires) : 'vĩnh viễn'}</small>` : ''}</div>
        <div><small>Lượt hôm nay</small><b>${fmt(d.usage.calls)}</b><small>${fmt(d.usage.chars)} ký tự · ⚡ ${fmt(u.credits)} lượt mua thêm</small></div>
        <div><small>Phiên đăng nhập</small><b>${fmt(d.sessions.n)}</b><small>cuối: ${dt(u.lastLogin)}</small></div>
      </div>
      <div class="adm-section"><h5>Sửa thông tin</h5>
        <form id="am-edit">
          <div class="field-group" style="margin-top:0">
            <label class="field"><span>Email</span><input type="email" name="email" value="${esc(u.email)}" required></label>
            <label class="field"><span>Tên hiển thị</span><input type="text" name="name" value="${esc(u.name)}" maxlength="60"></label>
          </div>
          <div class="field-group" style="margin-top:0;grid-template-columns:1fr 1fr 1fr">
            <label class="field"><span>Gói</span><select name="plan"><option value="free">Miễn phí</option><option value="premium" ${u.plan === 'premium' ? 'selected' : ''}>Premium</option></select></label>
            <label class="field"><span>Hết hạn <em class="muted">trống = vĩnh viễn</em></span><input type="date" name="plan_expires" value="${u.planExpires ? new Date(u.planExpires + 7 * 3600e3).toISOString().slice(0, 10) : ''}"></label>
            <label class="field"><span>Quyền</span><select name="role" ${self ? 'disabled' : ''}><option value="user">Người dùng</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Quản trị viên</option></select></label>
          </div>
          <div class="field-group" style="margin-top:0">
            <label class="field"><span>Mật khẩu mới <em class="muted">để trống nếu không đổi</em></span><input type="text" name="password" minlength="8" autocomplete="new-password"></label>
            <label class="field"><span>Lượt mua thêm</span><input type="number" name="credits" min="0" step="10" value="${u.credits}"></label>
            <div class="field"><span>Trạng thái</span><label><input type="checkbox" name="verified" ${u.verified ? 'checked' : ''}> Đã xác minh email</label><label><input type="checkbox" name="banned" ${u.banned ? 'checked' : ''} ${self ? 'disabled' : ''}> Khóa tài khoản</label></div>
          </div>
          <button class="btn sm primary" type="submit">Lưu thay đổi</button>
        </form></div>
      <div class="adm-section"><h5>Gia hạn nhanh</h5>
        <div class="adm-actions">
          <select id="am-plan"><option value="premium" ${prem ? 'selected' : ''}>Premium</option><option value="free" ${!prem ? 'selected' : ''}>Miễn phí</option></select>
          <select id="am-mode"><option value="extend">Cộng thêm</option><option value="set">Đặt lại từ hôm nay</option></select>
          <input type="number" id="am-days" min="0" max="3650" value="30" title="Số ngày (0 = vĩnh viễn)"> <span class="small muted">ngày (0 = vĩnh viễn)</span>
          <label class="small"><input type="checkbox" id="am-notify" checked style="width:auto"> Báo qua email</label>
          <button class="btn sm primary" id="am-save-plan">Lưu gói</button>
        </div></div>
      <div class="adm-section"><h5>Tài khoản</h5>
        <div class="adm-actions">
          ${u.verified ? '' : '<button class="btn sm" data-a="verify">Xác minh email</button><button class="btn sm" data-a="resend_verify">Gửi lại mail xác minh</button>'}
          <button class="btn sm" data-a="reset_password">Gửi mail đặt lại mật khẩu</button>
          <button class="btn sm" data-a="logout_all">Đăng xuất mọi thiết bị</button>
          <button class="btn sm" data-a="reset_usage">Làm mới lượt hôm nay</button>
          ${self ? '' : `<button class="btn sm" data-a="role" data-role="${u.role === 'admin' ? 'user' : 'admin'}">${u.role === 'admin' ? 'Gỡ quyền admin' : 'Cấp quyền admin'}</button>`}
          ${self ? '' : u.banned ? '<button class="btn sm" data-a="unban">Mở khóa</button>' : '<button class="btn sm danger" data-a="ban">Khóa tài khoản</button>'}
        </div></div>
      <div class="adm-section"><h5>Đơn hàng (${d.orders.length})</h5>
        <div class="mini-list">${d.orders.map(o => `<div class="row" style="cursor:default"><span>#${o.orderCode} · ${o.kind === 'credits' ? '⚡ ' : 'Premium '}${esc(o.packageName)}<br><small>${dt(o.createdAt)}${o.paidVia ? ' · qua ' + o.paidVia : ''}</small></span>
          <span style="text-align:right">${money(o.amount)}<br><span class="st ${o.status}">${ST[o.status] || esc(o.status)}</span></span></div>`).join('') || '<span class="muted small">Chưa có đơn.</span>'}</div></div>
      ${self ? '' : '<div class="adm-section"><h5>Vùng nguy hiểm</h5><button class="btn sm danger" data-a="delete">Xóa vĩnh viễn tài khoản</button></div>'}`;

    const ef = $('#am-edit');
    const syncExp = () => { ef.plan_expires.disabled = ef.plan.value !== 'premium'; };
    ef.plan.addEventListener('change', syncExp); syncExp();
    ef.addEventListener('submit', (e) => {
      e.preventDefault();
      run(ef.querySelector('[type=submit]'), async () => {
        const fd = new FormData(ef);
        const payload = { email: fd.get('email'), name: fd.get('name'), plan: fd.get('plan'), plan_expires: fd.get('plan_expires') || null, verified: fd.has('verified'), password: fd.get('password'), credits: Number(fd.get('credits')) || 0 };
        if (!self) { payload.role = fd.get('role'); payload.banned = fd.has('banned'); }
        const r = await post(`/api/admin/users/${id}/update`, payload);
        userModal(id); refresh(); return r;
      });
    });
    $('#am-save-plan').addEventListener('click', (e) => run(e.target, async () => {
      const r = await act('plan', { plan: $('#am-plan').value, mode: $('#am-mode').value, days: Number($('#am-days').value) || 0, notify: $('#am-notify').checked });
      userModal(id); refresh(); return r;
    }));
    $$('#adm-user-body [data-a]').forEach(b => b.addEventListener('click', () => run(b, async () => {
      const a = b.dataset.a, extra = {};
      if (a === 'rename') extra.name = $('#am-name').value;
      if (a === 'role') {
        extra.role = b.dataset.role;
        const msg = extra.role === 'admin' ? 'Cấp quyền quản trị cho tài khoản này?' : 'Gỡ quyền quản trị?';
        const ok = await (window.customConfirm ? window.customConfirm(msg, 'Phân quyền') : confirm(msg));
        if (!ok) return;
      }
      if (a === 'ban') {
        const ok = await (window.customConfirm ? window.customConfirm('Khóa tài khoản và đăng xuất mọi thiết bị?', 'Khóa tài khoản') : confirm('Khóa tài khoản và đăng xuất mọi thiết bị?'));
        if (!ok) return;
        extra.reason = (await (window.customPrompt ? window.customPrompt('Lý do (tùy chọn):', '', 'Lý do khóa') : prompt('Lý do (tùy chọn):'))) || '';
      }
      if (a === 'delete') {
        const c = await (window.customPrompt ? window.customPrompt(`Xóa vĩnh viễn tài khoản, lượt dùng và đơn hàng. Nhập "${u.email}" để xác nhận:`, '', 'Xác nhận xóa tài khoản') : prompt(`Xóa vĩnh viễn tài khoản, lượt dùng và đơn hàng. Nhập "${u.email}" để xác nhận:`));
        if (c === null) return;
        extra.confirm = c.trim();
      }
      const r = await act(a, extra);
      if (a === 'delete') { $('#modal-adm-user').hidden = true; } else userModal(id);
      refresh();
      return r;
    })));
  }
  const refresh = () => { if (S.tab === 'users') users(); else if (S.tab === 'overview') overview(); };

  /* ---------------- Đơn hàng ---------------- */
  async function orders() {
    const f = S.orders;
    const qs = `q=${encodeURIComponent(f.q)}&status=${f.status}&invoice=${f.invoice || ''}`;
    body().innerHTML = `<div class="card">
      <div class="toolbar">
        <input type="text" id="o-q" placeholder="Mã đơn, email hoặc nội dung CK…" value="${esc(f.q)}">
        <select id="o-status"><option value="">Mọi trạng thái</option>${Object.entries(ST).map(([v, l]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <select id="o-invoice"><option value="">Mọi đơn</option><option value="need" ${f.invoice === 'need' ? 'selected' : ''}>Cần xuất hóa đơn</option><option value="any" ${f.invoice === 'any' ? 'selected' : ''}>Có yêu cầu hóa đơn</option></select>
        <button class="btn sm" id="o-search">Tìm</button>
        <a class="btn sm" href="/api/admin/orders.csv?${qs}">Xuất CSV</a>
        <button class="btn sm primary" id="o-new">+ Tạo đơn</button>
      </div>
      <div class="bulk-bar" id="orders-bulk" hidden>
        <b data-count></b>
        <select id="ob-action">
          <option value="">Chọn thao tác…</option>
          <option value="sync">Đối soát với payOS</option><option value="mark_paid">Kích hoạt (đã nhận tiền)</option>
          <option value="cancel">Hủy đơn đang chờ</option><option value="invoice_issued">Đánh dấu đã xuất hóa đơn</option>
          <option value="export">Xuất CSV mục đã chọn</option><option value="delete">Xóa vĩnh viễn</option>
        </select>
        <label class="small" id="ob-receipt-wrap" hidden><input type="checkbox" id="ob-receipt"> Gửi biên lai</label>
        <button class="btn sm primary" id="ob-apply">Áp dụng</button>
        <button class="btn sm" id="ob-clear">Bỏ chọn</button>
      </div>
      <div class="muted small" id="o-sum" style="margin-bottom:10px"></div>
      <div class="table-wrap"><table class="admin-table"><thead><tr><th class="pick"><input type="checkbox" id="orders-all" title="Chọn cả trang"></th><th>Đơn</th><th>Khách</th><th>Số tiền</th><th>Trạng thái</th><th>Thao tác</th></tr></thead>
      <tbody id="o-rows"><tr><td colspan="6" class="muted">Đang tải…</td></tr></tbody></table></div>
      <div class="pager" id="o-pager"></div></div>`;
    const go = () => { f.q = $('#o-q').value.trim(); f.status = $('#o-status').value; f.invoice = $('#o-invoice').value; f.page = 0; orders(); };
    $('#o-search').addEventListener('click', go);
    $('#o-status').addEventListener('change', go);
    $('#o-invoice').addEventListener('change', go);
    $('#o-q').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    $('#o-new').addEventListener('click', createOrderModal);
    $('#ob-action').addEventListener('change', () => { $('#ob-receipt-wrap').hidden = $('#ob-action').value !== 'mark_paid'; });
    $('#ob-clear').addEventListener('click', () => { sel.orders.clear(); orders(); });
    $('#ob-apply').addEventListener('click', (e) => run(e.target, async () => {
      const v = $('#ob-action').value, codes = [...sel.orders.keys()].map(Number);
      if (!v) throw new Error('Hãy chọn thao tác.');
      if (v === 'export') {
        downloadCsv(`voicekit-orders-chon-${codes.length}.csv`, [...sel.orders.values()], [['orderCode', 'Mã đơn'], ['email', 'Email'], ['packageName', 'Gói'], ['amount', 'Số tiền'], ['status', 'Trạng thái'], ['description', 'Nội dung CK'], ['createdText', 'Tạo lúc'], ['paidText', 'Thanh toán lúc'], ['invoiceName', 'Tên hóa đơn'], ['invoiceTax', 'MST'], ['invoiceNo', 'Số HĐĐT']]);
        return;
      }
      const payload = { codes, action: v, send_receipt: $('#ob-receipt').checked };
      if (v === 'delete') {
        const c = await (window.customPrompt ? window.customPrompt(`Xóa vĩnh viễn ${codes.length} đơn (không thu hồi ngày Premium đã cộng). Nhập XOA để xác nhận:`, '', 'Xác nhận xóa đơn hàng') : prompt(`Xóa vĩnh viễn ${codes.length} đơn (không thu hồi ngày Premium đã cộng). Nhập XOA để xác nhận:`));
        if (c === null) return;
        payload.confirm = c.trim();
      } else {
        const ok = await (window.customConfirm ? window.customConfirm(`Áp dụng "${$('#ob-action').selectedOptions[0].textContent}" cho ${codes.length} đơn?`, 'Xác nhận áp dụng') : confirm(`Áp dụng "${$('#ob-action').selectedOptions[0].textContent}" cho ${codes.length} đơn?`));
        if (!ok) return;
      }
      const r = await post('/api/admin/orders/bulk', payload);
      sel.orders.clear(); orders();
      return r;
    }));
    try {
      const r = await api(`/api/admin/orders?${qs}&page=${f.page}`);
      $('#o-sum').textContent = `${fmt(r.total)} đơn · đã thu ${money(r.sum)} · bấm vào một dòng để xem / sửa`;
      $('#o-rows').innerHTML = r.orders.map(o => `<tr data-order="${o.orderCode}">
        <td class="pick"><input type="checkbox" data-pick="${o.orderCode}" data-row="${rowData({ ...o, createdText: dt(o.createdAt), paidText: o.paidAt ? dt(o.paidAt) : '', invoiceName: o.invoice?.name || '', invoiceTax: o.invoice?.tax_code || '' })}"></td>
        <td><b>#${o.orderCode}</b>${o.kind === 'credits' ? ' <span class="tag" style="color:var(--accent-2)">⚡ Lượt</span>' : ''}<small>${o.kind === 'credits' ? esc(o.packageName) : 'Premium ' + esc(o.packageName)} · ${esc(o.description)}</small><small>${dt(o.createdAt)}</small></td>
        <td>${esc(o.email)}${o.invoice ? `<small class="inv-info">🧾 ${esc(o.invoice.name)}${o.invoice.tax_code ? ' · MST ' + esc(o.invoice.tax_code) : ''}</small>${o.invoiceIssuedAt ? `<span class="tag ok">Đã xuất HĐ${o.invoiceNo ? ' · ' + esc(o.invoiceNo) : ''}</span>` : o.status === 'PAID' ? '<span class="tag warn">Chưa xuất HĐ</span>' : ''}` : ''}</td>
        <td><b>${money(o.amount)}</b></td>
        <td><span class="st ${o.status}">${ST[o.status] || esc(o.status)}</span>${o.paidAt ? `<small>${dt(o.paidAt)} · ${esc(o.paidVia || '')}</small>` : ''}${o.note ? `<small>${esc(o.note)}</small>` : ''}</td>
        <td><div class="act">
          ${o.status === 'PENDING' && o.checkoutUrl ? `<button class="btn sm" data-o="sync" data-code="${o.orderCode}">Đối soát</button>` : ''}
          ${o.status === 'PAID' ? `<a class="btn sm" href="/invoice/${o.orderCode}" target="_blank" rel="noopener">Hóa đơn</a>` : `<button class="btn sm" data-o="mark_paid" data-code="${o.orderCode}">Kích hoạt</button>`}
          <button class="btn sm" data-edit="${o.orderCode}">Sửa</button>
        </div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Không có đơn nào.</td></tr>';
      $$('#o-rows [data-order]').forEach(tr => tr.addEventListener('click', (e) => { if (!e.target.closest('button, a, input')) orderModal(Number(tr.dataset.order)); }));
      $$('#o-rows [data-edit]').forEach(b => b.addEventListener('click', () => orderModal(Number(b.dataset.edit))));
      $$('#o-rows [data-o]').forEach(b => b.addEventListener('click', () => run(b, async () => {
        const a = b.dataset.o, extra = {};
        if (a === 'mark_paid') {
          const ok = await (window.customConfirm ? window.customConfirm('Xác nhận đã nhận tiền cho đơn này và kích hoạt Premium cho khách?', 'Kích hoạt đơn hàng') : confirm('Xác nhận đã nhận tiền cho đơn này và kích hoạt Premium cho khách?'));
          if (!ok) return;
          extra.note = (await (window.customPrompt ? window.customPrompt('Ghi chú (vd: đã kiểm tra sao kê):', '', 'Ghi chú thanh toán') : prompt('Ghi chú (vd: đã kiểm tra sao kê):'))) || '';
        }
        const res = await post(`/api/admin/orders/${b.dataset.code}/action`, { action: a, ...extra });
        orders();
        return res;
      })));
      wireSelection('orders', '#o-rows');
      pager('#o-pager', r.total, r.page, r.pageSize, (p) => { f.page = p; orders(); });
    } catch (e) { $('#o-rows').innerHTML = `<tr><td colspan="6">${esc(e.message)}</td></tr>`; }
  }

  const invoiceFields = (inv) => `
    <label class="invoice-toggle" style="margin-top:4px"><input type="checkbox" name="inv_on" ${inv ? 'checked' : ''}> <span><b>Có thông tin xuất hóa đơn</b></span></label>
    <div class="inv-fields" ${inv ? '' : 'hidden'}>
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Loại</span><select name="inv_type"><option value="personal">Cá nhân</option><option value="company" ${inv?.type === 'company' ? 'selected' : ''}>Công ty</option></select></label>
        <label class="field"><span>Tên người mua / công ty</span><input type="text" name="inv_name" value="${esc(inv?.name || '')}"></label>
      </div>
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Mã số thuế</span><input type="text" name="inv_tax" value="${esc(inv?.tax_code || '')}" placeholder="0101234567"></label>
        <label class="field"><span>Email nhận hóa đơn</span><input type="email" name="inv_email" value="${esc(inv?.email || '')}"></label>
      </div>
      <label class="field"><span>Địa chỉ</span><input type="text" name="inv_addr" value="${esc(inv?.address || '')}"></label>
    </div>`;
  const wireInvoice = (form) => { form.inv_on.addEventListener('change', () => { form.querySelector('.inv-fields').hidden = !form.inv_on.checked; }); };
  const readInvoice = (fd) => fd.has('inv_on') ? { type: fd.get('inv_type'), name: fd.get('inv_name'), tax_code: fd.get('inv_tax'), email: fd.get('inv_email'), address: fd.get('inv_addr') } : null;

  async function createOrderModal() {
    let pk = [];
    try { pk = (await api('/api/admin/settings')).packages; } catch {}
    const form = formModal('Tạo đơn thủ công', `
      <p class="muted small" style="margin-bottom:12px">Dùng cho khách chuyển khoản ngoài payOS, tặng gói, hoặc bù đơn lỗi. Đơn "Đã thanh toán" sẽ cộng ngày Premium ngay.</p>
      <label class="field"><span>Email khách hàng</span><input type="email" name="email" required list="adm-user-emails" autocomplete="off" placeholder="Gõ để tìm…"><datalist id="adm-user-emails"></datalist></label>
      <label class="field"><span>Gói</span><select name="package_id">${pk.map(p => `<option value="${esc(p.id)}">${esc(p.name)} · ${fmt(p.days)} ngày · ${money(p.price)}${p.active ? '' : ' (đã ẩn)'}</option>`).join('')}<option value="credits">⚡ Mua lượt…</option><option value="custom">Premium tùy chỉnh…</option></select></label>
      <div class="field-group credits-pkg" style="margin-top:0" hidden>
        <label class="field"><span>Số lượt</span><input type="number" name="credits" min="1" step="10" value="100"></label>
        <label class="field"><span>Số tiền <em class="muted">trống = theo giá lượt</em></span><input type="text" name="credits_amount" inputmode="numeric" placeholder="tự tính"></label>
      </div>
      <div class="field-group custom-pkg" style="margin-top:0" hidden>
        <label class="field"><span>Tên gói</span><input type="text" name="c_name" placeholder="vd: Tặng 7 ngày"></label>
        <label class="field"><span>Số ngày</span><input type="number" name="c_days" min="1" max="3650" value="30"></label>
        <label class="field"><span>Số tiền (VND)</span><input type="number" name="c_amount" min="0" step="1000" value="0"></label>
      </div>
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Trạng thái</span><select name="status"><option value="PAID">Đã thanh toán (kích hoạt ngay)</option><option value="PENDING">Chờ thanh toán</option></select></label>
        <label class="field"><span>Mã giao dịch ngân hàng <em class="muted">tùy chọn</em></span><input type="text" name="reference" maxlength="60"></label>
      </div>
      <label class="field"><span>Ghi chú</span><input type="text" name="note" maxlength="200" placeholder="vd: CK Vietcombank 19/10, tặng khách thân thiết…"></label>
      <label><input type="checkbox" name="send_receipt" checked> Gửi email biên lai cho khách</label>`, async (fd) => {
      const custom = fd.get('package_id') === 'custom', cr = fd.get('package_id') === 'credits';
      const r = await post('/api/admin/orders', {
        email: fd.get('email'), package_id: custom ? '' : fd.get('package_id'), credits: cr ? Number(fd.get('credits')) : undefined,
        custom: custom ? { name: fd.get('c_name'), days: Number(fd.get('c_days')), amount: Number(fd.get('c_amount')) } : cr ? { amount: fd.get('credits_amount') } : null,
        status: fd.get('status'), reference: fd.get('reference'), note: fd.get('note'), send_receipt: fd.has('send_receipt')
      });
      orders();
      return r;
    }, 'Tạo đơn');
    form.package_id.addEventListener('change', () => { form.querySelector('.custom-pkg').hidden = form.package_id.value !== 'custom'; form.querySelector('.credits-pkg').hidden = form.package_id.value !== 'credits'; });
    let t = 0;
    form.email.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const q = form.email.value.trim();
        if (q.length < 2) return;
        try { const r = await api(`/api/admin/users?q=${encodeURIComponent(q)}`); $('#adm-user-emails').innerHTML = r.users.map(u => `<option value="${esc(u.email)}">${esc(u.name || '')}</option>`).join(''); } catch {}
      }, 250);
    });
    form.email.focus();
  }

  async function orderModal(code) {
    let o;
    try { o = (await api(`/api/admin/orders/${code}`)).order; } catch (e) { return toast(e.message, 'err'); }
    const paid = o.status === 'PAID';
    const form = formModal(`Đơn #${o.orderCode}`, `
      <div class="info-grid" style="margin-bottom:14px">
        <div><small>Khách hàng</small><b style="word-break:break-all">${esc(o.email)}</b></div>
        <div><small>Trạng thái</small><span class="st ${o.status}">${ST[o.status] || esc(o.status)}</span>${o.paidAt ? `<small>${dt(o.paidAt)} · ${esc(o.paidVia || '')}</small>` : ''}</div>
        <div><small>Nội dung CK</small><b>${esc(o.description)}</b>${o.reference ? `<small>Ref ${esc(o.reference)}</small>` : ''}</div>
      </div>
      <div class="field-group" style="margin-top:0;grid-template-columns:1.2fr 1fr 1fr">
        <label class="field"><span>Tên gói</span><input type="text" name="package_name" value="${esc(o.packageName)}" ${paid ? 'disabled' : ''}></label>
        <label class="field"><span>Số ngày</span><input type="number" name="days" min="1" max="3650" value="${o.days}" ${paid ? 'disabled' : ''}></label>
        <label class="field"><span>Số tiền</span><input type="number" name="amount" min="0" step="1000" value="${o.amount}" ${paid ? 'disabled' : ''}></label>
      </div>
      ${paid ? '<p class="muted small" style="margin:-4px 0 12px">Đơn đã thanh toán: không sửa giá / số ngày / trạng thái.</p>' : `
      <div class="field-group" style="margin-top:0">
        <label class="field"><span>Trạng thái</span><select name="status"><option value="">Giữ nguyên</option><option value="PAID">Đã thanh toán (kích hoạt)</option>${o.status === 'PENDING' ? '<option value="CANCELLED">Hủy đơn</option>' : ''}</select></label>
        <div class="field"><span>&nbsp;</span><label><input type="checkbox" name="send_receipt" checked> Gửi biên lai khi kích hoạt</label></div>
      </div>`}
      <label class="field"><span>Ghi chú</span><input type="text" name="note" maxlength="200" value="${esc(o.note || '')}"></label>
      ${invoiceFields(o.invoice)}
      <label class="field"><span>Số hóa đơn điện tử <em class="muted">sau khi phát hành bên nhà cung cấp HĐĐT</em></span><input type="text" name="invoice_no" maxlength="60" value="${esc(o.invoiceNo || '')}"></label>
      <div class="adm-actions" style="margin-top:4px">
        ${paid ? `<a class="btn sm" href="/invoice/${o.orderCode}" target="_blank" rel="noopener">🧾 Xem hóa đơn</a>` : ''}
        ${o.checkoutUrl && o.status === 'PENDING' ? `<a class="btn sm" href="${esc(o.checkoutUrl)}" target="_blank" rel="noopener">Trang payOS ↗</a>` : ''}
        <button class="btn sm danger" type="button" id="om-delete">Xóa đơn</button>
      </div>`, async (fd) => {
      const payload = { note: fd.get('note'), invoice: readInvoice(fd), invoice_no: fd.get('invoice_no') };
      if (!paid) Object.assign(payload, { package_name: fd.get('package_name'), days: Number(fd.get('days')), amount: Number(fd.get('amount')), status: fd.get('status') || undefined, send_receipt: fd.has('send_receipt') });
      const r = await post(`/api/admin/orders/${o.orderCode}/update`, payload);
      orders();
      return r;
    });
    wireInvoice(form);
    $('#om-delete').addEventListener('click', (e) => {
      run(e.target, async () => {
        const ok = await (window.customConfirm ? window.customConfirm(`Xóa vĩnh viễn đơn #${o.orderCode}? ${paid ? 'Ngày Premium đã cộng sẽ KHÔNG bị thu hồi.' : ''}`, 'Xóa đơn hàng') : confirm(`Xóa vĩnh viễn đơn #${o.orderCode}? ${paid ? 'Ngày Premium đã cộng sẽ KHÔNG bị thu hồi.' : ''}`));
        if (!ok) return;
        const r = await post(`/api/admin/orders/${o.orderCode}/action`, { action: 'delete' });
        $('#modal-adm-form').hidden = true;
        orders();
        return r;
      });
    });
  }

  /* ---------------- Gói & giá ---------------- */

  async function settings() {
    loading();
    let s;
    try { s = await api('/api/admin/settings'); } catch (e) { body().innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    const pkgRow = (p) => `<tr>
      <td><input data-k="id" value="${esc(p.id)}" maxlength="16"></td>
      <td><input data-k="name" value="${esc(p.name)}" maxlength="30"></td>
      <td><input data-k="days" type="number" min="1" max="3650" value="${p.days}"></td>
      <td><input data-k="price" type="number" min="2000" step="1000" value="${p.price}"></td>
      <td style="text-align:center"><input data-k="active" type="checkbox" ${p.active ? 'checked' : ''} style="width:auto"></td>
      <td><button class="btn sm danger" data-del>✕</button></td></tr>`;
    const names = { guest: 'Khách', free: 'Miễn phí', premium: 'Premium' };
    body().innerHTML = `
      <div class="card" style="margin-bottom:16px">
        <h4>Gói Premium bán qua payOS</h4>
        <div class="table-wrap"><table class="admin-table settings-table"><thead><tr><th>Mã</th><th>Tên hiển thị</th><th>Số ngày</th><th>Giá (VND)</th><th>Bán</th><th></th></tr></thead>
          <tbody id="pk-rows">${s.packages.map(pkgRow).join('')}</tbody></table></div>
        <div class="adm-actions" style="margin-top:10px"><button class="btn sm" id="pk-add">+ Thêm gói</button>
          <span class="muted small">Giá tối thiểu 2.000đ. Đổi giá không ảnh hưởng đơn đã tạo.</span></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <h4>Giới hạn theo gói</h4>
        <div class="table-wrap"><table class="admin-table settings-table"><thead><tr><th>Gói</th><th>Lượt Edge/CapCut mỗi ngày</th><th>Ký tự tối đa mỗi lượt</th></tr></thead>
          <tbody>${['guest', 'free', 'premium'].map(id => `<tr data-plan="${id}"><td><b>${names[id]}</b></td>
            <td><input data-k="ttsCalls" type="number" min="0" max="100000" value="${s.limits[id].ttsCalls}"></td>
            <td><input data-k="maxChars" type="number" min="50" max="20000" value="${s.limits[id].maxChars}"></td></tr>`).join('')}</tbody></table></div>
        <div class="adm-actions" style="margin-top:12px"><span class="small">Giới hạn tổng toàn hệ thống mỗi ngày</span>
          <input type="number" id="st-global" min="100" max="95000" value="${s.globalDaily}"> <span class="muted small">lượt (Cloudflare free: 100.000 request/ngày, nên để ≤ 60.000)</span></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <h4>🔖 Câu ghi nguồn cuối file giọng đọc</h4>
        <p class="muted small" style="margin-bottom:10px">Tự thêm vào cuối mỗi file giọng đọc. <code>{domain}</code> = tên miền đang truy cập (<b>${esc(s.host)}</b>), được phiên âm để giọng đọc đọc đúng. Edge / CapCut do máy chủ thêm nên người dùng không gỡ được.</p>
        <div class="adm-actions" style="margin-bottom:10px">
          <label><input type="checkbox" id="wm-enabled" ${s.watermark.enabled ? 'checked' : ''}> Bật câu ghi nguồn</label>
          <label><input type="checkbox" id="wm-exempt" ${s.watermark.exemptPremium ? 'checked' : ''}> Không thêm cho gói Premium</label>
        </div>
        <label class="field"><span>Câu cho giọng tiếng Việt</span><input type="text" id="wm-vi" value="${esc(s.watermark.vi)}" maxlength="300"></label>
        <label class="field"><span>Câu cho giọng tiếng Anh / ngôn ngữ khác</span><input type="text" id="wm-en" value="${esc(s.watermark.en)}" maxlength="300"></label>
        <div class="wm-preview"><span class="muted small">Giọng đọc sẽ nói:</span><p id="wm-spoken">…</p>
          <button class="btn sm" type="button" id="wm-listen">▶ Nghe thử (Edge · HoaiMy)</button><audio id="wm-audio" hidden></audio></div>
      </div>
      <div class="card" style="margin-bottom:16px">
        <h4>⚡ Bán thêm lượt (chỉ gói Premium)</h4>
        <label style="margin-bottom:10px;display:inline-flex"><input type="checkbox" id="cr-enabled" ${s.credits.enabled ? 'checked' : ''}> Cho phép tài khoản Premium mua thêm lượt</label>
        <div class="field-group" style="margin-top:0;grid-template-columns:1fr 1fr 1fr">
          <label class="field"><span>Giá mỗi lượt (VND)</span><input type="number" id="cr-price" min="1" step="50" value="${s.credits.price}"></label>
          <label class="field"><span>Mua tối thiểu</span><input type="number" id="cr-min" min="1" step="10" value="${s.credits.min}"></label>
          <label class="field"><span>Mua tối đa</span><input type="number" id="cr-max" min="1" step="100" value="${s.credits.max}"></label>
        </div>
        <label class="field"><span>Gói gợi ý nhanh <em class="muted">số lượt, cách nhau bằng dấu phẩy</em></span><input type="text" id="cr-presets" value="${esc(s.credits.presets.join(', '))}"></label>
        <p class="muted small" id="cr-preview"></p>
      </div>
      <div class="card" style="margin-bottom:16px">
        <h4>Thông tin người bán (in trên hóa đơn)</h4>
        <div class="field-group" style="margin-top:0">
          <label class="field"><span>Tên người bán / công ty</span><input id="sl-name" value="${esc(s.seller.name || '')}" placeholder="TXA Voice"></label>
          <label class="field"><span>Mã số thuế</span><input id="sl-tax" value="${esc(s.seller.tax_code || '')}" placeholder="0101234567"></label>
        </div>
        <label class="field"><span>Địa chỉ</span><input id="sl-addr" value="${esc(s.seller.address || '')}"></label>
        <div class="field-group" style="margin-top:0">
          <label class="field"><span>Email liên hệ</span><input id="sl-email" value="${esc(s.seller.email || '')}"></label>
          <label class="field"><span>Số điện thoại</span><input id="sl-phone" value="${esc(s.seller.phone || '')}"></label>
        </div>
        <label class="field"><span>Ghi chú cuối hóa đơn</span><input id="sl-note" value="${esc(s.seller.note || '')}" placeholder="Hóa đơn bán hàng / biên nhận thanh toán điện tử…"></label>
      </div>
      <button class="btn primary" id="st-save">Lưu cài đặt</button>`;
    const crPrev = () => { const pr = Number($('#cr-price').value) || 0; $('#cr-preview').textContent = $('#cr-presets').value.split(/[,\s]+/).filter(Boolean).map(q => `${fmt(q)} lượt = ${money(q * pr)}`).join(' · '); };
    ['#cr-price', '#cr-presets'].forEach(sel => $(sel).addEventListener('input', crPrev)); crPrev();
    const wmRefresh = async () => {
      try {
        const r = await api('/api/tts-suffix?lang=vi');
        $('#wm-spoken').textContent = $('#wm-vi').value.replace(/\{domain\}/g, r.spoken).replace(/\bfile\b/gi, 'phai');
      } catch (e) { $('#wm-spoken').textContent = e.message; }
    };
    $('#wm-vi').addEventListener('input', wmRefresh); wmRefresh();
    $('#wm-listen').addEventListener('click', (e) => run(e.target, async () => {
      const res = await fetch('/api/edge/tts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Xin chào', voice: 'vi-VN-HoaiMyNeural' }) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Không tạo được giọng thử');
      const a = $('#wm-audio'); a.src = URL.createObjectURL(await res.blob()); a.play();
    }));
    $('#pk-add').addEventListener('click', () => {
      $('#pk-rows').insertAdjacentHTML('beforeend', pkgRow({ id: 'p' + ($('#pk-rows').children.length + 1), name: '', days: 30, price: 49000, active: true }));
      bindDel();
    });
    const bindDel = () => $$('#pk-rows [data-del]').forEach(b => { b.onclick = () => b.closest('tr').remove(); });
    bindDel();
    $('#st-save').addEventListener('click', (e) => run(e.target, async () => {
      const packages = $$('#pk-rows tr').map(tr => {
        const v = (k) => tr.querySelector(`[data-k="${k}"]`);
        return { id: v('id').value.trim(), name: v('name').value.trim(), days: Number(v('days').value), price: Number(v('price').value), active: v('active').checked };
      });
      const limits = Object.fromEntries($$('tr[data-plan]').map(tr => [tr.dataset.plan, {
        ttsCalls: Number(tr.querySelector('[data-k="ttsCalls"]').value), maxChars: Number(tr.querySelector('[data-k="maxChars"]').value)
      }]));
      const seller = { name: $('#sl-name').value, tax_code: $('#sl-tax').value, address: $('#sl-addr').value, email: $('#sl-email').value, phone: $('#sl-phone').value, note: $('#sl-note').value };
      const credits = { enabled: $('#cr-enabled').checked, price: Number($('#cr-price').value), min: Number($('#cr-min').value), max: Number($('#cr-max').value), presets: $('#cr-presets').value };
      const watermark = { enabled: $('#wm-enabled').checked, exemptPremium: $('#wm-exempt').checked, vi: $('#wm-vi').value, en: $('#wm-en').value };
      const r = await post('/api/admin/settings', { packages, limits, globalDaily: Number($('#st-global').value), seller, credits, watermark });
      await vkAccount.load();
      settings();
      return r;
    }));
  }

  /* ---------------- Mẫu email: Studio ---------------- */
  let quill = null, lastField = null, previewTimer = 0, tplId = null, pvMode = 'desktop', snap = '', brandOpen = false, edTab = 'content', lastPreview = null;
  const EM = { list: [], brand: null, brandDefaults: null, q: '', vars: [], defaultIcon: '✉️', meta: null };
  async function loadQuill() {
    if (window.Quill) return window.Quill;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
    document.head.appendChild(css);
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return window.Quill;
  }
  const askUnsaved = () => (window.customConfirm
    ? window.customConfirm('Mẫu này có thay đổi chưa lưu. Rời đi sẽ mất các thay đổi đó.', 'Thay đổi chưa lưu', 'Rời đi', 'Ở lại')
    : confirm('Mẫu này có thay đổi chưa lưu. Rời đi sẽ mất các thay đổi đó.'));
  const dirty = () => !!quill && JSON.stringify(state()) !== snap;
  function markDirty() {
    const d = dirty();
    $('#tpl-dirty')?.classList.toggle('on', d);
    const save = $('#tpl-save'); if (save) save.textContent = d ? 'Lưu mẫu ●' : 'Lưu mẫu';
    if ($('#tpl-undo')) $('#tpl-undo').disabled = !d;
  }

  /* ----- Ô chọn dạng "chip", dùng cho cả giao diện chung và từng mẫu ----- */
  const chips = (key, opts, val) => `<div class="opt-chips" data-b="${key}">${opts.map(([v, label, style]) => `<button type="button" class="opt ${String(val) === String(v) ? 'on' : ''}" data-v="${v}" ${style ? `style="${style}"` : ''}>${label}</button>`).join('')}</div>`;
  const toggle = (key, label, on) => `<label class="es-toggle"><input type="checkbox" data-b="${key}" ${on ? 'checked' : ''}><span class="sw"></span><span>${label}</span></label>`;
  const brandVal = () => {
    const o = { social: {} };
    $$('#brand-panel [data-b]').forEach(el => {
      const k = el.dataset.b;
      o[k] = el.classList.contains('opt-chips') ? el.querySelector('.on')?.dataset.v : el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    });
    $$('#brand-panel [data-s]').forEach(i => { o.social[i.dataset.s] = i.value.trim(); });
    return o;
  };
  const styleVal = () => ({
    icon: $('#st-icon')?.value.trim() || '', accent: $('#st-own')?.checked ? $('#st-accent').value : '',
    banner: $('#st-banner')?.value.trim() || '', hideIcon: !!$('#st-hide')?.checked
  });
  const samplesVal = () => { const o = {}; $$('#tpl-editor [data-sv]').forEach(i => { o[i.dataset.sv] = i.value; }); return o; };
  function draft() {
    const o = { body: quill ? quill.root.innerHTML : '' };
    $$('#tpl-editor [data-f]').forEach(i => { o[i.dataset.f] = i.value; });
    return o;
  }
  const state = () => ({ ...draft(), style: styleVal() });

  /* ----- Danh sách mẫu bên trái ----- */
  function listHtml() {
    const q = EM.q.trim().toLowerCase();
    const items = EM.list.filter(t => !q || (t.name + ' ' + t.description).toLowerCase().includes(q));
    if (!items.length) return '<p class="muted small" style="padding:8px 4px">Không có mẫu nào khớp.</p>';
    const groups = [...new Set(items.map(t => t.group))];
    return groups.map(g => `<div class="tpl-group"><span>${esc(g)}</span>${items.filter(t => t.group === g).map(t => `
      <button class="tpl-item ${t.id === tplId ? 'active' : ''}" data-tpl="${t.id}">
        <span class="tpl-ico">${t.icon}</span><span><b>${esc(t.name)}</b><small>${t.customized ? '<i class="dot on"></i>Đã chỉnh sửa' : '<i class="dot"></i>Mặc định'}</small></span></button>`).join('')}</div>`).join('');
  }
  function bindList() {
    $$('#adm-body [data-tpl]').forEach(b => b.addEventListener('click', async () => {
      if (b.dataset.tpl === tplId) return;
      if (dirty() && !(await askUnsaved())) return;
      email(b.dataset.tpl, true);
    }));
  }

  const SWATCHES = [['#6d5dfc', '#0ea5c6', 'Tím xanh'], ['#2563eb', '#06b6d4', 'Xanh dương'], ['#059669', '#84cc16', 'Xanh lá'], ['#ea580c', '#f59e0b', 'Cam'], ['#e11d48', '#f97316', 'Hồng đỏ'], ['#7c3aed', '#ec4899', 'Tím hồng'], ['#0f172a', '#6366f1', 'Đen']];
  const SNIPPETS = [
    ['👋 Lời chào', '<p>Chào {{name}},</p>'],
    ['✅ Danh sách', '<ul><li>Ý thứ nhất</li><li>Ý thứ hai</li><li>Ý thứ ba</li></ul>'],
    ['💬 Hộp lưu ý', '<blockquote>Nội dung cần người đọc để ý…</blockquote>'],
    ['🔒 Bảo mật', '<p><strong>Lưu ý bảo mật:</strong> chúng tôi không bao giờ hỏi mật khẩu của bạn qua email.</p>'],
    ['🙏 Cảm ơn', '<p>Cảm ơn bạn đã đồng hành cùng {{app_name}}!</p>'],
    ['🛟 Hỗ trợ', '<p>Cần giúp đỡ? Hãy liên hệ đội ngũ {{app_name}}, chúng tôi luôn sẵn sàng.</p>']
  ];
  const EMOJIS = ['✉️', '🎉', '🔐', '🧾', '⭐', '⏳', '💤', '🎁', '🚀', '💎', '🛡️', '👋', '📣', '🔔', '✅', '⚠️'];

  function brandPanelHtml(b) {
    return `
      <div class="tpl-head"><div><h4 style="margin:0">🎨 Giao diện chung của email</h4><span class="muted small">Áp dụng cho mọi mẫu. Xem trước bên phải cập nhật ngay khi bạn chỉnh.</span></div>
        <button class="icon-btn sm" id="brand-close" title="Đóng">✕</button></div>
      <div class="bp-grid">
        <section><h5>Màu sắc</h5>
          <div class="brand-swatches">${SWATCHES.map(([a, c, n]) => `<button type="button" class="swatch" data-sw="${a},${c}" title="${n}" style="background:linear-gradient(135deg,${a},${c})"></button>`).join('')}</div>
          <div class="field-group" style="margin-top:8px"><label class="field"><span>Màu chủ đạo</span><input type="color" data-b="color" value="${b.color}"></label>
            <label class="field"><span>Màu phụ</span><input type="color" data-b="color2" value="${b.color2}"></label></div></section>
        <section><h5>Logo</h5>
          <div class="field-group" style="margin-top:0"><label class="field" style="max-width:110px"><span>Chữ logo</span><input type="text" data-b="logo" value="${esc(b.logo)}" maxlength="4"></label>
            <label class="field"><span>Hoặc ảnh logo <em class="muted">https, cao 40px</em></span><input type="url" data-b="logoUrl" value="${esc(b.logoUrl)}" placeholder="https://…/logo.png"></label></div></section>
        <section><h5>Phông chữ</h5>
          ${chips('font', [['modern', 'Aa Hiện đại', "font-family:'Segoe UI',Roboto,sans-serif"], ['classic', 'Aa Cổ điển', 'font-family:Georgia,serif'], ['friendly', 'Aa Thân thiện', 'font-family:Verdana,sans-serif'], ['tech', 'Aa Kỹ thuật', 'font-family:Consolas,monospace']], b.font)}</section>
        <section><h5>Hình dạng</h5>
          <label class="field range"><span>Bo góc thẻ thư <b id="b-radius-val">${b.radius}px</b></span><input type="range" data-b="radius" min="0" max="32" step="1" value="${b.radius}"></label>
          <div class="es-sub">Nút bấm</div>${chips('btnStyle', [['gradient', 'Chuyển màu'], ['solid', 'Màu đặc'], ['outline', 'Viền']], b.btnStyle)}
          <div class="es-sub">Góc nút</div>${chips('btnShape', [['pill', 'Viên thuốc'], ['round', 'Bo góc'], ['square', 'Vuông']], b.btnShape)}
          <div class="es-sub">Biểu tượng đầu thư</div>${chips('iconStyle', [['soft', 'Bo vuông'], ['circle', 'Tròn'], ['none', 'Ẩn']], b.iconStyle)}</section>
        <section><h5>Bố cục</h5>
          <div class="es-sub">Căn chỉnh</div>${chips('align', [['left', 'Căn trái'], ['center', 'Căn giữa']], b.align)}
          <div class="es-sub">Nền trang</div>${chips('bg', [['tint', 'Nhẹ nhàng'], ['plain', 'Trắng'], ['dark', 'Tối']], b.bg)}
          <div class="es-toggles">${toggle('accentBar', 'Thanh màu trên đầu thẻ', b.accentBar)}${toggle('fallback', 'Hiện liên kết dự phòng dưới nút', b.fallback)}</div></section>
        <section><h5>Chân thư</h5>
          <label class="field"><span>Khẩu hiệu</span><input type="text" data-b="tagline" value="${esc(b.tagline)}" maxlength="60"></label>
          <label class="field"><span>Dòng thêm <em class="muted">địa chỉ, số điện thoại…</em></span><input type="text" data-b="footer" value="${esc(b.footer)}" maxlength="200"></label>
          <label class="field"><span>Email hỗ trợ</span><input type="email" data-b="support" value="${esc(b.support)}" maxlength="120" placeholder="support@ten-mien.com"></label>
          <div class="es-sub">Mạng xã hội <em class="muted">chỉ nhận liên kết https</em></div>
          <div class="soc-grid">${[['website', 'Website'], ['facebook', 'Facebook'], ['zalo', 'Zalo'], ['youtube', 'YouTube'], ['tiktok', 'TikTok']].map(([k, n]) => `<input type="url" data-s="${k}" value="${esc(b.social?.[k] || '')}" placeholder="${n}">`).join('')}</div></section>
      </div>
      <div class="modal-foot spread"><button class="btn sm" id="brand-reset">Về mặc định</button><button class="btn primary" id="brand-save">Lưu giao diện chung</button></div>`;
  }

  /* ----- Màn hình chính ----- */
  async function email(id, skipCheck) {
    if (!skipCheck && dirty() && !(await askUnsaved())) return;
    loading();
    let res;
    try { res = await api('/api/admin/email-templates'); } catch (e) { body().innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    EM.list = res.templates; EM.brand = res.brand; EM.brandDefaults = res.brandDefaults;
    tplId = id || tplId || EM.list[0].id;
    body().innerHTML = `<div class="es">
      <div class="es-bar"><div><h3>✉️ Studio email</h3><span class="muted small">Soạn nội dung, chọn giao diện và xem trước đúng như người nhận thấy.</span></div>
        <div class="adm-actions"><button class="btn sm ${brandOpen ? 'primary' : ''}" id="brand-toggle">🎨 Giao diện chung</button></div></div>
      <div class="es-grid">
        <aside class="es-rail">
          <input type="search" class="tpl-search" id="tpl-q" placeholder="🔍 Tìm mẫu email…" value="${esc(EM.q)}" autocomplete="off">
          <div id="tpl-groups">${listHtml()}</div>
          <div class="tpl-tool static" id="auto-box"><span class="tpl-ico">⏰</span><span><b>Nhắc hạn tự động</b><small>Mỗi ngày 9h sáng gửi mail cho Premium sắp / đã hết hạn.</small></span>
            <div class="adm-actions" style="margin-top:8px"><button class="btn sm" id="rm-dry">Xem ai sẽ nhận</button><button class="btn sm" id="rm-run">Gửi ngay</button></div>
            <div class="muted small" id="rm-result" hidden></div></div>
        </aside>
        <div class="es-main">
          <div class="card tpl-brand" id="brand-panel" ${brandOpen ? '' : 'hidden'}>${brandPanelHtml(EM.brand)}</div>
          <div class="card tpl-editor" id="tpl-editor"><div class="pay-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div></div></div>
        </div>
        <div class="card es-preview">
          <div class="es-pv-head"><b>Xem trước</b><span class="chart-switch" id="pv-modes"><button data-pv="desktop" class="${pvMode === 'desktop' ? 'active' : ''}">Máy tính</button><button data-pv="mobile" class="${pvMode === 'mobile' ? 'active' : ''}">Điện thoại</button><button data-pv="text" class="${pvMode === 'text' ? 'active' : ''}">Văn bản</button></span></div>
          <div class="inbox" id="pv-inbox"><span class="inbox-av">T</span><div class="inbox-body"><div class="inbox-top"><b>TXA Voice</b><span>9:15</span></div><div class="inbox-subj" id="pv-subj">…</div><div class="inbox-pre" id="pv-pre"></div></div></div>
          <div class="pv-stage ${pvMode}" id="pv-stage">
            <div class="dev-frame"><div class="dev-top"><i></i><i></i><i></i><span id="pv-url">thư đến</span></div><div class="pv-frame-wrap" id="pv-wrap"><iframe id="pv-frame" title="Xem trước email"></iframe></div></div>
            <pre class="pv-text" id="pv-text"></pre>
          </div>
          <div class="es-pv-foot"><button class="btn sm" id="pv-open">↗ Mở tab mới</button><button class="btn sm" id="pv-copy">⧉ Chép HTML</button></div>
        </div>
      </div></div>`;

    $('#tpl-q').addEventListener('input', (e) => { EM.q = e.target.value; $('#tpl-groups').innerHTML = listHtml(); bindList(); });
    bindList();
    const applyMode = () => {
      $$('#pv-modes [data-pv]').forEach(x => x.classList.toggle('active', x.dataset.pv === pvMode));
      $('#pv-stage').className = 'pv-stage ' + pvMode;
    };
    applyMode();
    $$('#pv-modes [data-pv]').forEach(btn => btn.addEventListener('click', () => { pvMode = btn.dataset.pv; applyMode(); }));
    $('#pv-open').addEventListener('click', () => { if (!lastPreview) return; const w = window.open(URL.createObjectURL(new Blob([lastPreview.html], { type: 'text/html' })), '_blank'); if (!w) toast('Trình duyệt chặn cửa sổ mới.', 'err'); });
    $('#pv-copy').addEventListener('click', async () => { if (!lastPreview) return; try { await navigator.clipboard.writeText(lastPreview.html); toast('Đã chép mã HTML của email.', 'ok'); } catch { toast('Không chép được.', 'err'); } });

    /* Giao diện chung */
    const setBrandOpen = (v) => { brandOpen = v; $('#brand-panel').hidden = !v; $('#brand-toggle').classList.toggle('primary', v); if (v) $('#brand-panel').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    $('#brand-toggle').addEventListener('click', () => setBrandOpen(!brandOpen));
    const bindBrand = () => {
      $('#brand-close').addEventListener('click', () => setBrandOpen(false));
      $$('#brand-panel input').forEach(i => i.addEventListener('input', () => { if (i.dataset.b === 'radius') $('#b-radius-val').textContent = i.value + 'px'; schedulePreview(); }));
      $$('#brand-panel .opt-chips').forEach(g => g.addEventListener('click', (e) => {
        const o = e.target.closest('.opt'); if (!o) return;
        g.querySelectorAll('.opt').forEach(x => x.classList.toggle('on', x === o)); schedulePreview();
      }));
      $$('#brand-panel [data-sw]').forEach(s => s.addEventListener('click', () => {
        const [a, c] = s.dataset.sw.split(',');
        $('#brand-panel [data-b=color]').value = a; $('#brand-panel [data-b=color2]').value = c; schedulePreview();
      }));
      $('#brand-reset').addEventListener('click', () => { $('#brand-panel').innerHTML = brandPanelHtml(EM.brandDefaults); bindBrand(); schedulePreview(); });
      $('#brand-save').addEventListener('click', (e) => run(e.target, async () => {
        const r = await post('/api/admin/settings', { emailBrand: brandVal() });
        EM.brand = brandVal(); return r;
      }));
    };
    bindBrand();

    /* Nhắc hạn tự động */
    const showReminders = (r) => {
      const box = $('#rm-result'); box.hidden = false;
      if (r.skipped) { box.textContent = '⚠ ' + r.skipped; return; }
      const n = r.expiring.length + r.expired.length;
      box.innerHTML = (r.sent || r.failed) ? `Đã gửi ${r.sent}${r.failed ? `, lỗi ${r.failed}` : ''}.`
        : n ? `<b>${r.expiring.length}</b> sắp hết hạn, <b>${r.expired.length}</b> đã hết hạn:<br>${[...r.expiring, ...r.expired].slice(0, 6).map(x => `${esc(x.email)} · ${esc(x.expires)}`).join('<br>')}${n > 6 ? `<br>…và ${n - 6} người nữa` : ''}` : 'Hôm nay chưa có ai cần nhắc.';
    };
    $('#rm-dry').addEventListener('click', (e) => run(e.target, async () => { showReminders(await post('/api/admin/reminders/run', { dry: true })); }));
    $('#rm-run').addEventListener('click', (e) => run(e.target, async () => {
      const ok = await (window.customConfirm ? window.customConfirm('Gửi ngay email nhắc hạn cho những tài khoản Premium sắp / đã hết hạn? Mỗi người chỉ nhận một lần cho mỗi kỳ hạn.', 'Gửi nhắc hạn') : confirm('Gửi nhắc hạn ngay?'));
      if (!ok) return;
      showReminders(await post('/api/admin/reminders/run', { dry: false }));
    }));

    /* Trình soạn mẫu */
    let d;
    try { d = await api(`/api/admin/email-templates/${tplId}`); } catch (e) { $('#tpl-editor').textContent = e.message; return; }
    const t = d.template, st = d.style, meta = EM.list.find(x => x.id === tplId);
    EM.vars = d.variables; EM.defaultIcon = meta.icon; EM.meta = meta;
    const when = d.updatedAt ? new Date(d.updatedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '';
    $('#tpl-editor').innerHTML = `
      <div class="ed-head"><span class="ed-ico" id="ed-ico">${esc(st.icon || meta.icon)}</span>
        <div class="ed-title"><h4>${esc(meta.name)} <span class="tpl-dirty" id="tpl-dirty">● Chưa lưu</span></h4><span class="muted small">${esc(meta.description)}</span></div>
        <span class="tag ${d.customized ? 'pro' : ''}">${d.customized ? 'Đã chỉnh sửa' : 'Mẫu mặc định'}</span></div>
      ${d.customized && d.updatedBy ? `<div class="ed-meta muted small">Sửa lần cuối ${esc(when)} bởi ${esc(d.updatedBy)}</div>` : ''}
      <div class="ed-tabs" id="ed-tabs">${[['content', '✏️ Nội dung'], ['look', '🎛️ Giao diện'], ['data', '🧪 Dữ liệu'], ['code', '&lt;/&gt; HTML']].map(([k, n]) => `<button type="button" data-et="${k}" class="${edTab === k ? 'on' : ''}">${n}</button>`).join('')}</div>

      <div class="ed-pane" data-pane="content">
        <label class="field"><span>Tiêu đề email <em class="muted counter" id="cnt-subject"></em></span><input type="text" data-f="subject" value="${esc(t.subject)}"></label>
        <label class="field"><span>Dòng xem trước <em class="muted">hiện cạnh tiêu đề trong hộp thư</em> <em class="muted counter" id="cnt-preheader"></em></span><input type="text" data-f="preheader" value="${esc(t.preheader)}"></label>
        <label class="field"><span>Tiêu đề lớn trong thư</span><input type="text" data-f="heading" value="${esc(t.heading)}"></label>
        <div class="field"><span>Nội dung</span>
          <div class="snip-row">${SNIPPETS.map(([n], i) => `<button type="button" class="chip" data-snip="${i}">${n}</button>`).join('')}</div>
          <div class="quill-box"><div id="tpl-quill"></div></div></div>
        <div class="field-group" style="margin-top:0;grid-template-columns:1fr 1.4fr">
          <label class="field"><span>Chữ trên nút <em class="muted">để trống = ẩn nút</em></span><input type="text" data-f="button_text" value="${esc(t.button_text)}"></label>
          <label class="field"><span>Liên kết của nút</span><input type="text" data-f="button_url" value="${esc(t.button_url)}"></label>
        </div>
        <label class="field"><span>Ghi chú cuối thư <em class="muted">để trống nếu không cần</em></span><input type="text" data-f="note" value="${esc(t.note)}"></label>
        <div class="field"><span>Biến <em class="muted">bấm để chèn vào ô đang chọn</em></span>
          <div class="var-chips">${d.variables.map(v => `<button type="button" class="var-chip ${v.block ? 'block' : ''}" data-var="${v.key}" title="${esc(v.desc)}">{{${v.key}}}</button>`).join('')}</div></div>
      </div>

      <div class="ed-pane" data-pane="look" hidden>
        <p class="muted small" style="margin:0 0 12px">Chỉnh riêng cho mẫu này. Phông chữ, bo góc, kiểu nút, màu chung… nằm ở nút <b>🎨 Giao diện chung</b> phía trên.</p>
        <div class="field"><span>Biểu tượng đầu thư <em class="muted">mặc định ${esc(meta.icon)}</em></span>
          <div class="field-group" style="margin-top:6px;grid-template-columns:90px 1fr"><input type="text" id="st-icon" value="${esc(st.icon)}" maxlength="4" placeholder="${esc(meta.icon)}" style="text-align:center;font-size:20px">
            <div class="emoji-row">${EMOJIS.map(e => `<button type="button" class="emoji" data-emoji="${e}">${e}</button>`).join('')}<button type="button" class="emoji reset" data-emoji="" title="Về mặc định">↺</button></div></div></div>
        <div class="field"><span>Màu nhấn riêng</span>
          <div class="own-accent">${toggle('own', 'Dùng màu riêng cho mẫu này', !!st.accent).replace('data-b="own"', 'id="st-own"')}<input type="color" id="st-accent" value="${st.accent || EM.brand.color}"></div></div>
        <label class="field"><span>Ảnh banner đầu thư <em class="muted">https, rộng 580px là đẹp nhất</em></span><input type="url" id="st-banner" value="${esc(st.banner)}" placeholder="https://…/banner.jpg"></label>
        <div class="es-toggles">${toggle('hide', 'Ẩn biểu tượng đầu thư của mẫu này', st.hideIcon).replace('data-b="hide"', 'id="st-hide"')}</div>
      </div>

      <div class="ed-pane" data-pane="data" hidden>
        <p class="muted small" style="margin:0 0 12px">Giá trị giả dùng để xem trước và gửi thử. Chỉ ảnh hưởng bản xem trước, không lưu vào mẫu.</p>
        <div class="sv-grid">${d.variables.filter(v => !v.block).map(v => `<label class="field"><span>${esc(v.key)} <em class="muted">${esc(v.desc)}</em></span><input type="text" data-sv="${esc(v.key)}" value="${esc(v.sample)}" maxlength="300"></label>`).join('')}</div>
        <button class="btn sm" id="sv-reset">↺ Về dữ liệu mẫu gốc</button>
      </div>

      <div class="ed-pane" data-pane="code" hidden>
        <p class="muted small" style="margin:0 0 10px">HTML của phần nội dung. Sửa trực tiếp rồi bấm <b>Áp dụng vào trình soạn</b>. Chỉ giữ thẻ an toàn (đoạn, tiêu đề, danh sách, liên kết, trích dẫn, in đậm / nghiêng).</p>
        <textarea id="src-code" class="src-code" spellcheck="false" rows="14"></textarea>
        <div class="adm-actions" style="margin-top:8px"><button class="btn sm" id="src-pull">↻ Lấy từ trình soạn</button><button class="btn sm primary" id="src-apply">Áp dụng vào trình soạn</button></div>
      </div>

      <div class="es-actions">
        <div class="tpl-test"><input type="email" id="tpl-to" placeholder="Gửi thử tới email khác (trống = email của bạn)" autocomplete="off"><button class="btn sm" id="tpl-test">✉ Gửi thử</button></div>
        <div class="es-actions-r">${d.customized ? '<button class="btn sm danger" id="tpl-reset">Khôi phục</button>' : ''}<button class="btn sm" id="tpl-undo" disabled>↶ Hoàn tác</button><button class="btn primary" id="tpl-save" title="Ctrl + S">Lưu mẫu</button></div>
      </div>`;

    const Q = await loadQuill();
    quill = new Q('#tpl-quill', {
      theme: 'snow', placeholder: 'Nội dung email…',
      modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ color: [] }], [{ list: 'ordered' }, { list: 'bullet' }], [{ align: [] }], ['link', 'blockquote'], ['clean']] }
    });
    quill.clipboard.dangerouslyPasteHTML(t.body || '');
    lastField = 'quill';
    quill.on('selection-change', (r) => { if (r) lastField = 'quill'; });
    const changed = () => { counters(); markDirty(); schedulePreview(); };
    quill.on('text-change', (_, __, src) => { if (src === 'user') changed(); else schedulePreview(); });
    $$('#tpl-editor [data-f]').forEach(i => { i.addEventListener('focus', () => { lastField = i; }); i.addEventListener('input', changed); });
    $$('#tpl-editor [data-var]').forEach(btn => btn.addEventListener('mousedown', (e) => e.preventDefault()));
    $$('#tpl-editor [data-var]').forEach(btn => btn.addEventListener('click', () => { insertVar(`{{${btn.dataset.var}}}`); changed(); }));
    $$('#tpl-editor [data-snip]').forEach(btn => {
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => {
        const r = quill.getSelection(true) || { index: quill.getLength() };
        quill.clipboard.dangerouslyPasteHTML(r.index, SNIPPETS[Number(btn.dataset.snip)][1], 'user');
        changed();
      });
    });

    // Tab trong trình soạn
    const showTab = (k) => {
      edTab = k;
      $$('#ed-tabs [data-et]').forEach(b => b.classList.toggle('on', b.dataset.et === k));
      $$('#tpl-editor .ed-pane').forEach(p => { p.hidden = p.dataset.pane !== k; });
      if (k === 'code') $('#src-code').value = quill.root.innerHTML.replace(/></g, '>\n<');
    };
    $$('#ed-tabs [data-et]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.et)));
    showTab(edTab);
    $('#src-pull').addEventListener('click', () => { $('#src-code').value = quill.root.innerHTML.replace(/></g, '>\n<'); });
    $('#src-apply').addEventListener('click', () => { quill.clipboard.dangerouslyPasteHTML($('#src-code').value.trim(), 'user'); changed(); toast('Đã áp dụng mã HTML vào trình soạn.', 'ok'); });

    // Giao diện riêng của mẫu
    const styleChanged = () => { $('#ed-ico').textContent = $('#st-icon').value.trim() || meta.icon; markDirty(); schedulePreview(); };
    $('#st-icon').addEventListener('input', styleChanged);
    $$('#tpl-editor [data-emoji]').forEach(b => b.addEventListener('click', () => { $('#st-icon').value = b.dataset.emoji; styleChanged(); }));
    ['#st-own', '#st-accent', '#st-banner', '#st-hide'].forEach(sel => { $(sel).addEventListener('input', styleChanged); $(sel).addEventListener('change', styleChanged); });
    $$('#tpl-editor [data-sv]').forEach(i => i.addEventListener('input', schedulePreview));
    $('#sv-reset').addEventListener('click', () => { EM.vars.forEach(v => { const i = $(`#tpl-editor [data-sv="${v.key}"]`); if (i) i.value = v.sample; }); schedulePreview(); });

    snap = JSON.stringify(state());
    counters(); markDirty();

    const save = (btn) => run(btn, async () => { const r = await post(`/api/admin/email-templates/${tplId}`, state()); snap = JSON.stringify(state()); await email(tplId, true); return r; });
    $('#tpl-save').addEventListener('click', (e) => save(e.target));
    $('#tpl-undo').addEventListener('click', async () => { if (await (window.customConfirm ? window.customConfirm('Bỏ mọi thay đổi chưa lưu và quay về bản đã lưu?', 'Hoàn tác') : confirm('Hoàn tác?'))) email(tplId, true); });
    $('#tpl-test').addEventListener('click', (e) => run(e.target, () => post(`/api/admin/email-templates/${tplId}/test`, { ...state(), brand: brandVal(), vars: samplesVal(), to: $('#tpl-to').value.trim() })));
    $('#tpl-reset')?.addEventListener('click', (e) => {
      run(e.target, async () => {
        const ok = await (window.customConfirm ? window.customConfirm('Khôi phục mẫu gốc? Nội dung và giao diện riêng của mẫu này đã sửa sẽ mất.', 'Khôi phục mẫu email') : confirm('Khôi phục mẫu gốc?'));
        if (!ok) return;
        const r = await post(`/api/admin/email-templates/${tplId}/reset`);
        email(tplId, true);
        return r;
      });
    });
    preview();
  }
  // Ctrl + S để lưu mẫu đang mở (chỉ khi đang ở tab Email)
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && $('#tpl-save') && $('#tpl-save').offsetParent) { e.preventDefault(); $('#tpl-save').click(); }
  });
  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  function counters() {
    const c = (id, n, ideal) => { const el = $(id); if (el) { el.textContent = `${n}/${ideal}`; el.classList.toggle('warn', n > ideal); } };
    c('#cnt-subject', ($('#tpl-editor [data-f=subject]')?.value || '').length, 60);
    c('#cnt-preheader', ($('#tpl-editor [data-f=preheader]')?.value || '').length, 100);
  }
  function insertVar(token) {
    if (lastField === 'quill' && quill) {
      const r = quill.getSelection(true) || { index: quill.getLength() };
      quill.insertText(r.index, token, 'user');
      quill.setSelection(r.index + token.length, 0);
    } else if (lastField) {
      const i = lastField, st = i.selectionStart ?? i.value.length, en = i.selectionEnd ?? st;
      i.value = i.value.slice(0, st) + token + i.value.slice(en);
      i.focus(); i.setSelectionRange(st + token.length, st + token.length);
    }
  }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 450); }
  async function preview() {
    if (!$('#pv-subj')) return;
    try {
      const r = await post(`/api/admin/email-templates/${tplId}/preview`, { ...state(), brand: brandVal(), vars: samplesVal() });
      lastPreview = r;
      $('#pv-subj').textContent = r.subject; $('#pv-pre').textContent = r.preheader;
      $('#pv-frame').srcdoc = r.html;
      $('#pv-text').textContent = r.text;
    } catch (e) { $('#pv-subj').textContent = e.message; }
  }

  /* ---------------- Hệ thống ---------------- */
  async function system() {
    loading();
    let s;
    try { s = await api('/api/admin/settings'); } catch (e) { body().innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    body().innerHTML = `
      <div class="adm-grid-2">
        <div class="card"><h4>Cổng thanh toán payOS</h4>
          <p class="small">Trạng thái: ${s.payos ? '<span class="tag ok">Đã cấu hình</span>' : '<span class="tag warn">Chưa cấu hình PAYOS_* cho Worker</span>'}</p>
          <p class="muted small" style="margin:10px 0">Không cần webhook vẫn chạy: khi khách thanh toán, trang chờ tự hỏi payOS và kích hoạt Premium. Webhook giúp kích hoạt cả khi khách đã đóng trang.</p>
          <div class="field"><span>Webhook URL</span><div class="url-row"><input type="text" readonly value="${esc(s.webhookUrl)}"><button class="btn sm" id="sy-copy">Chép</button></div></div>
          <p class="small" style="color:#fbbf24;margin-bottom:10px">⚠ Mỗi kênh thanh toán payOS chỉ có 1 webhook. Nếu kênh này đang dùng chung với web khác (vd. project PAYOS tự đăng ký tunnel), đăng ký ở đây sẽ thay webhook của web kia.</p>
          <div class="adm-actions"><button class="btn sm primary" id="sy-webhook" ${s.payos ? '' : 'disabled'}>Đăng ký webhook với payOS</button>
            <a class="btn sm" href="https://my.payos.vn" target="_blank" rel="noopener">Mở my.payos.vn ↗</a></div>
        </div>
        <div class="card"><h4>Email (SMTP)</h4>
          <p class="small">Trạng thái: ${s.smtp ? '<span class="tag ok">Đã cấu hình</span>' : '<span class="tag warn">Chưa cấu hình</span>'}</p>
          <p class="muted small" style="margin:10px 0">Dùng cho email xác minh, quên mật khẩu, biên lai thanh toán và thông báo đổi gói.</p>
          <button class="btn sm" id="sy-mail" ${s.smtp ? '' : 'disabled'}>Gửi email thử tới ${esc(s.adminEmail)}</button>
        </div>
      </div>
      <div class="card" style="margin-top:16px"><h4>Giao diện theo mùa</h4>
        <p class="muted small" style="margin-bottom:10px">Tự động đổi theo ngày lễ (Halloween, 20/11, Giáng sinh, Năm mới, Tết Âm lịch, 14/2, 8/3, 30/4, 1/6, 2/9, Trung thu). Có thể ép một chủ đề hoặc tắt hẳn.</p>
        <div class="adm-actions"><select id="sy-theme">${THEME_OPTS.map(([v, l]) => `<option value="${v}" ${s.theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
          <button class="btn sm primary" id="sy-theme-save">Lưu</button><a class="btn sm" id="sy-theme-preview" target="_blank" rel="noopener">Xem thử ↗</a></div>
      </div>`;
    const prev = () => { const v = $('#sy-theme').value; $('#sy-theme-preview').href = '/?theme=' + (v === 'auto' ? '' : v); };
    prev(); $('#sy-theme').addEventListener('change', prev);
    $('#sy-theme-save').addEventListener('click', (e) => run(e.target, async () => { const r = await post('/api/admin/settings', { theme: $('#sy-theme').value }); vkTheme.apply($('#sy-theme').value); return r; }));
    $('#sy-copy').addEventListener('click', () => navigator.clipboard.writeText(s.webhookUrl).then(() => toast('Đã chép.', 'ok')));
    $('#sy-webhook').addEventListener('click', (e) => {
      run(e.target, async () => {
        const ok = await (window.customConfirm ? window.customConfirm('Đăng ký webhook của kênh payOS về TXA Voice?', 'Đăng ký Webhook') : confirm('Đăng ký webhook của kênh payOS về TXA Voice?'));
        if (!ok) return;
        return post('/api/admin/payos/webhook');
      });
    });
    $('#sy-mail').addEventListener('click', (e) => run(e.target, () => post('/api/admin/test-email')));
  }

  /* ---------------- Nhật ký ---------------- */
  async function logs(page = 0) {
    loading();
    let r;
    try { r = await api(`/api/admin/logs?page=${page}`); } catch (e) { body().innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    const label = {
      'user.plan': 'Đổi gói', 'user.verify': 'Xác minh email', 'user.resend_verify': 'Gửi lại mail xác minh', 'user.reset_password': 'Gửi mail đặt lại MK',
      'user.ban': 'Khóa tài khoản', 'user.unban': 'Mở khóa', 'user.logout_all': 'Đăng xuất mọi thiết bị', 'user.reset_usage': 'Làm mới lượt', 'user.role': 'Đổi quyền',
      'user.rename': 'Đổi tên', 'user.delete': 'Xóa tài khoản', 'order.sync': 'Đối soát đơn', 'order.mark_paid': 'Kích hoạt tay', 'order.cancel': 'Hủy đơn',
      'settings.update': 'Sửa cài đặt', 'payos.webhook': 'Đăng ký webhook', 'email.save': 'Sửa mẫu email', 'email.reset': 'Khôi phục mẫu email', 'order.invoice': 'Cập nhật hóa đơn', 'user.create': 'Tạo tài khoản', 'user.update': 'Sửa tài khoản', 'order.create': 'Tạo đơn thủ công', 'order.update': 'Sửa đơn', 'order.delete': 'Xóa đơn', 'user.bulk.add_credits': 'Hàng loạt: cộng / trừ lượt'
    };
    body().innerHTML = `<div class="card">
      ${r.logs.map(l => `<div class="log-row"><span class="muted">${dt(l.created_at)}</span><span>${esc(l.admin_email)}</span>
        <span><b>${esc(label[l.action] || (l.action.includes('.bulk.') ? 'Hàng loạt: ' + l.action.split('.bulk.')[1] : l.action))}</b> ${l.target ? '· ' + esc(l.target) : ''}${l.detail ? `<br><code>${esc(l.detail)}</code>` : ''}</span></div>`).join('') || '<span class="muted">Chưa có thao tác nào.</span>'}
      <div class="pager"><span>Trang ${page + 1}</span><span>
        <button class="btn sm" ${page <= 0 ? 'disabled' : ''} id="lg-prev">← Mới hơn</button>
        <button class="btn sm" ${r.logs.length < 50 ? 'disabled' : ''} id="lg-next">Cũ hơn →</button></span></div></div>`;
    $('#lg-prev').addEventListener('click', () => logs(page - 1));
    $('#lg-next').addEventListener('click', () => logs(page + 1));
  }

  return { open };
})();
