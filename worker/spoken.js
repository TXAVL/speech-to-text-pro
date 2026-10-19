// Phiên âm tên miền để giọng đọc đọc đúng (tiếng Việt / tiếng Anh) + câu ghi nguồn cuối file.
// vd: speech-to-text-pro.txasoft.workers.dev
//  -> "xpít gạch ngang tu gạch ngang tếch gạch ngang prô chấm tê ích a xóp chấm uốc cơ chấm đép"

// Từ tiếng Anh hay gặp trong tên miền -> cách đọc tiếng Việt
const VI_WORDS = {
  speech: 'xpít', to: 'tu', text: 'tếch', pro: 'prô', voice: 'voi', kit: 'kít', app: 'áp', apps: 'áp', web: 'uép', site: 'sai',
  online: 'on lai', ai: 'ây ai', worker: 'uốc cơ', workers: 'uốc cơ', dev: 'đép', com: 'com', net: 'nét', org: 'o rờ gờ', io: 'ai ô',
  vn: 'vê en', co: 'cô', me: 'mi', page: 'pết', pages: 'pết', github: 'gít hắp', git: 'gít', hub: 'hắp', cloud: 'clao', store: 'xto',
  shop: 'sóp', soft: 'xóp', tech: 'tếch', studio: 'xtiu đi ô', audio: 'au đi ô', video: 'vi đi ô', sound: 'xao', tool: 'tun', tools: 'tun',
  free: 'phri', my: 'mai', go: 'gô', live: 'lai', top: 'tóp', box: 'bóc', lab: 'láp', labs: 'láp', hq: 'hát quy', api: 'a pê i',
  blog: 'blóc', news: 'niu', home: 'hôm', data: 'đa ta', smart: 'xmát', link: 'linh', info: 'in phô', biz: 'bít', xyz: 'ích i dét',
  edu: 'e đu', gov: 'gơ vơ', mail: 'meo', chat: 'chát', bot: 'bốt', game: 'ghêm', games: 'ghêm', music: 'miu dích', star: 'xta',
  one: 'oan', team: 'tim', vip: 'víp', viet: 'việt', vietnam: 'việt nam', saigon: 'sài gòn', hanoi: 'hà nội', tts: 'tê tê ét', stt: 'ét tê tê',
  www: 'vê kép vê kép vê kép', local: 'lâu cồ', host: 'hốt', localhost: 'lâu cồ hốt', speak: 'xpích', reader: 'ri đơ', read: 'rít', talk: 'tóoc', say: 'xây', play: 'plây', fast: 'phát', easy: 'i di',
  txa: 'tê ích a', google: 'gú gồ', youtube: 'du túp', facebook: 'phây xơ búc', tiktok: 'tíc tóc', zalo: 'da lô', cloudflare: 'clao phe'
};
const VI_LETTERS = { a: 'a', b: 'bê', c: 'xê', d: 'đê', e: 'e', f: 'ép', g: 'giê', h: 'hát', i: 'i', j: 'gi', k: 'ca', l: 'e lờ', m: 'em mờ', n: 'en nờ',
  o: 'o', p: 'pê', q: 'quy', r: 'e rờ', s: 'ét', t: 'tê', u: 'u', v: 'vê', w: 'vê kép', x: 'ích', y: 'i dài', z: 'dét' };
const EN_WORDS = new Set(['speech', 'to', 'text', 'pro', 'voice', 'kit', 'app', 'apps', 'web', 'site', 'online', 'workers', 'worker', 'dev', 'com', 'net', 'page', 'pages',
  'github', 'hub', 'cloud', 'store', 'shop', 'soft', 'tech', 'studio', 'audio', 'video', 'sound', 'tool', 'tools', 'free', 'my', 'go', 'live', 'top', 'box', 'lab', 'labs',
  'blog', 'news', 'home', 'data', 'smart', 'link', 'info', 'mail', 'chat', 'bot', 'game', 'games', 'music', 'star', 'one', 'team', 'speak', 'reader', 'read', 'talk', 'say', 'play', 'fast', 'easy']);

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const two = (x) => { const t = Math.floor(x / 10), u = x % 10; if (x < 10) return DIGITS[x]; return (t === 1 ? 'mười' : DIGITS[t] + ' mươi') + (u === 0 ? '' : u === 1 && t > 1 ? ' mốt' : u === 5 ? ' lăm' : u === 4 && t > 1 ? ' tư' : ' ' + DIGITS[u]); };
const three = (x, full) => { const h = Math.floor(x / 100), r = x % 100; if (!full && x < 100) return two(x); return `${DIGITS[h]} trăm` + (r === 0 ? '' : r < 10 ? ` lẻ ${DIGITS[r]}` : ' ' + two(r)); };
function viNumber(s) {
  if (s.length > 4 || (s.length > 1 && s.startsWith('0'))) return s.split('').map(d => DIGITS[d]).join(' ');
  const n = Number(s);
  if (n < 1000) return three(n, false);
  const th = Math.floor(n / 1000), r = n % 1000;
  return `${DIGITS[th]} nghìn` + (r === 0 ? '' : ' ' + three(r, true));
}

