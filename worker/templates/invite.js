// Email mời khi admin tạo tài khoản mà không đặt mật khẩu: người dùng bấm link để tự tạo mật khẩu
export default {
  id: 'invite',
  name: 'Lời mời tham gia',
  description: 'Gửi khi admin tạo tài khoản mới mà không đặt mật khẩu.',
  icon: '💌',
  subject: 'Bạn được mời dùng {{app_name}}',
  preheader: 'Tài khoản {{email}} đã sẵn sàng, chỉ cần tạo mật khẩu.',
  heading: 'Chào mừng bạn đến với {{app_name}}',
  body: '<p>Chào {{name}},</p><p>Quản trị viên đã tạo cho bạn một tài khoản <strong>{{app_name}}</strong> với gói <strong>{{plan_name}}</strong>. Bấm nút bên dưới để tạo mật khẩu và bắt đầu sử dụng.</p>',
  button_text: 'Tạo mật khẩu',
  button_url: '{{action_url}}',
  note: 'Liên kết có hiệu lực trong {{expires_hours}} giờ. Hết hạn thì dùng "Quên mật khẩu" ở trang đăng nhập để nhận liên kết mới.',
  variables: {
    action_url: { desc: 'Liên kết tạo mật khẩu', sample: 'https://voicekit.example/?reset=abc123' },
    expires_hours: { desc: 'Số giờ liên kết còn hiệu lực', sample: '72' },
    plan_name: { desc: 'Gói được cấp', sample: 'Premium' }
  }
};
