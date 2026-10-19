// payOS cho Cloudflare Worker (WebCrypto). Cùng cách ký / xác thực như project PAYOS.
// Secret: PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY, PAYOS_DESC_MAX (9 hoặc 25)
const PAYOS_API = 'https://api-merchant.payos.vn';
const enc = new TextEncoder();

export const payosConfigured = (env) => !!(env.PAYOS_CLIENT_ID && env.PAYOS_API_KEY && env.PAYOS_CHECKSUM_KEY);

async function hmac(env, str) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env.PAYOS_CHECKSUM_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(str)))].map(b => b.toString(16).padStart(2, '0')).join('');
}

const sortKeys = (obj) => Object.keys(obj).sort().reduce((a, k) => ((a[k] = obj[k]), a), {});

export async function verifyWebhook(env, data, signature) {
  const sorted = sortKeys(data || {});
  const str = Object.keys(sorted)
    .filter(k => sorted[k] !== undefined)
    .map(k => {
      let v = sorted[k];
      if (Array.isArray(v)) v = JSON.stringify(v.map(sortKeys));
      if ([null, 'null', 'undefined'].includes(v)) v = '';
      return `${k}=${v}`;
    })
    .join('&');
  const expected = await hmac(env, str);
  if (typeof signature !== 'string' || signature.length !== expected.length) return false;
  let r = 0;
  for (let i = 0; i < expected.length; i++) r |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return r === 0;
}

async function call(env, method, path, body) {
  const res = await fetch(PAYOS_API + path, {
    method,
    headers: { 'x-client-id': env.PAYOS_CLIENT_ID, 'x-api-key': env.PAYOS_API_KEY, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (json.code !== '00') throw new Error(`payOS ${json.code || res.status}: ${json.desc || 'Lỗi không xác định'}`);
  return json.data;
}

/** orderCode: số nguyên duy nhất, an toàn trong Number (≤ 15 chữ số). */
export function newOrderCode() {
  const r = crypto.getRandomValues(new Uint16Array(1))[0] % 1000;
  return Number(String(Date.now()).slice(-10) + String(r).padStart(3, '0'));
}

/** Nội dung chuyển khoản: "VK" + đuôi mã đơn, vừa giới hạn ký tự của tài khoản. */
export function makeDescription(env, orderCode) {
  const max = Number(env.PAYOS_DESC_MAX || 9);
  return 'VK' + String(orderCode).slice(-(max - 2));
}

export async function createLink(env, { orderCode, amount, description, itemName, buyerName, buyerEmail, returnUrl, cancelUrl, ttlMin = 15 }) {
  const payload = {
    orderCode, amount, description, returnUrl, cancelUrl,
    items: [{ name: itemName, quantity: 1, price: amount }],
    buyerName: buyerName || undefined, buyerEmail: buyerEmail || undefined,
    expiredAt: Math.floor(Date.now() / 1000) + ttlMin * 60
  };
  payload.signature = await hmac(env, `amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`);
  const data = await call(env, 'POST', '/v2/payment-requests', payload);
  return { ...data, expiredAt: data.expiredAt || payload.expiredAt };
}

export const getLink = (env, orderCode) => call(env, 'GET', `/v2/payment-requests/${orderCode}`);
export const cancelLink = (env, orderCode, reason = 'Khach huy don') => call(env, 'POST', `/v2/payment-requests/${orderCode}/cancel`, { cancellationReason: reason });
export const confirmWebhook = (env, webhookUrl) => call(env, 'POST', '/confirm-webhook', { webhookUrl });
