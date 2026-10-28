// Thông báo Premium đã hết hạn (gửi tự động, một lần cho mỗi kỳ hạn)
export default {
  id: 'premium_expired',
  name: 'Premium đã hết hạn',
  description: 'Gửi tự động lúc 9h sáng sau khi Premium hết hạn, kèm lời mời quay lại.',
  icon: '💤',
  subject: 'Premium của bạn đã hết hạn',
  preheader: 'Tài khoản đã chuyển về gói Miễn phí. Gia hạn để dùng lại đầy đủ tính năng.',
  heading: 'Premium đã hết hạn',
  body: '<p>Chào {{name}},</p><p>Gói <strong>Premium</strong> của bạn đã hết hạn vào <strong>{{expired_date}}</strong> và tài khoản đã chuyển về gói <strong>Miễn phí</strong>. Lịch sử và lượt mua thêm của bạn vẫn còn nguyên.</p><p>Muốn dùng lại kho giọng CapCut, tách giọng, studio phụ đề video và hạn mức lớn? Gia hạn chỉ mất vài giây.</p>',
  button_text: 'Gia hạn Premium',
  button_url: '{{app_url}}',
  note: '',
  variables: {
    expired_date: { desc: 'Ngày Premium hết hạn', sample: '28/10/2026' }
  }
};
