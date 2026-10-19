// Proxy + cache file mô hình Hugging Face qua chính tên miền website.
// Trình duyệt tải /hf/<repo>/resolve/<rev>/<file> -> không bị CORS / giới hạn tải của Hugging Face,
// và Cloudflare cache lại nên người dùng sau tải nhanh hơn.
const ALLOWED = [/^onnx-community\/whisper-[a-z0-9.-]+$/i, /^Xenova\/mms-tts-vie$/i];

export async function handleHf(request, ctx, path) {
  if (path === '/hf/health') return new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

  const m = path.match(/^\/hf\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/);
  if (!m || !ALLOWED.some(re => re.test(m[1])) || m[3].includes('..')) return new Response('Not found', { status: 404 });

  const cache = caches.default;
  const key = new Request(new URL(path, request.url).toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) return hit;

  const upstream = await fetch(`https://huggingface.co/${m[1]}/resolve/${m[2]}/${m[3]}`, {
    redirect: 'follow', headers: { 'User-Agent': 'VoiceKit-Worker' }
  });
  if (!upstream.ok) {
    return new Response(`Hugging Face trả về ${upstream.status}`, { status: upstream.status === 404 ? 404 : 502 });
  }
  const headers = new Headers();
  for (const h of ['Content-Type', 'Content-Length', 'ETag']) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set('Cache-Control', 'public, max-age=2592000, immutable');
  headers.set('Access-Control-Allow-Origin', '*');
  const res = new Response(upstream.body, { status: 200, headers });
  // Cloudflare cache tối đa ~512 MB mỗi file
  const size = Number(upstream.headers.get('Content-Length') || 0);
  if (ctx && size && size < 500 * 1024 * 1024) {
    ctx.waitUntil(cache.put(key, res.clone()).catch(() => {}));
  }
  return res;
}
