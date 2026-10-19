// Email xác minh tài khoản sau khi đăng ký
export default {
  id: 'verify',
  name: 'Xác minh email',
  description: 'Gửi ngay khi đăng ký, hoặc khi người dùng bấm "Gửi lại email xác minh".',
  icon: '✉️',
  subject: 'Xác minh email tài khoản {{app_name}}',
  preheader: 'Chỉ còn một bước nữa để mở gói Miễn phí.',
  heading: 'Xác minh địa chỉ email',
  body: '<p>Chào {{name}},</p><p>Cảm ơn bạn đã đăng ký <strong>{{app_name}}</strong>. Bấm nút bên dưới để xác minh email và mở gói <strong>Miễn phí</strong>: {{free_calls}} lượt giọng Edge Neural mỗi ngày, lưu lịch sử và dùng API key riêng.</p>',
  button_text: 'Xác minh email',
  button_url: '{{action_url}}',
  note: 'Liên kết có hiệu lực trong {{expires_hours}} giờ. Nếu bạn không đăng ký, hãy bỏ qua email này.',
  variables: {
    action_url: { desc: 'Liên kết xác minh', sample: 'https://voicekit.example/?verify=abc123' },
    expires_hours: { desc: 'Số giờ liên kết còn hiệu lực', sample: '24' },
    free_calls: { desc: 'Số lượt mỗi ngày của gói Miễn phí', sample: '50' }
  }
};
