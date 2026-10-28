'use strict';
/* VoiceKit - nâng cấp ô nhập liệu toàn trang (tự áp dụng cho cả phần tử sinh động trong trang Quản trị):
   - Ô số: nút − / + , giữ chuột để tăng giảm nhanh, cuộn chuột khi đang chọn ô
   - Ô tìm kiếm / ô lọc: nút × xóa nhanh
   - Ô văn bản nhiều dòng: tự giãn theo nội dung
   - Thanh trượt: bấm đúp để về giá trị mặc định
   - Ô đọc giọng: Dán, Chuẩn hóa khoảng trắng, kéo thả file .txt, Ctrl+Enter để đọc, đếm từ và ước lượng thời lượng */

const vkUI = (() => {
  const done = new WeakSet();

  function stepper(input) {
    if (input.closest('.num-wrap') || input.hasAttribute('data-no-stepper')) return;
    const wrap = document.createElement('span');
    wrap.className = 'num-wrap';
    input.parentNode.insertBefore(wrap, input);
    const dec = Object.assign(document.createElement('button'), { type: 'button', className: 'num-btn', textContent: '−', tabIndex: -1, title: 'Giảm' });
    const inc = Object.assign(document.createElement('button'), { type: 'button', className: 'num-btn', textContent: '+', tabIndex: -1, title: 'Tăng' });
    wrap.append(dec, input, inc);
    const bump = (dir) => {
      if (input.disabled || input.readOnly) return;
      const step = Number(input.step) > 0 ? Number(input.step) : 1;
      const min = input.min !== '' ? Number(input.min) : -Infinity, max = input.max !== '' ? Number(input.max) : Infinity;
      const v = Math.min(max, Math.max(min, (Number(input.value) || 0) + dir * step));
      input.value = Number.isInteger(step) ? String(Math.round(v)) : String(+v.toFixed(4));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const [btn, dir] of [[dec, -1], [inc, 1]]) {
      let t1 = 0, t2 = 0;
      const stop = () => { clearTimeout(t1); clearInterval(t2); };
      btn.addEventListener('pointerdown', (e) => { e.preventDefault(); bump(dir); t1 = setTimeout(() => { t2 = setInterval(() => bump(dir), 60); }, 380); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    }
    input.addEventListener('wheel', (e) => { if (document.activeElement === input) { e.preventDefault(); bump(e.deltaY < 0 ? 1 : -1); } }, { passive: false });
    const sync = () => { wrap.classList.toggle('disabled', input.disabled); };
    new MutationObserver(sync).observe(input, { attributes: true, attributeFilter: ['disabled'] }); sync();
  }

  function clearable(input) {
    if (input.closest('.clear-wrap')) return;
    const wrap = document.createElement('span');
    wrap.className = 'clear-wrap';
    input.parentNode.insertBefore(wrap, input);
    const x = Object.assign(document.createElement('button'), { type: 'button', className: 'clear-btn', textContent: '×', tabIndex: -1, title: 'Xóa' });
    wrap.append(input, x);
    const sync = () => wrap.classList.toggle('has-value', !!input.value);
    input.addEventListener('input', sync); sync();
    x.addEventListener('click', () => {
      input.value = ''; sync(); input.focus();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      // Ô lọc trong thanh công cụ: chạy lại tìm kiếm luôn
      if (input.closest('.toolbar')) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
  }

  function autosize(ta) {
    const max = Number(ta.dataset.maxHeight || 560);
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(max, ta.scrollHeight + 2) + 'px'; ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden'; };
    ta.addEventListener('input', fit);
    requestAnimationFrame(fit);
    ta._fit = fit;
  }

  function enhance(root = document) {
    root.querySelectorAll('input[type="number"]').forEach(i => { if (!done.has(i)) { done.add(i); stepper(i); } });
    root.querySelectorAll('.toolbar input[type="text"], input[type="search"], input[data-clearable]').forEach(i => { if (!done.has(i)) { done.add(i); clearable(i); } });
    root.querySelectorAll('textarea[data-autosize], #tts-text').forEach(t => { if (!done.has(t)) { done.add(t); autosize(t); } });
    root.querySelectorAll('input[type="range"]').forEach(r => {
      if (done.has(r)) return; done.add(r);
      r.title = 'Bấm đúp để về mặc định';
      const fill = () => r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%');
      r.addEventListener('input', fill); fill();
      r.addEventListener('dblclick', () => { r.value = r.defaultValue; r.dispatchEvent(new Event('input', { bubbles: true })); });
    });
  }

  /* ---------- Ô đọc giọng (Chữ -> Giọng) ---------- */
  function ttsTools() {
    const ta = $('#tts-text');
    if (!ta) return;
    const stats = $('#tts-stats');
    const refresh = () => {
      if (typeof vkSrt !== 'undefined' && vkSrt.looks(ta.value)) { stats.textContent = ''; ta._fit?.(); return; } // thống kê phụ đề do bảng SRT hiển thị
      const t = ta.value.trim(), words = t ? t.split(/\s+/).length : 0;
      const sec = Math.round(words / 2.6); // ~155 từ / phút
      stats.textContent = words ? `${words.toLocaleString('vi-VN')} từ · ước tính ~${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : 'Mẹo: Ctrl + Enter để đọc ngay, kéo thả file .txt vào ô';
      ta._fit?.();
    };
    ta.addEventListener('input', refresh);
    $('#tts-paste').addEventListener('click', async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (!t) return toast('Bộ nhớ tạm đang trống.');
        const s = ta.selectionStart, e = ta.selectionEnd;
        ta.value = ta.value.slice(0, s) + t + ta.value.slice(e);
        ta.dispatchEvent(new Event('input', { bubbles: true }));
      } catch { toast('Trình duyệt chặn đọc bộ nhớ tạm. Hãy dùng Ctrl + V.', 'err'); }
    });
    $('#tts-normalize').addEventListener('click', () => {
      ta.value = ta.value.replace(/\r/g, '').replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').replace(/ ([,.!?;:])/g, '$1').trim();
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      toast('Đã chuẩn hóa khoảng trắng và dấu câu.', 'ok');
    });
    ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); $('#btn-tts-run').click(); } });
    ['dragenter', 'dragover'].forEach(ev => ta.addEventListener(ev, (e) => { e.preventDefault(); ta.classList.add('drop'); }));
    ['dragleave', 'drop'].forEach(ev => ta.addEventListener(ev, () => ta.classList.remove('drop')));
    ta.addEventListener('drop', async (e) => {
      const f = e.dataTransfer.files?.[0];
      if (!f) return;
      e.preventDefault();
      if (!/^text\//.test(f.type) && !/\.(txt|md|srt|vtt)$/i.test(f.name)) return toast('Chỉ nhận file văn bản (.txt, .md, .srt).', 'err');
      const t = await f.text();
      // Phụ đề giữ nguyên mốc thời gian để đọc khớp giờ (vkSrt), không cắt theo giới hạn ký tự
      ta.value = /\.(srt|vtt)$/i.test(f.name) ? t : t.slice(0, Number(ta.maxLength) > 0 ? ta.maxLength : 20000);
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      toast(`Đã nạp nội dung từ ${f.name}.`, 'ok');
    });
    refresh();
  }

  enhance();
  ttsTools();
  new MutationObserver((list) => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) enhance(n); })
    .observe(document.body, { childList: true, subtree: true });
  return { enhance };
})();
