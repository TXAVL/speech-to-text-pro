// Mẫu email HTML (bảng + CSS inline để hiển thị đẹp trên Gmail, Outlook, điện thoại) kèm bản văn bản thường.

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function layout({ preheader, title, intro, button, buttonUrl, after, footerNote }) {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f2f3f8;font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1e2e;">
<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f3f8;padding:32px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
    <tr><td style="padding:0 4px 18px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="width:40px;height:40px;border-radius:11px;background:#6f63ff;background-image:linear-gradient(135deg,#7c6cff,#22d3ee);text-align:center;color:#fff;font-size:20px;font-weight:700;">V</td>
        <td style="padding-left:10px;font-size:20px;font-weight:700;letter-spacing:-.3px;color:#1a1e2e;">Voice<span style="color:#0ea5c6;">Kit</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:#ffffff;border-radius:18px;border:1px solid #e3e6f0;padding:36px 34px;box-shadow:0 8px 30px rgba(30,40,90,.06);">
      <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#1a1e2e;">${esc(title)}</h1>
      <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#4a5170;">${intro}</p>
      ${button ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 26px;"><tr>
        <td style="border-radius:12px;background:#6f63ff;background-image:linear-gradient(135deg,#7c6cff,#5b8cff);">
          <a href="${esc(buttonUrl)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(button)}</a>
        </td></tr></table>
      <p style="margin:0 0 6px;font-size:12.5px;color:#7a819c;">Nút không bấm được? Dán đường dẫn này vào trình duyệt:</p>
      <p style="margin:0 0 22px;font-size:12.5px;word-break:break-all;"><a href="${esc(buttonUrl)}" style="color:#0e9ab8;">${esc(buttonUrl)}</a></p>` : ''}
      ${after ? `<p style="margin:0;font-size:14px;line-height:1.6;color:#4a5170;">${after}</p>` : ''}
    </td></tr>
    <tr><td style="padding:18px 8px 0;text-align:center;font-size:12px;line-height:1.6;color:#8a90a8;">
      ${footerNote ? esc(footerNote) + '<br>' : ''}Email tự động từ VoiceKit, vui lòng không trả lời thư này.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

export function verifyEmail({ name, url }) {
  const hi = name ? `Chào ${esc(name)},` : 'Chào bạn,';
  return {
    subject: 'Xác minh email tài khoản VoiceKit',
    html: layout({
      preheader: 'Bấm nút để kích hoạt tài khoản và mở khóa gói Miễn phí.',
      title: 'Xác minh địa chỉ email',
      intro: `${hi} cảm ơn bạn đã đăng ký VoiceKit. Bấm nút dưới đây để xác minh email và kích hoạt gói <b>Miễn phí</b> (50 lượt giọng Edge / CapCut mỗi ngày).`,
      button: 'Xác minh email', buttonUrl: url,
      after: 'Liên kết có hiệu lực trong 24 giờ.',
      footerNote: 'Nếu bạn không đăng ký, hãy bỏ qua email này.'
    }),
    text: `${name ? 'Chào ' + name : 'Chào bạn'},\n\nXác minh email tài khoản VoiceKit tại:\n${url}\n\nLiên kết có hiệu lực trong 24 giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.`
  };
}

export function resetEmail({ name, url }) {
  return {
    subject: 'Đặt lại mật khẩu VoiceKit',
    html: layout({
      preheader: 'Yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
      title: 'Đặt lại mật khẩu',
      intro: `${name ? 'Chào ' + esc(name) + ',' : 'Chào bạn,'} chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản này. Bấm nút dưới đây để tạo mật khẩu mới.`,
      button: 'Tạo mật khẩu mới', buttonUrl: url,
      after: 'Liên kết có hiệu lực trong 1 giờ và chỉ dùng được một lần. Sau khi đổi, mọi phiên đăng nhập cũ sẽ bị đăng xuất.',
      footerNote: 'Nếu bạn không yêu cầu, hãy bỏ qua email này. Mật khẩu hiện tại vẫn an toàn.'
    }),
    text: `Đặt lại mật khẩu VoiceKit tại:\n${url}\n\nLiên kết có hiệu lực 1 giờ, dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này.`
  };
}

export function welcomeEmail({ name, url }) {
  return {
    subject: 'Chào mừng bạn đến với VoiceKit 🎉',
    html: layout({
      preheader: 'Tài khoản đã kích hoạt. Đây là những gì bạn có thể làm.',
      title: 'Tài khoản đã sẵn sàng!',
      intro: `${name ? esc(name) + ', email' : 'Email'} của bạn đã được xác minh. Gói <b>Miễn phí</b> đã mở:<br><br>
        • Chuyển giọng nói thành văn bản bằng Whisper, không giới hạn<br>
        • 50 lượt đọc giọng Edge Neural / CapCut mỗi ngày<br>
        • Giọng Piper, Meta MMS chạy ngay trên máy, không giới hạn`,
      button: 'Mở VoiceKit', buttonUrl: url
    }),
    text: `Email của bạn đã được xác minh. Gói Miễn phí đã mở. Mở VoiceKit: ${url}`
  };
}

export function planEmail({ name, planName, expires, url }) {
  const until = expires ? ` đến hết ngày ${new Date(expires).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}` : '';
  return {
    subject: `Gói của bạn đã chuyển sang ${planName}`,
    html: layout({
      preheader: `Tài khoản đã được chuyển sang gói ${planName}.`,
      title: `Gói ${esc(planName)} đã kích hoạt`,
      intro: `${name ? 'Chào ' + esc(name) + ',' : 'Chào bạn,'} tài khoản VoiceKit của bạn đã được chuyển sang gói <b>${esc(planName)}</b>${esc(until)}.`,
      button: 'Xem gói của tôi', buttonUrl: url
    }),
    text: `Tài khoản VoiceKit của bạn đã chuyển sang gói ${planName}${until}. ${url}`
  };
}
