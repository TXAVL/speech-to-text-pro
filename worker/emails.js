// Dựng email từ mẫu (worker/templates/*.js, admin có thể sửa trong D1) + khung HTML đẹp, tương thích Gmail / Outlook / điện thoại.
// Biến: {{ten_bien}}. Biến khối (vd {{order_table}}) chèn nguyên HTML.
import { TEMPLATES, GLOBAL_VARS, FIELDS } from './templates/index.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BRAND = { a: '#6d5dfc', b: '#0ea5c6', ink: '#161a2e', text: '#3f4660', muted: '#7b819b', line: '#e7e8f2', bg: '#f3f2fb' };

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

/** Làm sạch HTML từ trình soạn thảo: bỏ script/iframe/sự kiện. */
export function cleanBody(html) {
  return String(html || '')
    .replace(/<\s*(script|iframe|object|embed|style|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\s*(script|iframe|object|embed|link|meta)[^>]*\/?>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
}

function inlineStyles(html) {
  const S = {
    p: `margin:0 0 14px;font-size:15px;line-height:1.7;color:${BRAND.text};`,
    h1: `margin:0 0 12px;font-size:22px;line-height:1.3;color:${BRAND.ink};`,
    h2: `margin:0 0 10px;font-size:19px;line-height:1.35;color:${BRAND.ink};`,
    h3: `margin:0 0 8px;font-size:16px;line-height:1.4;color:${BRAND.ink};`,
    ul: `margin:0 0 14px;padding-left:22px;color:${BRAND.text};`,
    ol: `margin:0 0 14px;padding-left:22px;color:${BRAND.text};`,
    li: `margin:0 0 6px;font-size:15px;line-height:1.6;`,
    a: `color:${BRAND.a};font-weight:600;text-decoration:underline;`,
    blockquote: `margin:0 0 14px;padding:10px 14px;border-left:3px solid ${BRAND.a};background:#f6f5ff;color:${BRAND.text};border-radius:0 8px 8px 0;`
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

function layout({ icon, preheader, heading, bodyHtml, buttonText, buttonUrl, note, appName, appUrl, year }) {
  const btn = buttonText && buttonUrl ? `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:26px 0 8px;"><tr>
      <td align="center" bgcolor="${BRAND.a}" style="border-radius:14px;background:${BRAND.a};background-image:linear-gradient(135deg,${BRAND.a},#5b8cff);box-shadow:0 8px 20px rgba(109,93,252,.35);">
        <a href="${esc(buttonUrl)}" target="_blank" style="display:inline-block;padding:15px 34px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;letter-spacing:.2px;">${esc(buttonText)} &rarr;</a>
      </td></tr></table>
    <p style="margin:14px 0 0;font-size:12.5px;line-height:1.6;color:${BRAND.muted};">Nút không bấm được? Mở liên kết này:<br><a href="${esc(buttonUrl)}" style="color:${BRAND.b};word-break:break-all;">${esc(buttonUrl)}</a></p>` : '';
  const noteBox = note ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;"><tr>
      <td style="background:#f7f7fc;border:1px solid ${BRAND.line};border-radius:12px;padding:14px 16px;font-size:13px;line-height:1.6;color:${BRAND.muted};">💡 ${esc(note)}</td></tr></table>` : '';
  return `<!doctype html>
<html lang="vi" xmlns="http://www.w3.org/1999/xhtml"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light only"><title>${esc(heading)}</title>
<style>@media (max-width:620px){.card{padding:28px 22px!important}.h1{font-size:23px!important}}</style></head>
<body style="margin:0;padding:0;background:${BRAND.bg};-webkit-font-smoothing:antialiased;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};background-image:linear-gradient(180deg,#ece9ff 0%,${BRAND.bg} 260px);">
<tr><td align="center" style="padding:36px 14px 28px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;">
    <tr><td style="padding:0 6px 20px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td width="40" height="40" align="center" bgcolor="${BRAND.a}" style="border-radius:12px;background:${BRAND.a};background-image:linear-gradient(135deg,${BRAND.a},${BRAND.b});color:#fff;font-size:20px;font-weight:800;">V</td>
        <td style="padding-left:11px;font-size:20px;font-weight:800;letter-spacing:-.3px;color:${BRAND.ink};">${esc(appName)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:22px;border:1px solid ${BRAND.line};box-shadow:0 14px 40px rgba(40,36,90,.08);overflow:hidden;">
      <div style="height:6px;background:${BRAND.a};background-image:linear-gradient(90deg,${BRAND.a},${BRAND.b});border-radius:22px 22px 0 0;"></div>
      <div class="card" style="padding:38px 40px 34px;">
        <div style="width:58px;height:58px;line-height:58px;border-radius:18px;background:#f1efff;text-align:center;font-size:28px;margin:0 0 20px;">${icon || '✉️'}</div>
        <h1 class="h1" style="margin:0 0 16px;font-size:26px;line-height:1.25;letter-spacing:-.5px;color:${BRAND.ink};">${esc(heading)}</h1>
        ${bodyHtml}
        ${btn}
        ${noteBox}
      </div>
    </td></tr>
    <tr><td style="padding:22px 10px 0;text-align:center;font-size:12px;line-height:1.7;color:${BRAND.muted};">
      <a href="${esc(appUrl)}" style="color:${BRAND.muted};text-decoration:none;font-weight:600;">${esc(appName)}</a> · Giọng nói ⇄ Văn bản<br>
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
 */
export async function renderEmail(db, id, vars = {}, ctx = {}, draft = null) {
  const { template } = await getTemplate(db, id);
  const t = { ...template, ...(draft || {}) };
  const all = {
    app_name: ctx.appName || 'VoiceKit', app_url: ctx.appUrl || '', name: ctx.name || 'bạn', email: ctx.email || '',
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
  const bodyHtml = inlineStyles(body);
  const buttonUrl = fill(t.button_url, all);
  return {
    subject: fill(t.subject, all).replace(/[\r\n]+/g, ' ').trim(),
    html: layout({
      icon: TEMPLATES[id].icon, preheader: fill(t.preheader, all), heading: fill(t.heading, all), bodyHtml,
      buttonText: fill(t.button_text, all), buttonUrl: /^https?:\/\//i.test(buttonUrl) ? buttonUrl : '',
      note: fill(t.note, all), appName: all.app_name, appUrl: all.app_url, year: all.year
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
