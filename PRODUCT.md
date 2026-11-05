# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Hai nhóm, không ưu tiên nhóm nào: (1) người làm nội dung Việt (video, podcast, sách nói, review phim, TikTok/livestream) cần chuyển giọng ⇄ chữ, lồng tiếng và phụ đề nhanh, rẻ; (2) nhân viên văn phòng và học sinh gỡ băng họp, bài giảng, đọc văn bản dài thành giọng.

## Product Purpose
Website chuyển giọng nói thành văn bản (STT) và đọc văn bản thành giọng nói (TTS), kèm lồng tiếng video tự động. Có tài khoản và các gói Khách / Miễn phí / Premium. Thành công = người dùng ra file chữ, giọng hoặc video lồng tiếng dùng được ngay, và đủ tin để nâng lên Premium.

## Positioning
Hai điểm cùng lúc: AI chạy ngay trong trình duyệt (Whisper, Piper, MMS) nên miễn phí và riêng tư; Premium mở thêm kho giọng phong phú (VieNeu-TTS v3 Turbo, CapCut/TikTok, Supertonic, Edge), model STT mạnh và lồng tiếng video tự động, tất cả trong một nơi, ưu tiên tiếng Việt.

## Operating Context
Chạy hoàn toàn trên Cloudflare gói free (Worker, D1, assets tĩnh). Thanh toán qua payOS, email qua SMTP. Quản trị viên cấp Premium và cộng lượt trong trang Quản trị. Lượt TTS qua máy chủ tính theo ngày, làm mới 0h giờ Việt Nam, lượt lỗi được hoàn lại.

## Capabilities and Constraints
- STT trong trình duyệt (Transformers.js, WebGPU/CPU), tách giọng khỏi nhạc nền, tab dán link/HLS.
- TTS: Edge (mọi gói), VieNeu-TTS v3 Turbo, VieNeu Studio Pro, Supertonic 3, CapCut (Premium), Piper/MMS (trong trình duyệt).
- VieNeu v3 Turbo chạy bằng GPU dùng chung nên có lúc bận hoặc hết hạn mức; giao diện phải báo rõ và hoàn lượt. Nội dung hiển thị cho người dùng không nhắc nguồn hạ tầng (không ghi "Space").
- VieNeu v4 là bản độc quyền chỉ qua API vieneu.io, chưa tích hợp.
- Gói Khách/Miễn phí có giới hạn ký tự và câu ghi nguồn; Premium được miễn.

## Brand Commitments
Tên thương hiệu chính thức: **TXA Voice**. Tên cũ "VoiceKit" đã được đổi hết ở chữ hiển thị, comment, tên file xuất. Giữ nguyên định danh kỹ thuật `voicekit` (tên database D1, IndexedDB) để không mất dữ liệu.

## Evidence on Hand
Không có testimonial, số liệu khách hàng hay case study thật trong repo; không được bịa. Có sẵn: README mô tả gói và tính năng, trang Quản trị, hóa đơn/biên nhận, mẫu email.

## Product Principles
- Miễn phí thật, chạy trên máy người dùng: đây là lý do tin tưởng, không bị hạ cấp thành bản dùng thử.
- Premium bán chất lượng và tiện lợi (giọng, model, lồng tiếng), không bán thứ miễn phí đã có.
- Tiếng Việt là ưu tiên số một: giọng, thuật ngữ, thông báo.
- Lỗi hạ tầng phải nói thẳng, có đường thoát (thử lại, kho giọng khác) và không mất lượt của người dùng.

## Accessibility & Inclusion
Chưa có tiêu chuẩn bắt buộc riêng. Tôn trọng prefers-reduced-motion như đã làm ở thẻ báo bận VieNeu.
