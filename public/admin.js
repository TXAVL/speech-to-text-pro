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
      if (v === 'delete') { const c = prompt(`Xóa vĩnh viễn ${ids.length} tài khoản cùng lượt dùng và đơn hàng. Nhập XOA để xác nhận:`); if (c === null) return; payload.confirm = c.trim(); }
      else if (!confirm(`Áp dụng "${$('#ub-action').selectedOptions[0].textContent}" cho ${ids.length} tài khoản?`)) return;
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
    try { d = await api(`/api/admin/users/${id}`); } catch (e) { box.textContent = e.message; return; }
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
        <div class="mini-list">${d.orders.map(o => `<div class="row" style="cursor:default"><span>#${o.orderCode} · Premium ${esc(o.packageName)}<br><small>${dt(o.createdAt)}${o.paidVia ? ' · qua ' + o.paidVia : ''}</small></span>
          <span style="text-align:right">${money(o.amount)}<br><span class="st ${o.status}">${ST[o.status]}</span></span></div>`).join('') || '<span class="muted small">Chưa có đơn.</span>'}</div></div>
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
      if (a === 'role') { extra.role = b.dataset.role; if (!confirm(extra.role === 'admin' ? 'Cấp quyền quản trị cho tài khoản này?' : 'Gỡ quyền quản trị?')) return; }
      if (a === 'ban') { if (!confirm('Khóa tài khoản và đăng xuất mọi thiết bị?')) return; extra.reason = prompt('Lý do (tùy chọn):') || ''; }
      if (a === 'delete') {
        const c = prompt(`Xóa vĩnh viễn tài khoản, lượt dùng và đơn hàng. Nhập "${u.email}" để xác nhận:`);
        if (c === null) return; extra.confirm = c.trim();
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
      if (v === 'delete') { const c = prompt(`Xóa vĩnh viễn ${codes.length} đơn (không thu hồi ngày Premium đã cộng). Nhập XOA để xác nhận:`); if (c === null) return; payload.confirm = c.trim(); }
      else if (!confirm(`Áp dụng "${$('#ob-action').selectedOptions[0].textContent}" cho ${codes.length} đơn?`)) return;
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
        <td><span class="st ${o.status}">${ST[o.status]}</span>${o.paidAt ? `<small>${dt(o.paidAt)} · ${esc(o.paidVia || '')}</small>` : ''}${o.note ? `<small>${esc(o.note)}</small>` : ''}</td>
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
          if (!confirm('Xác nhận đã nhận tiền cho đơn này và kích hoạt Premium cho khách?')) return;
          extra.note = prompt('Ghi chú (vd: đã kiểm tra sao kê):') || '';
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
        <div><small>Trạng thái</small><span class="st ${o.status}">${ST[o.status]}</span>${o.paidAt ? `<small>${dt(o.paidAt)} · ${esc(o.paidVia || '')}</small>` : ''}</div>
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
      if (!confirm(`Xóa vĩnh viễn đơn #${o.orderCode}? ${paid ? 'Ngày Premium đã cộng sẽ KHÔNG bị thu hồi.' : ''}`)) return;
      run(e.target, async () => { const r = await post(`/api/admin/orders/${o.orderCode}/action`, { action: 'delete' }); $('#modal-adm-form').hidden = true; orders(); return r; });
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
          <label class="field"><span>Tên người bán / công ty</span><input id="sl-name" value="${esc(s.seller.name || '')}" placeholder="VoiceKit"></label>
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

  /* ---------------- Mẫu email ---------------- */
  let quill = null, lastField = null, previewTimer = 0, tplId = null;
  async function loadQuill() {
    if (window.Quill) return window.Quill;
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
    document.head.appendChild(css);
    await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
    return window.Quill;
  }

  async function email(id) {
    loading();
    let list;
    try { list = (await api('/api/admin/email-templates')).templates; } catch (e) { body().innerHTML = `<div class="card">${esc(e.message)}</div>`; return; }
    tplId = id || tplId || list[0].id;
    body().innerHTML = `<div class="email-wrap">
      <aside class="tpl-list">${list.map(t => `<button class="tpl-item ${t.id === tplId ? 'active' : ''}" data-tpl="${t.id}">
        <span class="tpl-ico">${t.icon}</span><span><b>${esc(t.name)}</b><small>${t.customized ? 'Đã chỉnh sửa' : 'Mặc định'}</small></span></button>`).join('')}
        <p class="muted small" style="padding:6px 4px">Mẫu gốc nằm trong <code>worker/templates/</code>. Sửa ở đây sẽ lưu vào cơ sở dữ liệu, bấm "Khôi phục mặc định" để quay về mẫu gốc.</p>
      </aside>
      <div class="card tpl-editor" id="tpl-editor"><div class="pay-center"><div class="wave"><i></i><i></i><i></i><i></i><i></i></div></div></div>
      <div class="card tpl-preview"><h4><span>Xem trước</span><span class="chart-switch"><button data-pv="desktop" class="active">Máy tính</button><button data-pv="mobile">Điện thoại</button></span></h4>
        <div class="pv-subject" id="pv-subject"></div>
        <div class="pv-frame-wrap" id="pv-wrap"><iframe id="pv-frame" title="Xem trước email"></iframe></div></div>
    </div>`;
    $$('#adm-body [data-tpl]').forEach(b => b.addEventListener('click', () => email(b.dataset.tpl)));
    $$('#adm-body [data-pv]').forEach(b => b.addEventListener('click', () => {
      $$('#adm-body [data-pv]').forEach(x => x.classList.toggle('active', x === b));
      $('#pv-wrap').classList.toggle('mobile', b.dataset.pv === 'mobile');
    }));

    let d;
    try { d = await api(`/api/admin/email-templates/${tplId}`); } catch (e) { $('#tpl-editor').textContent = e.message; return; }
    const t = d.template, meta = list.find(x => x.id === tplId);
    $('#tpl-editor').innerHTML = `
      <div class="tpl-head"><div><h4 style="margin:0">${meta.icon} ${esc(meta.name)}</h4><span class="muted small">${esc(meta.description)}</span></div>
        <span class="tag ${d.customized ? 'pro' : ''}">${d.customized ? 'Đã chỉnh sửa' + (d.updatedBy ? ' · ' + esc(d.updatedBy) : '') : 'Mẫu mặc định'}</span></div>
      <label class="field"><span>Tiêu đề email</span><input type="text" data-f="subject" value="${esc(t.subject)}"></label>
      <label class="field"><span>Dòng xem trước <em class="muted">hiện cạnh tiêu đề trong hộp thư</em></span><input type="text" data-f="preheader" value="${esc(t.preheader)}"></label>
      <label class="field"><span>Tiêu đề lớn trong thư</span><input type="text" data-f="heading" value="${esc(t.heading)}"></label>
      <div class="field"><span>Nội dung</span><div class="quill-box"><div id="tpl-quill"></div></div></div>
      <div class="field-group" style="margin-top:0;grid-template-columns:1fr 1.4fr">
        <label class="field"><span>Chữ trên nút</span><input type="text" data-f="button_text" value="${esc(t.button_text)}"></label>
        <label class="field"><span>Liên kết của nút</span><input type="text" data-f="button_url" value="${esc(t.button_url)}"></label>
      </div>
      <label class="field"><span>Ghi chú cuối thư <em class="muted">để trống nếu không cần</em></span><input type="text" data-f="note" value="${esc(t.note)}"></label>
      <div class="field"><span>Biến <em class="muted">bấm để chèn vào ô đang chọn</em></span>
        <div class="var-chips">${d.variables.map(v => `<button type="button" class="var-chip ${v.block ? 'block' : ''}" data-var="${v.key}" title="${esc(v.desc)}">{{${v.key}}}</button>`).join('')}</div></div>
      <div class="modal-foot spread" style="margin-top:14px">
        <span class="adm-actions">${d.customized ? '<button class="btn sm danger" id="tpl-reset">Khôi phục mặc định</button>' : ''}<button class="btn sm" id="tpl-test">Gửi thử cho tôi</button></span>
        <button class="btn primary" id="tpl-save">Lưu mẫu</button>
      </div>`;

    const Q = await loadQuill();
    quill = new Q('#tpl-quill', {
      theme: 'snow', placeholder: 'Nội dung email…',
      modules: { toolbar: [[{ header: [2, 3, false] }], ['bold', 'italic', 'underline', 'strike'], [{ color: [] }], [{ list: 'ordered' }, { list: 'bullet' }], [{ align: [] }], ['link', 'blockquote'], ['clean']] }
    });
    quill.clipboard.dangerouslyPasteHTML(t.body || '');
    lastField = 'quill';
    quill.on('selection-change', (r) => { if (r) lastField = 'quill'; });
    quill.on('text-change', schedulePreview);
    $$('#tpl-editor [data-f]').forEach(i => {
      i.addEventListener('focus', () => { lastField = i; });
      i.addEventListener('input', schedulePreview);
    });
    $$('#tpl-editor [data-var]').forEach(b => b.addEventListener('mousedown', (e) => e.preventDefault()));
    $$('#tpl-editor [data-var]').forEach(b => b.addEventListener('click', () => insertVar(`{{${b.dataset.var}}}`)));
    $('#tpl-save').addEventListener('click', (e) => run(e.target, async () => { const r = await post(`/api/admin/email-templates/${tplId}`, draft()); email(tplId); return r; }));
    $('#tpl-test').addEventListener('click', (e) => run(e.target, () => post(`/api/admin/email-templates/${tplId}/test`, draft())));
    $('#tpl-reset')?.addEventListener('click', (e) => { if (confirm('Khôi phục mẫu gốc? Nội dung đã sửa sẽ mất.')) run(e.target, async () => { const r = await post(`/api/admin/email-templates/${tplId}/reset`); email(tplId); return r; }); });
    preview();
  }
  function draft() {
    const o = { body: quill ? quill.root.innerHTML : '' };
    $$('#tpl-editor [data-f]').forEach(i => { o[i.dataset.f] = i.value; });
    return o;
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
      schedulePreview();
    }
  }
  function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(preview, 500); }
  async function preview() {
    try {
      const r = await post(`/api/admin/email-templates/${tplId}/preview`, draft());
      $('#pv-subject').innerHTML = `<span class="muted small">Tiêu đề:</span> <b>${esc(r.subject)}</b>`;
      $('#pv-frame').srcdoc = r.html;
    } catch (e) { $('#pv-subject').textContent = e.message; }
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
    $('#sy-webhook').addEventListener('click', (e) => { if (confirm('Đăng ký webhook của kênh payOS về VoiceKit?')) run(e.target, () => post('/api/admin/payos/webhook')); });
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