/* Âm tiết tiếng Việt không dấu (vd "giongnoi" -> "giong noi") */
const ONSETS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'qu', 'th', 'tr', 'b', 'c', 'd', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x', ''];
const NUCLEI = ['uye', 'uya', 'ieu', 'yeu', 'uoi', 'oai', 'oay', 'uay', 'uyu', 'ai', 'ao', 'au', 'ay', 'eo', 'eu', 'ia', 'ie', 'iu', 'oa', 'oe', 'oi', 'ua', 'ue', 'ui', 'uo', 'uu', 'uy', 'ye', 'a', 'e', 'i', 'o', 'u', 'y'];
const CODAS = ['ng', 'nh', 'ch', 'c', 'm', 'n', 'p', 't', ''];
function viSyllables(tok) {
  const memo = new Map();
  const go = (i) => {
    if (i === tok.length) return [];
    if (memo.has(i)) return memo.get(i);
    let res = null;
    outer: for (const o of ONSETS) {
      if (!tok.startsWith(o, i)) continue;
      for (const v of NUCLEI) {
        if (!tok.startsWith(v, i + o.length)) continue;
        for (const c of CODAS) {
          const end = i + o.length + v.length + c.length;
          if (!tok.startsWith(c, i + o.length + v.length)) continue;
          const rest = go(end);
          if (rest) { res = [tok.slice(i, end), ...rest]; break outer; }
        }
      }
    }
    memo.set(i, res);
    return res;
  };
  return go(0);
}

/** Tách token chữ không có trong từ điển thành các từ đã biết + phần đánh vần (ưu tiên từ dài). */
function segment(token, known) {
  const best = new Array(token.length + 1).fill(null);
  best[0] = [];
  for (let i = 0; i < token.length; i++) {
    if (!best[i]) continue;
    for (let j = token.length; j > i; j--) {
      const w = token.slice(i, j);
      if (known(w) && w.length >= 2) { const cand = [...best[i], { w, known: true }]; if (!best[j] || score(cand) > score(best[j])) best[j] = cand; }
    }
    const cand = [...best[i], { w: token[i], known: false }];
    if (!best[i + 1] || score(cand) > score(best[i + 1])) best[i + 1] = cand;
  }
  return best[token.length];
}
const score = (parts) => parts.reduce((s, p) => s + (p.known ? p.w.length * 3 : -1), 0);

function spokenToken(tok, lang) {
  if (/^\d+$/.test(tok)) return lang === 'vi' ? viNumber(tok) : tok.split('').join(' ');
  const lower = tok.toLowerCase();
  if (lang === 'vi') {
    if (VI_WORDS[lower]) return VI_WORDS[lower];
    const parts = segment(lower, w => !!VI_WORDS[w] && w.length >= 3);
    if (parts.every(p => p.known)) return parts.map(p => VI_WORDS[p.w]).join(' ');
    const syl = lower.length >= 3 ? viSyllables(lower) : null;
    if (syl) return syl.join(' ');
    const out = [];
    for (const p of parts) out.push(p.known ? VI_WORDS[p.w] : VI_LETTERS[p.w] || p.w);
    return out.join(' ');
  }
  if (EN_WORDS.has(lower)) return lower;
  const parts = segment(lower, w => EN_WORDS.has(w));
  return parts.map(p => p.known ? p.w : p.w.toUpperCase()).join(' ');
}

/** Phiên âm tên miền: lang = 'vi' | 'en' */
export function spokenDomain(host, lang = 'vi') {
  const clean = String(host || '').toLowerCase().replace(/^https?:\/\//, '').replace(/[/:?#].*$/, '');
  const dot = lang === 'vi' ? 'chấm' : 'dot', dash = lang === 'vi' ? 'gạch ngang' : 'dash';
  return clean.split('.').map(label =>
    label.split('-').map(part => part.split(/(\d+)/).filter(Boolean).map(t => spokenToken(t, lang)).join(' ')).join(` ${dash} `)
  ).join(` ${dot} `).replace(/\s+/g, ' ').trim();
}

/** Câu ghi nguồn: {domain} = tên miền phiên âm. "File" đọc là "phai" cho giọng Việt. */
export function sourceLine(cfg, host, lang) {
  const w = cfg.watermark;
  if (!w.enabled || !host) return '';
  const tpl = lang === 'vi' ? w.vi : w.en;
  let line = tpl.replace(/\{domain\}/g, spokenDomain(host, lang));
  if (lang === 'vi') line = line.replace(/\bfile\b/gi, 'phai');
  return line.trim();
}

/** Ngôn ngữ của câu ghi nguồn theo giọng đọc */
export function langOfVoice(voice) {
  return /^vi-/i.test(String(voice || '')) || /vivn|_vi|vi_/i.test(String(voice || '')) ? 'vi' : 'en';
}
