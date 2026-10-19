// Email đặt lại mật khẩu
export default {
  id: 'reset',
  name: 'Đặt lại mật khẩu',
  description: 'Gửi khi người dùng bấm "Quên mật khẩu" hoặc admin gửi giúp.',
  icon: '🔐',
  subject: 'Đặt lại mật khẩu {{app_name}}',
  preheader: 'Yêu cầu đặt lại mật khẩu cho tài khoản {{email}}.',
  heading: 'Đặt lại mật khẩu',
  body: '<p>Chào {{name}},</p><p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản <strong>{{email}}</strong>. Bấm nút bên dưới để tạo mật khẩu mới.</p><p>Sau khi đổi, mọi phiên đăng nhập cũ trên các thiết bị khác sẽ tự đăng xuất.</p>',
  button_text: 'Tạo mật khẩu mới',
  button_url: '{{action_url}}',
  note: 'Liên kết có hiệu lực trong {{expires_minutes}} phút và chỉ dùng được một lần. Nếu bạn không yêu cầu, hãy bỏ qua email này, mật khẩu hiện tại vẫn an toàn.',
  variables: {
    action_url: { desc: 'Liên kết đặt lại mật khẩu', sample: 'https://voicekit.example/?reset=abc123' },
    expires_minutes: { desc: 'Số phút liên kết còn hiệu lực', sample: '60' }
  }
};
