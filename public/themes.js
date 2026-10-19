'use strict';
/* VoiceKit - giao diện theo mùa / ngày lễ (giờ Việt Nam).
   Toàn trang đổi nhẹ (màu nhấn, vài hạt rơi, biểu tượng cạnh logo); modal đăng nhập/đăng ký đổi đặc sắc.
   Xem thử: ?theme=halloween | teachers | xmas | newyear | tet | valentine | women | reunify | children | national | midautumn | none */

const vkTheme = (() => {
  // Ngày mùng 1 Tết và rằm tháng 8 (dương lịch)
  const TET = { 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11', 2033: '01-31', 2034: '02-19', 2035: '02-08' };
  const MID_AUTUMN = { 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12', 2031: '10-01', 2032: '09-19', 2033: '09-08', 2034: '09-27', 2035: '09-16' };
  const CAN = ['Canh', 'Tân', 'Nhâm', 'Quý', 'Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ'];
  const CHI = ['Thân', 'Dậu', 'Tuất', 'Hợi', 'Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi'];
  const canChi = (y) => `${CAN[y % 10]} ${CHI[y % 12]}`;

  const vnNow = () => { const d = new Date(Date.now() + 7 * 3600e3); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), t: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) }; };
  const dayOf = (y, mmdd) => { const [m, d] = mmdd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const DAY = 86400000;

  /** Chủ đề tự động theo ngày. Ưu tiên Tết > Trung thu > các ngày cố định. */
  function autoTheme() {
    const n = vnNow(), md = n.m * 100 + n.d;
    for (const y of [n.y, n.y + 1]) {
      if (TET[y]) { const t = dayOf(y, TET[y]); if (n.t >= t - 12 * DAY && n.t <= t + 7 * DAY) return { id: 'tet', year: y }; }
    }
    if (MID_AUTUMN[n.y]) { const t = dayOf(n.y, MID_AUTUMN[n.y]); if (n.t >= t - 7 * DAY && n.t <= t) return { id: 'midautumn' }; }
    if (md >= 1001 && md <= 1102) return { id: 'halloween' };
    if (md >= 1113 && md <= 1121) return { id: 'teachers' };
    if (md >= 1215 && md <= 1226) return { id: 'xmas' };
    if (md >= 1227 || md <= 103) return { id: 'newyear', year: md >= 1227 ? n.y + 1 : n.y };
    if (md >= 210 && md <= 214) return { id: 'valentine' };
    if (md >= 304 && md <= 308) return { id: 'women' };
    if (md >= 426 && md <= 501) return { id: 'reunify' };
    if (md >= 529 && md <= 601) return { id: 'children' };
    if (md >= 829 && md <= 902) return { id: 'national' };
    return { id: 'none' };
  }

  /* ---------- Tranh minh họa (SVG) cho phần trái của modal ---------- */
  const ART = {
    none: () => `<svg viewBox="0 0 300 220" class="art"><defs><linearGradient id="wv" x1="0" x2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>
      ${[...Array(15)].map((_, i) => { const h = 18 + Math.abs(Math.sin(i * 1.3)) * 70; return `<rect class="eq" style="animation-delay:${i * 0.08}s" x="${36 + i * 16}" y="${110 - h / 2}" width="9" height="${h}" rx="4.5" fill="url(#wv)"/>`; }).join('')}
      <circle cx="150" cy="110" r="96" fill="none" stroke="url(#wv)" stroke-opacity=".25" stroke-width="1.5" class="ring"/></svg>`,
    halloween: () => `<svg viewBox="0 0 300 230" class="art">
      <circle cx="226" cy="54" r="38" fill="#fde68a"/><circle cx="214" cy="46" r="38" fill="#2a1446" opacity=".55"/>
      <g class="float"><path d="M98 168c0-40 18-70 48-70s48 30 48 70l-10-8-9 10-10-10-9 10-10-10-10 8z" fill="#f8f5ff"/>
        <ellipse cx="132" cy="128" rx="5" ry="7" fill="#2a1446"/><ellipse cx="160" cy="128" rx="5" ry="7" fill="#2a1446"/>
        <circle cx="134" cy="125" r="1.8" fill="#fff"/><circle cx="162" cy="125" r="1.8" fill="#fff"/>
        <ellipse cx="122" cy="141" rx="7" ry="4" fill="#ff9ec7" opacity=".8"/><ellipse cx="170" cy="141" rx="7" ry="4" fill="#ff9ec7" opacity=".8"/>
        <path d="M140 142q6 6 12 0" stroke="#2a1446" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
      <g transform="translate(196 150)"><ellipse cx="34" cy="40" rx="40" ry="32" fill="#ff7a1a"/><path d="M14 40c0-16 4-30 20-30M54 40c0-16-4-30-20-30" stroke="#e8590c" stroke-width="3" fill="none"/>
        <rect x="31" y="0" width="7" height="12" rx="3" fill="#4d7c0f"/><path d="M20 34l7-6 7 6M48 34l7-6 7 6" stroke="#2a1446" stroke-width="3" fill="none" stroke-linecap="round"/>
        <path d="M24 48q10 10 20 0q10 10 16 0" stroke="#2a1446" stroke-width="3" fill="none" stroke-linecap="round"/></g>
      <g fill="#1a0b2e" class="bats"><path d="M40 60q8-8 14 0q4-6 8 0q6-8 14 0q-8 2-10 8q-5-4-8 0q-3-4-8 0q-2-6-10-8z"/><path transform="translate(60 -26) scale(.7)" d="M40 60q8-8 14 0q4-6 8 0q6-8 14 0q-8 2-10 8q-5-4-8 0q-3-4-8 0q-2-6-10-8z"/></g></svg>`,
    teachers: () => `<svg viewBox="0 0 300 220" class="art">
      <path d="M60 150q45-18 90 0q45-18 90 0v-80q-45-18-90 0q-45-18-90 0z" fill="#fff7ed"/><path d="M150 70v80" stroke="#fdba74" stroke-width="3"/>
      ${[0, 1, 2, 3].map(i => `<path d="M${76 + i * 0} ${86 + i * 14}h56M${168} ${86 + i * 14}h56" stroke="#fed7aa" stroke-width="3" stroke-linecap="round"/>`).join('')}
      ${[[110, 52, '#fb7185'], [150, 40, '#f472b6'], [190, 52, '#fb923c']].map(([x, y, c]) => `<g class="sway"><path d="M${x} ${y + 40}v40" stroke="#65a30d" stroke-width="3"/><path d="M${x - 12} ${y + 10}q0 22 12 26q12-4 12-26q-6 6-12-6q-6 12-12 6z" fill="${c}"/></g>`).join('')}</svg>`,
    xmas: () => `<svg viewBox="0 0 300 230" class="art">
      <path d="M150 28l56 74h-22l40 52h-28l34 44H70l34-44H76l40-52H94z" fill="#15803d"/><rect x="138" y="198" width="24" height="22" rx="3" fill="#7c2d12"/>
      <path d="M150 14l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#facc15" class="twinkle"/>
      ${[[132, 80, '#ef4444'], [168, 96, '#facc15'], [120, 128, '#38bdf8'], [180, 140, '#ef4444'], [150, 120, '#f472b6'], [110, 176, '#facc15'], [196, 180, '#38bdf8'], [150, 168, '#ef4444']]
        .map(([x, y, c], i) => `<circle cx="${x}" cy="${y}" r="6" fill="${c}" class="twinkle" style="animation-delay:${i * 0.25}s"/>`).join('')}
      <rect x="208" y="186" width="40" height="34" rx="4" fill="#dc2626"/><rect x="225" y="186" width="6" height="34" fill="#fde047"/><path d="M228 186q-14-14-18 0M228 186q14-14 18 0" stroke="#fde047" stroke-width="4" fill="none"/></svg>`,
    newyear: (t) => `<svg viewBox="0 0 300 220" class="art">
      ${[[80, 70, '#facc15'], [220, 60, '#f472b6'], [150, 40, '#38bdf8'], [240, 140, '#a78bfa'], [60, 150, '#34d399']].map(([x, y, c], i) =>
        `<g class="burst" style="animation-delay:${i * 0.45}s;transform-origin:${x}px ${y}px">${[...Array(12)].map((_, k) => { const a = k * Math.PI / 6; return `<line x1="${x}" y1="${y}" x2="${x + Math.cos(a) * 26}" y2="${y + Math.sin(a) * 26}" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`; }).join('')}</g>`).join('')}
      <text x="150" y="150" text-anchor="middle" font-size="64" font-weight="800" fill="url(#gold)" font-family="Be Vietnam Pro,sans-serif">${t.year || ''}</text>
      <defs><linearGradient id="gold" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#fde68a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs></svg>`,
    tet: (t) => `<svg viewBox="0 0 300 230" class="art">
      ${[[70, 0, 1], [230, 0, 1.15]].map(([x, y, s], i) => `<g class="swing" style="transform-origin:${x}px 0;animation-delay:${i * 0.6}s"><line x1="${x}" y1="0" x2="${x}" y2="36" stroke="#fbbf24" stroke-width="2"/>
        <g transform="translate(${x} ${60}) scale(${s})"><rect x="-6" y="-26" width="12" height="6" fill="#fbbf24"/><ellipse cx="0" cy="0" rx="28" ry="24" fill="#dc2626"/><path d="M-14 -21v42M0 -24v48M14 -21v42" stroke="#b91c1c" stroke-width="2"/><rect x="-6" y="20" width="12" height="6" fill="#fbbf24"/><path d="M0 26v16" stroke="#fbbf24" stroke-width="3"/></g></g>`).join('')}
      <g transform="translate(150 150)">${[...Array(5)].map((_, k) => `<ellipse rx="12" ry="20" fill="#facc15" transform="rotate(${k * 72}) translate(0 -18)"/>`).join('')}<circle r="9" fill="#ea580c"/></g>
      <text x="150" y="214" text-anchor="middle" font-size="18" font-weight="800" fill="#fde68a" font-family="Be Vietnam Pro,sans-serif">Xuân ${canChi(t.year || vnNow().y)}</text></svg>`,
    valentine: () => `<svg viewBox="0 0 300 220" class="art"><g class="beat" style="transform-origin:150px 115px"><path d="M150 186c-60-40-90-70-90-104 0-24 18-40 40-40 22 0 38 14 50 32 12-18 28-32 50-32 22 0 40 16 40 40 0 34-30 64-90 104z" fill="#fb7185"/><path d="M110 70q-16 4-18 22" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round" fill="none"/></g></svg>`,
    women: () => `<svg viewBox="0 0 300 220" class="art">${[[110, '#f472b6'], [150, '#fb7185'], [190, '#e879f9']].map(([x, c], i) => `<g class="sway" style="animation-delay:${i * .3}s"><path d="M${x} 120v80" stroke="#65a30d" stroke-width="4"/><g transform="translate(${x} 100)">${[...Array(6)].map((_, k) => `<ellipse rx="10" ry="20" fill="${c}" transform="rotate(${k * 60}) translate(0 -14)"/>`).join('')}<circle r="8" fill="#fde047"/></g></g>`).join('')}</svg>`,
    flag: (t) => `<svg viewBox="0 0 300 220" class="art"><line x1="70" y1="30" x2="70" y2="210" stroke="#d6d3d1" stroke-width="5" stroke-linecap="round"/>
      <path class="wave-flag" d="M72 36c40-12 80 12 160 0v104c-80 12-120-12-160 0z" fill="#da251d"/><path d="M152 62l9 27h28l-23 17 9 27-23-17-23 17 9-27-23-17h28z" fill="#ffcd00"/>
      <text x="150" y="196" text-anchor="middle" font-size="16" font-weight="800" fill="#fde68a" font-family="Be Vietnam Pro,sans-serif">${t.label}</text></svg>`,
    children: () => `<svg viewBox="0 0 300 230" class="art">${[[100, '#f472b6', 60], [150, '#38bdf8', 40], [200, '#facc15', 64], [125, '#34d399', 90], [178, '#a78bfa', 96]].map(([x, c, y], i) => `<g class="float" style="animation-delay:${i * .4}s"><path d="M${x} ${y + 40}q-6 40 6 90" stroke="#e7e5e4" stroke-width="1.5" fill="none"/><ellipse cx="${x}" cy="${y}" rx="22" ry="27" fill="${c}"/><path d="M${x - 4} ${y + 26}l4 6 4-6z" fill="${c}"/><ellipse cx="${x - 8}" cy="${y - 10}" rx="5" ry="8" fill="#fff" opacity=".45"/></g>`).join('')}</svg>`,
    midautumn: () => `<svg viewBox="0 0 300 230" class="art"><circle cx="200" cy="70" r="44" fill="#fde68a"/><circle cx="185" cy="60" r="8" fill="#fcd34d"/><circle cx="214" cy="84" r="6" fill="#fcd34d"/>
      <g class="swing" style="transform-origin:110px 40px"><line x1="110" y1="40" x2="110" y2="110" stroke="#a16207" stroke-width="3"/><path d="M110 112l16 40-40-24h48l-40 24z" fill="#ef4444" stroke="#fbbf24" stroke-width="3" stroke-linejoin="round"/></g></svg>`
  };

  const THEMES = {
    none: { badge: '', particles: [], title: 'Chào mừng trở lại', sub: 'Biến giọng nói thành chữ và chữ thành giọng nói, ngay trên trình duyệt.' },
    halloween: { badge: '🎃', particles: ['🦇', '👻', '🎃', '🍬', '✨'], title: 'Happy Halloween!', sub: 'Trick or treat? Đăng nhập để nhận kẹo… à nhầm, nhận thêm lượt giọng đọc 👻', art: 'halloween' },
    teachers: { badge: '📚', particles: ['🌷', '🌸', '📖', '✨'], title: 'Tri ân thầy cô 20/11', sub: 'Gửi lời cảm ơn đến những người đã dạy ta biết nói, biết viết.', art: 'teachers' },
    xmas: { badge: '🎄', particles: ['❄', '❅', '❆', '✨'], title: 'Merry Christmas!', sub: 'Giáng sinh an lành, chúc bạn một mùa lễ thật ấm áp 🎁', art: 'xmas' },
    newyear: { badge: '🎆', particles: ['✨', '🎉', '🎊', '⭐'], title: 'Chúc mừng năm mới!', sub: 'Năm mới, giọng mới, ý tưởng mới. Bắt đầu thôi!', art: 'newyear' },
    tet: { badge: '🧧', particles: ['🌼', '🌸', '🧧', '✨'], title: 'Chúc mừng năm mới', sub: 'An khang thịnh vượng, vạn sự như ý. Lì xì đầu năm: đăng nhập ngay!', art: 'tet' },
    valentine: { badge: '💝', particles: ['❤', '💕', '💗', '✨'], title: 'Happy Valentine', sub: 'Gửi lời yêu thương bằng giọng nói của chính bạn 💌', art: 'valentine' },
    women: { badge: '🌸', particles: ['🌸', '🌷', '💐', '✨'], title: 'Chúc mừng 8/3', sub: 'Tôn vinh một nửa thế giới, luôn rạng rỡ và tự tin.', art: 'women' },
    reunify: { badge: '🇻🇳', particles: ['⭐', '✨', '🎉'], title: 'Mừng 30/4 – 1/5', sub: 'Mừng ngày thống nhất đất nước và Quốc tế Lao động.', art: 'flag', label: 'Thống nhất · Lao động' },
    children: { badge: '🎈', particles: ['🎈', '🍭', '⭐', '🎉'], title: 'Quốc tế Thiếu nhi 1/6', sub: 'Ai cũng từng là trẻ con, hôm nay cứ vui hết mình!', art: 'children' },
    national: { badge: '🇻🇳', particles: ['⭐', '✨', '🎉'], title: 'Mừng Quốc khánh 2/9', sub: 'Tự hào Việt Nam, độc lập – tự do – hạnh phúc.', art: 'flag', label: 'Quốc khánh 2/9' },
    midautumn: { badge: '🏮', particles: ['🏮', '🌕', '✨', '🥮'], title: 'Trung thu vui vẻ', sub: 'Trăng rằm tháng Tám, đoàn viên ấm áp bên gia đình.', art: 'midautumn' }
  };

  let current = null, override = 'auto';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function particles(container, list, count, cls) {
    container.querySelectorAll('.' + cls).forEach(e => e.remove());
    if (!list.length || reduced()) return;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      s.className = cls;
      s.textContent = list[i % list.length];
      s.style.left = Math.random() * 100 + '%';
      s.style.fontSize = (10 + Math.random() * 14) + 'px';
      s.style.animationDuration = (7 + Math.random() * 9) + 's';
      s.style.animationDelay = (-Math.random() * 16) + 's';
      s.style.setProperty('--drift', (Math.random() * 60 - 30) + 'px');
      container.appendChild(s);
    }
  }

  function resolve() {
    const q = new URLSearchParams(location.search).get('theme');
    const id = q && THEMES[q] ? q : override !== 'auto' && THEMES[override] ? override : null;
    if (id) {
      const n = vnNow();
      // Tết sắp tới (hoặc đang diễn ra): năm đầu tiên mà mùng 1 + 7 ngày chưa qua
      const tetYear = [n.y, n.y + 1].find(y => TET[y] && dayOf(y, TET[y]) + 7 * DAY >= n.t) || n.y + 1;
      return { id, year: id === 'tet' ? tetYear : id === 'newyear' ? n.y + (n.m >= 7 ? 1 : 0) : undefined };
    }
    return autoTheme();
  }

  function apply(adminOverride) {
    if (adminOverride) override = adminOverride;
    const t = resolve(), th = THEMES[t.id];
    current = t;
    document.documentElement.dataset.season = t.id;
    // biểu tượng cạnh logo
    let badge = $('.brand .season-badge');
    if (th.badge) {
      if (!badge) { badge = document.createElement('span'); badge.className = 'season-badge'; $('.brand').appendChild(badge); }
      badge.textContent = th.badge;
    } else badge?.remove();
    // vài hạt rơi mờ trên toàn trang
    let layer = $('#season-layer');
    if (!layer) { layer = document.createElement('div'); layer.id = 'season-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.prepend(layer); }
    particles(layer, th.particles, 9, 'sp');
    renderHero();
  }

  /* Phần trái của modal đăng nhập/đăng ký */
  function renderHero() {
    const hero = $('#auth-hero');
    if (!hero || !current) return;
    const th = THEMES[current.id];
    const art = ART[th.art || 'none'] || ART.none;
    const title = current.id === 'newyear' ? `Chúc mừng năm mới ${current.year}!` : current.id === 'tet' ? `Chúc mừng năm mới ${canChi(current.year)}` : th.title;
    hero.innerHTML = `<div class="hero-art">${art({ ...current, label: th.label })}</div>
      <div class="hero-copy"><span class="hero-kicker">${th.badge ? th.badge + ' ' : ''}VoiceKit</span><h4>${title}</h4><p>${th.sub}</p></div>`;
    particles(hero, th.particles.length ? th.particles : ['·'], th.particles.length ? 16 : 0, 'hp');
  }

  apply();
  return { apply, renderHero, get current() { return current; }, list: Object.keys(THEMES) };
})();
