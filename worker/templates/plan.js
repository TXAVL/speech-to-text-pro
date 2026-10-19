// Email báo đổi gói (admin cấp / gia hạn / hạ gói)
export default {
  id: 'plan',
  name: 'Thông báo đổi gói',
  description: 'Gửi khi admin đổi gói của người dùng và chọn "Báo qua email".',
  icon: '⭐',
  subject: 'Gói của bạn đã chuyển sang {{plan_name}}',
  preheader: 'Tài khoản {{email}} đã được chuyển sang gói {{plan_name}}.',
  heading: 'Gói {{plan_name}} đã kích hoạt',
  body: '<p>Chào {{name}},</p><p>Tài khoản {{app_name}} của bạn đã được chuyển sang gói <strong>{{plan_name}}</strong>, hiệu lực đến <strong>{{expires_date}}</strong>.</p>',
  button_text: 'Xem gói của tôi',
  button_url: '{{app_url}}',
  note: '',
  variables: {
    plan_name: { desc: 'Tên gói mới', sample: 'Premium' },
    expires_date: { desc: 'Ngày hết hạn (hoặc "vĩnh viễn")', sample: '19/11/2026' }
  }
};
