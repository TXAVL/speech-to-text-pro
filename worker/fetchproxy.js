// GET /api/fetch-proxy?url=...: tải hộ file âm thanh / video / playlist HLS khi trang gốc chặn CORS.
// Chỉ phục vụ chính website (Sec-Fetch-Site), chặn địa chỉ nội bộ, không trả trang HTML, giới hạn dung lượng mỗi file.
const MAX_BYTES = 80 * 1024 * 1024;

function blockedHost(host) {
  host = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.includes(':')) return host === '::1' || host === '::' || /^f[cd]/.test(host) || /^fe80/.test(host) || host.startsWith('::ffff:');
  return false;
}

const text = (msg, status) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

export async function handleFetchProxy(request) {
  if (request.method !== 'GET') return text('Phương thức không hỗ trợ.', 405);
  const site = request.headers.get('Sec-Fetch-Site');
  if (site && site !== 'same-origin') return text('Chỉ dùng được từ chính website.', 403);

  let target;
  try { target = new URL(new URL(request.url).searchParams.get('url') || ''); } catch { return text('Link không hợp lệ.', 400); }
  if (!/^https?:$/.test(target.protocol) || target.username || target.password) return text('Chỉ hỗ trợ link http/https.', 400);
  if (blockedHost(target.hostname) || (target.port && !['80', '443', '8080', '8443'].includes(target.port))) return text('Không được tải từ địa chỉ này.', 403);

  let upstream;
  try {
    upstream = await fetch(target.href, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': target.origin + '/',
        ...(request.headers.get('Range') ? { Range: request.headers.get('Range') } : {})
      }
    });
  } catch (e) {
    return text('Không kết nối được tới link: ' + (e.message || 'lỗi mạng'), 502);
  }
  if (!upstream.ok) return text(`Link trả về lỗi ${upstream.status}. Link HLS thường có hạn dùng, hãy lấy link mới.`, upstream.status === 404 ? 404 : 502);

  const type = upstream.headers.get('Content-Type') || 'application/octet-stream';
  if (/text\/html|application\/xhtml/i.test(type)) return text('Link này là trang web, không phải file âm thanh/video.', 415);
  const len = Number(upstream.headers.get('Content-Length') || 0);
  if (len > MAX_BYTES) return text(`File quá lớn (${Math.round(len / 1048576)} MB, tối đa ${MAX_BYTES / 1048576} MB qua máy chủ). Hãy tải về máy rồi kéo thả vào.`, 413);

  // Đếm byte khi truyền để chặn file không khai báo Content-Length
  let seen = 0;
  const limiter = new TransformStream({
    transform(chunk, ctrl) {
      seen += chunk.byteLength;
      if (seen > MAX_BYTES) ctrl.error(new Error('File quá lớn'));
      else ctrl.enqueue(chunk);
    }
  });
  const headers = new Headers({ 'Content-Type': type, 'Cache-Control': 'private, max-age=300' });
  if (len) headers.set('Content-Length', String(len));
  const contentRange = upstream.headers.get('Content-Range');
  if (contentRange) headers.set('Content-Range', contentRange);
  return new Response(upstream.body.pipeThrough(limiter), { status: upstream.status === 206 ? 206 : 200, headers });
}
