// Dựng email từ mẫu (worker/templates/*.js, admin có thể sửa trong D1) + khung HTML đẹp, tương thích Gmail / Outlook / điện thoại.
// Biến: {{ten_bien}}. Biến khối (vd {{order_table}}) chèn nguyên HTML.
// Giao diện: thương hiệu chung (config.emailBrand) + tùy chỉnh riêng từng mẫu (config.emailTpl[id]), đều sửa được trong Quản trị.
import { TEMPLATES, GLOBAL_VARS, FIELDS } from './templates/index.js';
import { getConfig, readSaved } from './config.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BRAND = { a: '#6d5dfc', b: '#0ea5c6', ink: '#161a2e', text: '#3f4660', muted: '#7b819b', line: '#e7e8f2', bg: '#f3f2fb' };

/* ---------- Giao diện email: giá trị mặc định, kiểm tra dữ liệu admin gửi lên ---------- */
export const FONTS = {
  modern: "'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
  classic: "Georgia,'Times New Roman',serif",
  friendly: "Verdana,Geneva,Tahoma,sans-serif",
  tech: "Consolas,'Courier New',monospace"
};
export const DEFAULT_BRAND = {
  color: '#6d5dfc', color2: '#0ea5c6', logo: 'V', logoUrl: '', tagline: 'Giọng nói ⇄ Văn bản', footer: '', support: '',
  font: 'modern', radius: 22, btnStyle: 'gradient', btnShape: 'round', align: 'left', accentBar: true, iconStyle: 'soft', bg: 'tint', fallback: true,
  social: { website: '', facebook: '', zalo: '', youtube: '', tiktok: '' }
};
const ENUMS = { font: Object.keys(FONTS), btnStyle: ['gradient', 'solid', 'outline'], btnShape: ['pill', 'round', 'square'], align: ['left', 'center'], iconStyle: ['soft', 'circle', 'none'], bg: ['tint', 'plain', 'dark'] };
const hexOr = (v, d) => /^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d;
const strOf = (v, n) => String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
const urlOf = (v) => { const s = strOf(v, 220); return /^https:\/\/[^\s"'<>]+$/i.test(s) ? s : ''; };
const flag = (v, d) => v === undefined || v === null ? d : v === true || v === 'true' || v === 1 || v === '1';

export function cleanBrand(b = {}) {
  b = b && typeof b === 'object' ? b : {};
  const D = DEFAULT_BRAND, support = strOf(b.support, 120), s = b.social && typeof b.social === 'object' ? b.social : {};
  const pick = (k) => ENUMS[k].includes(b[k]) ? b[k] : D[k];
  const radius = Number(b.radius);
  return {
    color: hexOr(b.color, D.color), color2: hexOr(b.color2, D.color2),
    logo: [...strOf(b.logo, 8)].slice(0, 2).join('') || D.logo, logoUrl: urlOf(b.logoUrl),
    tagline: b.tagline === undefined ? D.tagline : strOf(b.tagline, 60), footer: strOf(b.footer, 200),
    support: /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(support) ? support : '',
    font: pick('font'), radius: Number.isFinite(radius) ? Math.max(0, Math.min(32, Math.round(radius))) : D.radius,
    btnStyle: pick('btnStyle'), btnShape: pick('btnShape'), align: pick('align'), iconStyle: pick('iconStyle'), bg: pick('bg'),
    accentBar: flag(b.accentBar, D.accentBar), fallback: flag(b.fallback, D.fallback),
    social: Object.fromEntries(Object.keys(D.social).map(k => [k, urlOf(s[k])]))
  };
}
/** Tùy chỉnh riêng từng mẫu: biểu tượng, màu nhấn riêng, ảnh banner đầu thư, ẩn biểu tượng */
export function cleanTplStyle(s = {}) {
  s = s && typeof s === 'object' ? s : {};
  return { icon: [...strOf(s.icon, 8)].slice(0, 2).join(''), accent: /^#[0-9a-f]{6}$/i.test(String(s.accent || '')) ? String(s.accent).toLowerCase() : '', banner: urlOf(s.banner), hideIcon: flag(s.hideIcon, false) };
}

// Trộn màu với trắng (amt = 0..1 phần màu giữ lại) và đổi sang rgba
const mixWhite = (hex, amt) => '#' + [1, 3, 5].map(i => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * amt).toString(16).padStart(2, '0')).join('');
const rgba = (hex, a) => `rgba(${[1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;

/** Cấu hình đang lưu: thương hiệu chung + kiểu riêng của một mẫu */
export async function getSavedStyle(db, id = '', fresh = false) {
  let brand = {}, tpl = {};
  if (db) {
    try { const s = fresh ? await readSaved(db) : (await getConfig(db)).saved; brand = s.emailBrand || {}; tpl = (s.emailTpl || {})[id] || {}; } catch { /* chưa có cấu hình */ }
  }
  return { brand: cleanBrand(brand), style: cleanTplStyle(tpl) };
}

/** Bộ màu + kiểu dáng dùng để dựng email. opts.brand / opts.style: bản đang sửa dở (xem trước), không có thì lấy bản đã lưu */
export async function getBrand(db, id = '', opts = {}) {
  const saved = opts.brand && opts.style ? null : await getSavedStyle(db, id);
  const b = opts.brand ? cleanBrand(opts.brand) : saved.brand;
  const t = opts.style ? cleanTplStyle(opts.style) : saved.style;
  const a = t.accent || b.color;
  const dark = b.bg === 'dark', plain = b.bg === 'plain';
  return {
    ...BRAND, ...b, a, b: b.color2, tint: mixWhite(a, 0.1), tintBg: mixWhite(a, 0.14), shadow: rgba(a, 0.35),
    fontStack: FONTS[b.font], icon: t.icon, banner: t.banner, hideIcon: t.hideIcon || b.iconStyle === 'none',
    pageBg: dark ? '#0f1226' : plain ? '#ffffff' : BRAND.bg, pageGrad: dark ? '#1b1f3d' : plain ? '#ffffff' : mixWhite(a, 0.14),
    headText: dark ? '#ffffff' : BRAND.ink, footText: dark ? '#9aa1c6' : BRAND.muted, cardBorder: dark ? 'rgba(255,255,255,.08)' : BRAND.line,
    cardShadow: plain ? '0 4px 14px rgba(40,36,90,.06)' : '0 14px 40px rgba(40,36,90,.08)'
  };
}

/** Mẫu đang dùng = mặc định trong file + phần admin đã sửa. */
export async function getTemplate(db, id) {
  const base = TEMPLATES[id];
  if (!base) throw new Error('Không có mẫu email: ' + id);
  let saved = null;
  if (db) {
    try { saved = await db.prepare('SELECT * FROM email_templates WHERE id = ?').bind(id).first(); } catch { /* chưa có bảng */ }
  }
  const t = { ...base };
  if (saved) for (const f of FIELDS) if (saved[f] !== null && saved[f] !== undefined) t[f] = saved[f];
  return { template: t, customized: !!saved, updatedAt: saved?.updated_at || null, updatedBy: saved?.updated_by || null };
}

/**
 * Quill 2 lưu mọi danh sách dạng <ol><li data-list="bullet|ordered"> kèm thẻ <span class="ql-ui"> thừa:
 * để nguyên thì danh sách gạch đầu dòng trong email bị hiện số thứ tự. Đổi lại thành <ul> / <ol> chuẩn.
 */
export function normalizeQuill(html) {
  return String(html || '')
    .replace(/<span class="ql-ui"[^>]*><\/span>/g, '')
    .replace(/<ol>([\s\S]*?)<\/ol>/g, (m, inner) => {
      const items = inner.match(/<li[^>]*>[\s\S]*?<\/li>/g);
      if (!items) return m;
      let out = '', cur = '', buf = '';
      const flush = () => { if (buf) out += `<${cur}>${buf}</${cur}>`; buf = ''; };
      for (const li of items) {
        const kind = /data-list="bullet"/.test(li) ? 'ul' : 'ol';
        if (kind !== cur) { flush(); cur = kind; }
        buf += li.replace(/ data-list="[a-z]+"/g, '');
      }
      flush();
      return out;
    });
}

/** Làm sạch HTML từ trình soạn thảo: bỏ script/iframe/sự kiện. */
export function cleanBody(html) {
  return normalizeQuill(html)
    .replace(/<\s*(script|iframe|object|embed|style|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function inlineStyles(html, B = BRAND) {
  const S = {
    p: `margin:0 0 14px;font-size:15px;line-height:1.7;color:${BRAND.text};`,
    h1: `margin:0 0 12px;font-size:22px;line-height:1.3;color:${BRAND.ink};`,
    h2: `margin:0 0 10px;font-size:19px;line-height:1.35;color:${BRAND.ink};`,
    h3: `margin:0 0 8px;font-size:16px;line-height:1.4;color:${BRAND.ink};`,
    ul: `margin:0 0 14px;padding-left:22px;color:${BRAND.text};`,
    ol: `margin:0 0 14px;padding-left:22px;color:${BRAND.text};`,
    li: `margin:0 0 6px;font-size:15px;line-height:1.6;`,
    a: `color:${B.a};font-weight:600;text-decoration:underline;`,
    blockquote: `margin:0 0 14px;padding:10px 14px;border-left:3px solid ${B.a};background:${B.tint};color:${BRAND.text};border-radius:0 8px 8px 0;`
  };
  return html
    .replace(/class="ql-align-(center|right|justify)"/g, 'style="text-align:$1"')
    .replace(/class="ql-indent-(\d)"/g, (_, n) => `style="padding-left:${n * 2}em"`)
    .replace(/<(p|h1|h2|h3|ul|ol|li|a|blockquote)(\s[^>]*)?>/gi, (m, tag, attrs = '') => {
      const base = S[tag.toLowerCase()];
      if (/style="/i.test(attrs)) return `<${tag}${attrs.replace(/style="/i, `style="${base}`)}>`;
      return `<${tag} style="${base}"${attrs}>`;
    });
}

function fill(str, vars, { html = false } = {}) {
  return String(str || '').replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k) => {
    const v = vars[k];
    if (v === undefined || v === null) return '';
    return html ? esc(v) : String(v);
  });
}

