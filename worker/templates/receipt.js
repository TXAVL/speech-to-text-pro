// Biên lai sau khi thanh toán payOS thành công
export default {
  id: 'receipt',
  name: 'Biên lai thanh toán',
  description: 'Gửi khi đơn Premium được thanh toán (webhook, trang chờ hoặc admin kích hoạt tay).',
  icon: '🧾',
  subject: 'Biên lai thanh toán {{app_name}} #{{order_code}}',
  preheader: 'Đã nhận {{amount}} cho {{item_name}}.',
  heading: 'Thanh toán thành công',
  body: '<p>Cảm ơn {{name}}! <strong>{{item_name}}</strong> đã được kích hoạt vào tài khoản của bạn.</p><p>{{order_table}}</p><p>{{invoice_line}}</p>',
  button_text: 'Xem hóa đơn',
  button_url: '{{invoice_url}}',
  note: 'Hãy giữ email này làm biên lai thanh toán.',
  variables: {
    item_name: { desc: 'Tên sản phẩm (gói Premium hoặc số lượt mua thêm)', sample: 'Premium 3 tháng' },
    order_code: { desc: 'Mã đơn', sample: '2417408642803' },
    package_name: { desc: 'Tên gói đã mua', sample: '3 tháng' },
    amount: { desc: 'Số tiền (đã định dạng)', sample: '129.000đ' },
    description: { desc: 'Nội dung chuyển khoản', sample: 'VK8642803' },
    expires_date: { desc: 'Premium hiệu lực đến', sample: '17/01/2027' },
    paid_date: { desc: 'Thời điểm thanh toán', sample: '19/10/2026 20:43' },
    invoice_url: { desc: 'Liên kết xem / in hóa đơn', sample: 'https://voicekit.example/invoice/2417408642803' },
    invoice_line: { desc: 'Dòng báo đã ghi nhận thông tin xuất hóa đơn (trống nếu không yêu cầu)', sample: 'Thông tin xuất hóa đơn cho CÔNG TY ABC (MST 0101234567) đã được ghi nhận.' },
    order_table: { desc: 'Bảng chi tiết đơn hàng (khối HTML có sẵn)', sample: '', block: true }
  }
};
