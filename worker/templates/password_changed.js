// Email báo mật khẩu vừa được đổi (bảo mật): gửi sau khi đổi mật khẩu hoặc đặt lại qua email
export default {
  id: 'password_changed',
  name: 'Đã đổi mật khẩu',
  description: 'Gửi ngay sau khi người dùng đổi mật khẩu hoặc đặt lại mật khẩu, để họ phát hiện nếu không phải mình làm.',
  icon: '🔐',
  subject: 'Mật khẩu {{app_name}} của bạn vừa được thay đổi',
  preheader: 'Nếu không phải bạn thực hiện, hãy đặt lại mật khẩu ngay.',
  heading: 'Mật khẩu đã được thay đổi',
  body: '<p>Chào {{name}},</p><p>Mật khẩu tài khoản <strong>{{email}}</strong> vừa được thay đổi vào lúc <strong>{{changed_at}}</strong>. Mọi thiết bị khác đã được đăng xuất.</p><p>Nếu chính bạn thực hiện thì không cần làm gì thêm. Nếu <strong>không phải bạn</strong>, hãy đặt lại mật khẩu ngay để khóa người lạ.</p>',
  button_text: 'Đặt lại mật khẩu',
  button_url: '{{app_url}}',
  note: 'Vì lý do bảo mật, chúng tôi không bao giờ hỏi mật khẩu của bạn qua email.',
  variables: {
    changed_at: { desc: 'Thời điểm đổi mật khẩu (giờ Việt Nam)', sample: '28/10/2026 09:15' }
  }
};
