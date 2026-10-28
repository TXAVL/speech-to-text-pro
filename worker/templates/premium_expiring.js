// Nhắc gia hạn: gửi tự động mỗi ngày cho tài khoản Premium sắp hết hạn trong 3 ngày
export default {
  id: 'premium_expiring',
  name: 'Premium sắp hết hạn',
  description: 'Gửi tự động lúc 9h sáng cho tài khoản Premium còn 3 ngày nữa hết hạn (cần cấu hình APP_URL).',
  icon: '⏳',
  subject: 'Premium của bạn còn {{days_left}} ngày nữa hết hạn',
  preheader: 'Gia hạn trước {{expires_date}} để không bị gián đoạn.',
  heading: 'Premium sắp hết hạn',
  body: '<p>Chào {{name}},</p><p>Gói <strong>Premium</strong> của bạn sẽ hết hạn vào <strong>{{expires_date}}</strong> (còn {{days_left}} ngày). Sau ngày này tài khoản chuyển về gói Miễn phí: mất kho giọng CapCut, giọng Premium, tách giọng, studio phụ đề video và hạn mức lớn.</p><p>Gia hạn bây giờ, thời gian còn lại <strong>được cộng dồn</strong>, không bị mất ngày nào.</p>',
  button_text: 'Gia hạn Premium',
  button_url: '{{app_url}}',
  note: 'Lượt mua thêm vẫn được giữ nguyên kể cả khi gói hết hạn.',
  variables: {
    expires_date: { desc: 'Ngày Premium hết hạn', sample: '31/10/2026' },
    days_left: { desc: 'Số ngày còn lại', sample: '3' }
  }
};
