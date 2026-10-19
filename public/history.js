'use strict';
/* VoiceKit - lịch sử chuyển đổi (IndexedDB, lưu riêng theo tài khoản trên trình duyệt này).
   - Giọng → Chữ: văn bản + mốc thời gian
   - Chữ → Giọng: văn bản + file âm thanh để nghe / tải lại */

const vkHistory = (() => {
  const DB = 'voicekit', STORE = 'history', MAX = 50;
  let dbp = null, filter = 'all', query = '';
  const urls = [];

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((ok, fail) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { keyPath: 'id' });
        os.createIndex('owner', 'owner');
      };
      req.onsuccess = () => ok(req.result);
      req.onerror = () => fail(req.error);
    });
    return dbp;
  }
  const owner = () => (typeof keyGate !== 'undefined' && keyGate.userId) ? 'u' + keyGate.userId : 'local';
  const tx = async (mode, fn) => { const db = await open(); return new Promise((ok, fail) => { const t = db.transaction(STORE, mode); const r = fn(t.objectStore(STORE)); t.oncomplete = () => ok(r?.result); t.onerror = () => fail(t.error); }); };

  async function list() {
    const db = await open();
    return new Promise((ok, fail) => {
      const req = db.transaction(STORE).objectStore(STORE).index('owner').getAll(owner());
      req.onsuccess = () => ok(req.result.sort((a, b) => b.id - a.id));
      req.onerror = () => fail(req.error);
    });
  }
  async function add(entry) {
    if (typeof keyGate !== 'undefined' && !keyGate.allowed) return; // khách không lưu lịch sử
    try {
      await tx('readwrite', s => s.put({ ...entry, id: Date.now() + Math.random(), owner: owner(), at: new Date().toISOString() }));
      const all = await list();
      for (const old of all.slice(MAX)) await tx('readwrite', s => s.delete(old.id));
      if ($('#view-history').classList.contains('active')) render();
    } catch (e) { console.warn('Không lưu được lịch sử', e); }
  }
  const remove = (id) => tx('readwrite', s => s.delete(id));

  /* Chuyển dữ liệu lịch sử cũ (localStorage) sang IndexedDB, chỉ một lần */
  async function migrate() {
    try {
      const key = typeof historyKey === 'function' ? historyKey() : 'vk-history';
      const raw = store.get(key, '');
      if (!raw) return;
      const old = JSON.parse(raw);
      for (const h of old.reverse()) {
        await tx('readwrite', s => s.put({ type: 'stt', id: h.id, owner: owner(), at: h.at, name: h.name, model: h.model, duration: h.duration, text: h.text, segments: h.segments }));
      }
      store.set(key, '');
    } catch { /* bỏ qua */ }
  }

  const fmtDate = (iso) => new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clock = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  async function render() {
    const box = $('#history-list');
    if (!box) return;
    urls.splice(0).forEach(u => URL.revokeObjectURL(u));
    let items = [];
    try { await migrate(); items = await list(); } catch (e) { box.innerHTML = `<div class="empty"><strong>Không đọc được lịch sử</strong><span class="muted">${esc(e.message)}</span></div>`; return; }
    const counts = { all: items.length, stt: items.filter(i => i.type === 'stt').length, tts: items.filter(i => i.type === 'tts').length };
    $$('#history-filter .seg-btn').forEach(b => { b.classList.toggle('active', b.dataset.f === filter); b.querySelector('em').textContent = counts[b.dataset.f]; });
    const q = query.toLowerCase();
    const shown = items.filter(i => (filter === 'all' || i.type === filter) && (!q || `${i.text} ${i.name || ''} ${i.voiceLabel || ''}`.toLowerCase().includes(q)));
    $('#history-count').textContent = items.length ? `${items.length}/${MAX} mục · lưu trên trình duyệt này` : '';
    if (!shown.length) {
      box.innerHTML = `<div class="empty"><div class="empty-art"><svg><use href="#i-clock"/></svg></div><strong>${items.length ? 'Không có mục phù hợp' : 'Chưa có lịch sử'}</strong>
        <span class="muted">${items.length ? 'Thử bỏ bớt bộ lọc hoặc từ khóa.' : 'Mỗi lần chuyển giọng nói thành chữ hoặc đọc văn bản thành giọng sẽ tự lưu ở đây.'}</span></div>`;
      return;
    }
    box.innerHTML = '';
    for (const h of shown) {
      const el = document.createElement('div');
      el.className = 'h-item ' + h.type;
      const isTts = h.type === 'tts';
      el.innerHTML = `
        <span class="h-ico">${isTts ? '🔊' : '📝'}</span>
        <div class="h-body">
          <div class="h-top"><strong>${isTts ? esc(h.voiceLabel || 'Giọng đọc') : esc(h.name || 'Bản ghi')}</strong>
            <span class="h-meta">${isTts ? esc(h.libLabel || '') : esc(h.model || '')}${h.duration ? ' · ' + clock(h.duration) : ''} · ${fmtDate(h.at)}</span></div>
          <p>${esc(h.text)}</p>
          ${isTts && h.blob ? '<audio controls preload="none"></audio>' : ''}
          <div class="h-actions"></div>
        </div>`;
      const act = el.querySelector('.h-actions');
      const btn = (label, fn, cls = '') => { const b = Object.assign(document.createElement('button'), { className: 'btn sm ' + cls, textContent: label }); b.onclick = fn; act.appendChild(b); return b; };
      if (isTts) {
        if (h.blob) {
          const url = URL.createObjectURL(h.blob); urls.push(url);
          el.querySelector('audio').src = url;
          const a = Object.assign(document.createElement('a'), { className: 'btn sm', href: url, download: h.fileName || 'giong-doc.mp3', textContent: '⬇ Tải xuống' });
          act.appendChild(a);
        }
        btn('Dùng lại văn bản', () => { showView('tts'); $('#tts-text').value = h.text; $('#tts-text').dispatchEvent(new Event('input', { bubbles: true })); toast('Đã đưa văn bản về ô đọc.', 'ok'); });
      } else {
        btn('Mở', () => {
          state.meta = { model: h.model, duration: h.duration, name: h.name };
          state.text = h.text; state.raw = h.segments || [{ id: 1, start: 0, end: h.duration || 0, text: h.text }];
          showView('stt'); $('#empty').hidden = true; $('#progress-box').hidden = true; $('#result').hidden = false; $('#result-tools').hidden = false;
          renderResult();
        }, 'primary');
        btn('📋 Chép', async () => { try { await navigator.clipboard.writeText(h.text); toast('Đã chép văn bản.', 'ok'); } catch { toast('Không chép được.', 'err'); } });
        btn('TXT', () => download(`${slugVi(h.name || 'ban-ghi').replace(/-(mp3|wav|m4a|webm|mp4|ogg|flac)$/, '') || 'ban-ghi'}.txt`, h.text, 'text/plain'));
        if (h.segments?.length) btn('SRT', () => download(`${slugVi(h.name || 'ban-ghi').replace(/-(mp3|wav|m4a|webm|mp4|ogg|flac)$/, '') || 'ban-ghi'}.srt`,
          h.segments.map((s, i) => `${i + 1}\n${stamp(s.start, ',')} --> ${stamp(s.end, ',')}\n${s.text}\n`).join('\n'), 'text/plain'));
      }
      btn('Xóa', async () => { await remove(h.id); render(); }, 'danger ghost');
      box.appendChild(el);
    }
  }

  $$('#history-filter .seg-btn').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; render(); }));
  $('#history-search').addEventListener('input', (e) => { query = e.target.value.trim(); render(); });
  $('#history-clear').addEventListener('click', async () => {
    if (!confirm('Xóa toàn bộ lịch sử trên trình duyệt này?')) return;
    for (const h of await list()) await remove(h.id);
    render();
  });

  return { add, render };
})();

/* Các hàm app.js gọi tới */
function saveHistory() {
  vkHistory.add({ type: 'stt', name: state.meta.name, model: state.meta.model, duration: state.meta.duration, text: state.text, segments: state.raw });
}
function saveTtsHistory(blob, meta) { vkHistory.add({ type: 'tts', ...meta, blob }); }
function renderHistory() { vkHistory.render(); }