const SOCIAL_LABEL = { website: 'Website', facebook: 'Facebook', zalo: 'Zalo', youtube: 'YouTube', tiktok: 'TikTok' };

function layout({ icon, preheader, heading, bodyHtml, buttonText, buttonUrl, note, appName, appUrl, year, B = BRAND }) {
  const R = B.radius ?? 22, center = B.align === 'center';
  const btnR = { pill: 999, round: 14, square: 4 }[B.btnShape] ?? 14;
  const outline = B.btnStyle === 'outline', solid = B.btnStyle === 'solid';
  const btnBg = outline ? '#ffffff' : B.a, btnBgImg = B.btnStyle === 'gradient' ? `background-image:linear-gradient(135deg,${B.a},${B.b});` : '';
  const btnShadow = outline ? '' : `box-shadow:0 8px 20px ${B.shadow};`;
  const btn = buttonText && buttonUrl ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" ${center ? 'align="center"' : ''} style="margin:26px ${center ? 'auto' : '0'} 8px;"><tr>
      <td align="center" bgcolor="${btnBg}" style="border-radius:${btnR}px;background:${btnBg};${btnBgImg}${btnShadow}${outline ? `border:2px solid ${B.a};` : ''}">
        <a href="${esc(buttonUrl)}" target="_blank" style="display:inline-block;padding:${outline ? 13 : 15}px 34px;font-size:15px;font-weight:700;color:${outline ? B.a : '#ffffff'};text-decoration:none;border-radius:${btnR}px;letter-spacing:.2px;">${esc(buttonText)} &rarr;</a>
      </td></tr></table>
    ${B.fallback === false ? '' : `<p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:${BRAND.muted};${center ? 'text-align:center;' : ''}">Nút không bấm được? Mở liên kết này:<br><a href="${esc(buttonUrl)}" style="color:${B.b};word-break:break-all;">${esc(buttonUrl)}</a></p>`}` : '';
  const noteBox = note ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr>
      <td style="background:#f7f7fc;border:1px solid ${BRAND.line};border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:${BRAND.muted};">💡 ${esc(note)}</td></tr></table>` : '';
  const iconShape = B.iconStyle === 'circle' ? '50%' : '18px';
  const iconBox = B.hideIcon ? '' : `<div style="width:58px;height:58px;line-height:58px;border-radius:${iconShape};background:${B.tint};text-align:center;font-size:28px;margin:0 ${center ? 'auto' : '0'} 20px;">${esc(B.icon || icon || '✉️')}</div>`;
  const logoCell = B.logoUrl
    ? `<td><img src="${esc(B.logoUrl)}" alt="${esc(appName)}" height="40" style="display:block;height:40px;width:auto;max-width:180px;border:0;"></td>`
    : `<td width="40" height="40" align="center" bgcolor="${B.a}" style="border-radius:12px;background:${B.a};background-image:linear-gradient(135deg,${B.a},${B.b});color:#fff;font-size:20px;font-weight:800;">${esc(B.logo)}</td>`;
  const social = Object.entries(B.social || {}).filter(([, u]) => u).map(([k, u]) => `<a href="${esc(u)}" style="color:${B.a};text-decoration:none;font-weight:600;">${SOCIAL_LABEL[k]}</a>`).join(' &nbsp;·&nbsp; ');
  const banner = B.banner ? `<img src="${esc(B.banner)}" alt="" width="580" style="display:block;width:100%;height:auto;border:0;">` : '';
  const bar = B.accentBar === false ? '' : `<div style="height:6px;background:${B.a};background-image:linear-gradient(90deg,${B.a},${B.b});"></div>`;
  return `<!doctype html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><title>${esc(heading)}</title>
<style>@media (max-width:620px){.card{padding:28px 22px!important}.h1{font-size:23px!important}}</style></head>
<body style="margin:0;padding:0;background:${B.pageBg};-webkit-font-smoothing:antialiased;font-family:${B.fontStack || FONTS.modern};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${B.pageBg};background-image:linear-gradient(180deg,${B.pageGrad} 0%,${B.pageBg} 260px);">
<tr><td align="center" style="padding:36px 14px 28px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;">
    <tr><td style="padding:0 6px 20px;" ${center ? 'align="center"' : ''}>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" ${center ? 'align="center"' : ''}><tr>
        ${logoCell}
        <td style="padding-left:11px;font-size:20px;font-weight:800;letter-spacing:-.3px;color:${B.headText};">${esc(appName)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:${R}px;border:1px solid ${B.cardBorder};box-shadow:${B.cardShadow};overflow:hidden;">
      ${banner}${bar}
      <div class="card" style="padding:38px 40px 34px;${center ? 'text-align:center;' : ''}">
        ${iconBox}
        <h1 class="h1" style="margin:0 0 16px;font-size:26px;line-height:1.25;letter-spacing:-.5px;color:${BRAND.ink};">${esc(heading)}</h1>
        ${bodyHtml}
        ${btn}
        ${noteBox}
      </div>
    </td></tr>
    <tr><td style="padding:22px 10px 0;text-align:center;font-size:12px;line-height:1.7;color:${B.footText};">
      <a href="${esc(appUrl)}" style="color:${B.footText};text-decoration:none;font-weight:600;">${esc(appName)}</a>${B.tagline ? ' · ' + esc(B.tagline) : ''}<br>
      ${social ? social + '<br>' : ''}${B.footer ? esc(B.footer) + '<br>' : ''}${B.support ? `Cần hỗ trợ? <a href="mailto:${esc(B.support)}" style="color:${B.a};text-decoration:none;font-weight:600;">${esc(B.support)}</a><br>` : ''}
      Email tự động, vui lòng không trả lời thư này. © ${year} ${esc(appName)}
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

function toText(t, vars, bodyHtml) {
  const body = bodyHtml.replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(p|h1|h2|h3|ul|ol|blockquote|tr)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/td>/gi, '\t')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
  const url = fill(t.button_url, vars);
  return [fill(t.heading, vars), '', body, url ? `\n${fill(t.button_text, vars)}: ${url}` : '', t.note ? `\n${fill(t.note, vars)}` : ''].join('\n').trim();
}

/** Bảng chi tiết đơn hàng dùng cho biến {{order_table}} */
export function orderTable(rows) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 16px;border:1px solid ${BRAND.line};border-radius:14px;border-collapse:separate;overflow:hidden;">
    ${rows.map(([k, v], i) => `<tr><td style="padding:11px 16px;font-size:13.5px;color:${BRAND.muted};${i ? `border-top:1px solid ${BRAND.line};` : ''}">${esc(k)}</td>
      <td align="right" style="padding:11px 16px;font-size:14px;font-weight:700;color:${BRAND.ink};${i ? `border-top:1px solid ${BRAND.line};` : ''}">${esc(v)}</td></tr>`).join('')}
  </table>`;
}

