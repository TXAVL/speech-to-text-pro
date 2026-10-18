// SMTP client cho Cloudflare Worker (cloudflare:sockets). Không phụ thuộc thư viện ngoài.
// Cấu hình bằng secret/biến môi trường:
//   SMTP_HOST, SMTP_PORT (465 | 587), SMTP_SECURE (tls | starttls | none), SMTP_USER, SMTP_PASS,
//   SMTP_FROM ("VoiceKit <no-reply@ten-mien.com>"). Cloudflare chặn cổng 25, hãy dùng 587 hoặc 465.
import { connect } from 'cloudflare:sockets';

const enc = new TextEncoder();
const dec = new TextDecoder();

export function smtpConfigured(env) {
  return !!(env.SMTP_HOST && env.SMTP_FROM);
}

function b64(str) {
  const bytes = enc.encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n');
const encodeHeader = (s) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
const addrOf = (s) => (s.match(/<([^>]+)>/) || [null, s])[1].trim();

function formatFrom(from) {
  const m = from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${encodeHeader(m[1])} <${m[2]}>` : from;
}

function buildMessage({ from, to, subject, text, html, domain }) {
  const boundary = 'vk_' + crypto.randomUUID().replace(/-/g, '');
  const headers = [
    `From: ${formatFrom(from)}`,
    `To: <${to}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'X-Mailer: VoiceKit',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];
  const part = (type, body) => [`--${boundary}`, `Content-Type: ${type}; charset=UTF-8`, 'Content-Transfer-Encoding: base64', '', wrap76(b64(body))].join('\r\n');
  return headers.join('\r\n') + '\r\n\r\n' + part('text/plain', text) + '\r\n' + part('text/html', html) + `\r\n--${boundary}--\r\n`;
}

class SmtpSession {
  constructor(socket) { this.attach(socket); this.buf = ''; }
  attach(socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }
  release() { this.reader.releaseLock(); this.writer.releaseLock(); }

  async reply() {
    for (;;) {
      const lines = this.buf.split('\r\n');
      for (let i = 0; i < lines.length - 1; i++) {
        if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) {
          const all = lines.slice(0, i + 1);
          this.buf = lines.slice(i + 1).join('\r\n');
          return { code: Number(lines[i].slice(0, 3)), text: all.map(l => l.slice(4)).join('\n'), lines: all };
        }
      }
      const { value, done } = await this.reader.read();
      if (done) throw new Error('Máy chủ SMTP đóng kết nối.');
      this.buf += dec.decode(value, { stream: true });
    }
  }
  async send(line, expect, label = line.split(' ')[0]) {
    await this.writer.write(enc.encode(line + '\r\n'));
    const r = await this.reply();
    if (!expect.includes(r.code)) throw new Error(`SMTP ${label} lỗi ${r.code}: ${r.text}`);
    return r;
  }
}

export async function sendMail(env, { to, subject, text, html }) {
  if (!smtpConfigured(env)) throw new Error('Máy chủ chưa cấu hình SMTP.');
  const port = Number(env.SMTP_PORT || 587);
  const mode = (env.SMTP_SECURE || (port === 465 ? 'tls' : port === 587 ? 'starttls' : 'none')).toLowerCase();
  const fromAddr = addrOf(env.SMTP_FROM);
  const domain = fromAddr.split('@')[1] || 'voicekit.local';

  const socket = connect({ hostname: env.SMTP_HOST, port }, {
    secureTransport: mode === 'tls' ? 'on' : mode === 'starttls' ? 'starttls' : 'off',
    allowHalfOpen: false
  });
  const s = new SmtpSession(socket);
  const timeout = setTimeout(() => { try { socket.close(); } catch {} }, 25000);

  try {
    const greet = await s.reply();
    if (greet.code !== 220) throw new Error(`SMTP chào lỗi ${greet.code}: ${greet.text}`);
    let ehlo = await s.send(`EHLO ${domain}`, [250]);

    if (mode === 'starttls') {
      await s.send('STARTTLS', [220]);
      s.release();
      s.attach(socket.startTls());
      s.buf = '';
      ehlo = await s.send(`EHLO ${domain}`, [250]);
    }

    if (env.SMTP_USER) {
      const authLine = ehlo.lines.find(l => /^250[- ]AUTH/i.test(l)) || '';
      if (/PLAIN/i.test(authLine) || !/LOGIN/i.test(authLine)) {
        await s.send(`AUTH PLAIN ${b64(`\0${env.SMTP_USER}\0${env.SMTP_PASS || ''}`)}`, [235], 'AUTH');
      } else {
        await s.send('AUTH LOGIN', [334], 'AUTH');
        await s.send(b64(env.SMTP_USER), [334], 'AUTH');
        await s.send(b64(env.SMTP_PASS || ''), [235], 'AUTH');
      }
    }

    await s.send(`MAIL FROM:<${fromAddr}>`, [250]);
    await s.send(`RCPT TO:<${to}>`, [250, 251]);
    await s.send('DATA', [354]);
    const body = buildMessage({ from: env.SMTP_FROM, to, subject, text, html, domain })
      .replace(/\r\n\./g, '\r\n..'); // dot-stuffing
    await s.writer.write(enc.encode(body + '\r\n.\r\n'));
    const done = await s.reply();
    if (done.code !== 250) throw new Error(`SMTP gửi thư lỗi ${done.code}: ${done.text}`);
    try { await s.send('QUIT', [221]); } catch {}
  } finally {
    clearTimeout(timeout);
    try { socket.close(); } catch {}
  }
}
