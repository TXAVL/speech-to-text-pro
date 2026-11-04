// Kiểm tra video YouTube có công khai không (dùng chung cho Cloudflare Worker và server.js).
// Chỉ nhận ID 11 ký tự nên không thể bị lợi dụng để gọi địa chỉ khác.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

export const isVideoId = (id) => /^[\w-]{11}$/.test(String(id || ''));

/**
 * Trả về { ok, status, title, author, thumbnail, seconds, live, error }.
 * status: public | unlisted | private | unavailable | restricted
 */
export async function checkYoutube(id) {
  if (!isVideoId(id)) return { ok: false, status: 'unavailable', error: 'Link YouTube không hợp lệ.' };

  // oEmbed: video riêng tư trả 401/403, đã xóa trả 404, công khai/không công khai trả 200
  let meta = null;
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent('https://www.youtube.com/watch?v=' + id)}`, { headers: { 'User-Agent': UA } });
    if (r.status === 401 || r.status === 403) return { ok: false, status: 'private', error: 'Video này ở chế độ riêng tư hoặc bị giới hạn, chỉ video công khai mới dùng được.' };
    if (r.status === 404) return { ok: false, status: 'unavailable', error: 'Không tìm thấy video (đã xóa hoặc link sai).' };
    if (r.ok) meta = await r.json();
  } catch { /* thử tiếp bằng trang xem */ }

  // Trang xem: phân biệt công khai / không công khai / giới hạn đăng nhập (có thể bị chặn, khi đó tin oEmbed)
  let seconds = 0, live = false, status = meta ? 'public' : 'unavailable', reason = '', title = meta?.title || '', author = meta?.author_name || '';
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=vi`, { headers: { 'User-Agent': UA, 'Accept-Language': 'vi,en;q=0.8', Cookie: 'CONSENT=YES+1; SOCS=CAI' } });
    if (r.ok) {
      const html = await r.text();
      const ps = html.match(/"playabilityStatus":\{"status":"([A-Z_]+)"(?:,"reason":"([^"]*)")?/);
      if (ps) {
        if (ps[1] === 'LOGIN_REQUIRED') { status = 'restricted'; reason = ps[2] || ''; }
        else if (ps[1] === 'UNPLAYABLE' || ps[1] === 'ERROR') { status = 'unavailable'; reason = ps[2] || ''; }
      }
      if (/"isUnlisted":true/.test(html)) status = status === 'public' || !meta ? 'unlisted' : status;
      seconds = Number((html.match(/"lengthSeconds":"(\d+)"/) || [])[1]) || 0;
      live = /"isLiveContent":true/.test(html) && (/"isLive":true/.test(html) || !seconds);
      if (!title) title = (html.match(/<meta name="title" content="([^"]*)"/) || [])[1] || '';
      if (!author) author = (html.match(/"ownerChannelName":"([^"]*)"/) || [])[1] || '';
    }
  } catch { /* bỏ qua */ }

  const base = { title, author, seconds, live, thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, status };
  if (status === 'unlisted') return { ok: false, ...base, error: 'Video này ở chế độ "Không công khai" (chỉ ai có link mới xem được). Chỉ video công khai mới dùng được.' };
  if (status === 'restricted') return { ok: false, ...base, error: 'Video yêu cầu đăng nhập (giới hạn độ tuổi / dành cho thành viên), không phải video công khai.' };
  if (status === 'unavailable') return { ok: false, ...base, error: reason ? `Video không xem được: ${reason}` : 'Video không khả dụng hoặc không công khai.' };
  if (live) return { ok: false, ...base, error: 'Đây là buổi phát trực tiếp đang diễn ra. Hãy đợi kết thúc rồi thử lại.' };
  return { ok: true, ...base };
}