/**
 * Dựng email. vars: biến riêng của mẫu. ctx: { appName, appUrl, name, email }.
 * draft: (tùy chọn) nội dung đang sửa, dùng cho xem trước trong trang Quản trị.
 * opts: { brand, style } giao diện đang sửa dở (xem trước / gửi thử), không có thì dùng bản đã lưu.
 */
export async function renderEmail(db, id, vars = {}, ctx = {}, draft = null, opts = {}) {
  const { template } = await getTemplate(db, id);
  const B = await getBrand(db, id, opts || {});
  const t = { ...template, ...(draft || {}) };
  const all = {
    app_name: ctx.appName || 'TXA Voice', app_url: ctx.appUrl || '', name: ctx.name || 'bạn', email: ctx.email || '',
    year: new Date().getFullYear(), ...vars
  };
  const blocks = Object.entries(TEMPLATES[id].variables || {}).filter(([, v]) => v.block).map(([k]) => k);
  let body = cleanBody(t.body);
  for (const k of blocks) {
    const html = all[k] || '';
    body = body.replace(new RegExp(`<p[^>]*>\\s*\\{\\{\\s*${k}\\s*\\}\\}\\s*</p>`, 'gi'), html).replace(new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'gi'), html);
  }
  body = fill(body, Object.fromEntries(Object.entries(all).filter(([k]) => !blocks.includes(k))), { html: true });
  body = body.replace(/<p[^>]*>(\s|<br\s*\/?>)*<\/p>/gi, ''); // bỏ đoạn trống (vd biến rỗng)
  const bodyHtml = inlineStyles(body, B);
  const buttonUrl = fill(t.button_url, all);
  return {
    subject: fill(t.subject, all).replace(/[\r\n]+/g, ' ').trim(),
    preheader: fill(t.preheader, all),
    html: layout({
      icon: TEMPLATES[id].icon, preheader: fill(t.preheader, all), heading: fill(t.heading, all), bodyHtml,
      buttonText: fill(t.button_text, all), buttonUrl: /^https?:\/\//i.test(buttonUrl) ? buttonUrl : '',
      note: fill(t.note, all), appName: all.app_name, appUrl: all.app_url, year: all.year, B
    }),
    text: toText(t, all, bodyHtml)
  };
}

/** Biến mẫu để xem trước / gửi thử */
export function sampleVars(id) {
  const out = Object.fromEntries(Object.entries({ ...GLOBAL_VARS, ...(TEMPLATES[id]?.variables || {}) }).map(([k, v]) => [k, v.sample]));
  if (id === 'receipt') {
    out.order_table = orderTable([['Mã đơn', '#2417408642803'], ['Gói', 'Premium 3 tháng'], ['Số tiền', '129.000đ'], ['Nội dung chuyển khoản', 'VK8642803'], ['Hiệu lực đến', '17/01/2027']]);
  }
  return out;
}
