// Email chào mừng sau khi xác minh thành công
export default {
  id: 'welcome',
  name: 'Chào mừng',
  description: 'Gửi ngay sau khi người dùng xác minh email thành công.',
  icon: '🎉',
  subject: 'Chào mừng bạn đến với {{app_name}} 🎉',
  preheader: 'Tài khoản đã kích hoạt. Đây là những gì bạn có thể làm.',
  heading: 'Tài khoản đã sẵn sàng!',
  body: '<p>Chào {{name}}, email của bạn đã được xác minh. Gói <strong>Miễn phí</strong> đã mở:</p><ul><li>Chuyển giọng nói thành văn bản bằng Whisper, không giới hạn</li><li>{{free_calls}} lượt giọng Edge Neural mỗi ngày</li><li>Giọng Piper, Meta MMS chạy ngay trên máy, không giới hạn</li><li>Lưu lịch sử chuyển đổi</li></ul><p>Muốn có kho giọng CapCut / TikTok và AI tóm tắt, dịch? Hãy thử gói <strong>Premium</strong>.</p>',
  button_text: 'Mở {{app_name}}',
  button_url: '{{app_url}}',
  note: '',
  variables: {
    free_calls: { desc: 'Số lượt mỗi ngày của gói Miễn phí', sample: '50' }
  }
};
