# VoiceKit — Giọng nói ⇄ Văn bản

Website chuyển giọng nói thành văn bản và đọc văn bản thành giọng nói. Có tài khoản, các gói Khách / Miễn phí / Premium, email xác minh và quên mật khẩu qua SMTP. Toàn bộ chạy trên Cloudflare (gói free), không cần server riêng.

## Deploy lên Cloudflare

Mở **Command Prompt** trong thư mục dự án. Nếu báo `'node' is not recognized`, chạy dòng này trước (mỗi lần mở cửa sổ mới):

```bat
set PATH=C:\Program Files\nodejs;%PATH%
```

1. Đăng nhập Cloudflare: `npx wrangler login`
2. Tạo cơ sở dữ liệu: `npx wrangler d1 create voicekit`. Dán `database_id` in ra vào `wrangler.toml` (mục `[[d1_databases]]`).
3. Tạo bảng: `npx wrangler d1 migrations apply voicekit --remote`
4. Trong `wrangler.toml`, điền `ADMIN_EMAILS` bằng email của bạn (đăng ký bằng email này là có trang Quản trị).
5. Cấu hình SMTP (mỗi lệnh hỏi giá trị rồi lưu dạng bí mật, không nằm trong code):
   ```bat
   npx wrangler secret put SMTP_HOST
   npx wrangler secret put SMTP_PORT
   npx wrangler secret put SMTP_USER
   npx wrangler secret put SMTP_PASS
   npx wrangler secret put SMTP_FROM
   ```
6. Đưa lên web: `npm run deploy`. Lệnh in ra địa chỉ `https://speech-to-text-pro.<ten-ban>.workers.dev`.

### Gợi ý SMTP
| Nhà cung cấp | SMTP_HOST | SMTP_PORT | Ghi chú |
|---|---|---|---|
| Gmail | smtp.gmail.com | 587 | Bật xác minh 2 bước, tạo **App Password** làm SMTP_PASS; ~500 mail/ngày |
| Brevo | smtp-relay.brevo.com | 587 | Free 300 mail/ngày, gửi từ tên miền riêng |
| Zoho Mail | smtp.zoho.com | 465 | Dùng tên miền riêng |

`SMTP_FROM` dạng `VoiceKit <no-reply@ten-mien.com>` (với Gmail để đúng địa chỉ Gmail của bạn). Cloudflare chặn cổng 25, chỉ dùng 587 hoặc 465.

## Gói và giới hạn
Sửa số trong `worker/plans.js`.

| Gói | Ai | Edge / CapCut mỗi ngày | Ký tự mỗi lượt |
|---|---|---|---|
| Khách | Chưa đăng nhập (đếm theo IP) hoặc chưa xác minh email | 5 | 500 |
| Miễn phí | Đã đăng ký và xác minh email | 50 | 3.000 |
| Premium | Quản trị viên cấp trong trang Quản trị (có thể đặt số ngày) | 500 | 20.000 |

- Có giới hạn tổng toàn hệ thống (`GLOBAL_DAILY_TTS`, mặc định 60.000 lượt/ngày) để không chạm giới hạn 100.000 request/ngày của Cloudflare free. Các gói không phải Premium dừng ở 85% mức đó.
- Lượt làm mới lúc 0h giờ Việt Nam. Lượt bị lỗi được hoàn lại.
- Tính năng chạy trong trình duyệt (Whisper, Piper, MMS, Gemini/Groq bằng key riêng) không tốn tài nguyên máy chủ nên không giới hạn.
- Thanh toán tự động qua payOS (xem mục dưới). Quản trị viên vẫn có thể bật Premium / cộng lượt bằng tay trong trang Quản trị.
- Đọc phụ đề SRT thành giọng: Khách không dùng được, Miễn phí tối đa 30 câu mỗi file (sửa `srtCues` trong `worker/plans.js`) và không có nhạc nền, Premium không giới hạn.

## Thanh toán tự động (payOS)
Khách quét mã VietQR, tiền vào tài khoản ngân hàng của bạn, payOS báo về Worker qua webhook và Worker tự bật Premium / cộng lượt, gửi biên lai qua email. Không cần thao tác tay.

1. Đăng ký tại https://my.payos.vn (cá nhân dùng được, cần CCCD). Liên kết tài khoản ngân hàng nhận tiền (MB Bank, ACB, OCB, Kienlongbank… xem danh sách trên payOS).
2. Tạo **Kênh thanh toán**, mở kênh đó và copy 3 khóa: **Client ID**, **Api Key**, **Checksum Key**.
3. Lưu vào Worker (mỗi lệnh hỏi giá trị, dán vào rồi Enter):
   ```bat
   npx wrangler secret put PAYOS_CLIENT_ID
   npx wrangler secret put PAYOS_API_KEY
   npx wrangler secret put PAYOS_CHECKSUM_KEY
   npx wrangler secret put PAYOS_DESC_MAX
   ```
   `PAYOS_DESC_MAX`: số ký tự nội dung chuyển khoản tối đa. Nhập `25` nếu ngân hàng liên kết qua API chính thức, không chắc thì nhập `9` (an toàn với mọi ngân hàng).
4. Trong `wrangler.toml`, đặt `APP_URL` bằng địa chỉ website thật (vd `https://voice.ten-mien.com`, không có `/` cuối) để webhook và link quay về trỏ đúng tên miền, rồi `npm run deploy`.
5. Đăng nhập bằng tài khoản quản trị → **Quản trị → Cài đặt** → bấm **Đăng ký webhook với payOS**. Worker tự đăng ký `https://<APP_URL>/api/payos/webhook` với payOS (payOS gửi thử một lần, phải báo thành công). Hoặc dán địa chỉ đó thủ công vào ô Webhook của kênh trên my.payos.vn.
6. Thử: dùng một tài khoản đã xác minh email, mua gói rẻ nhất hoặc 10 lượt (2.000đ) rồi chuyển khoản thật. Trong vài giây đơn chuyển sang **Đã thanh toán**, gói được bật và email biên lai được gửi. Xem đơn trong **Quản trị → Đơn hàng** (cột "qua": `webhook` = webhook chạy tốt, `check` = trang chờ tự hỏi payOS).

Webhook lỗi hoặc chưa đăng ký thì trang chờ thanh toán vẫn tự hỏi payOS mỗi vài giây và kích hoạt, nhưng chỉ khi khách còn mở trang. Có webhook thì khách đóng trang giữa chừng vẫn được kích hoạt.

Chạy thử trên máy (`npm run dev:worker`): đặt các khóa `PAYOS_*` và `APP_URL` trong `.dev.vars`. payOS không gọi được webhook vào `localhost`, trang chờ sẽ tự hỏi trạng thái thay.

## Tài khoản
Đăng ký, xác minh email (link 24 giờ), đăng nhập (phiên 30 ngày, cookie HttpOnly), quên mật khẩu (link 1 giờ, dùng một lần, đăng xuất mọi thiết bị), đổi mật khẩu. Mật khẩu băm PBKDF2-SHA256 100.000 vòng. Chống spam: tối đa 60 thao tác đăng nhập/đăng ký/gửi mail mỗi IP mỗi ngày, gửi lại mail cách nhau 60 giây.

## Chạy thử trên máy
- `npm run dev:worker`: chạy giống hệt bản deploy (cần `npx wrangler d1 migrations apply voicekit --local` lần đầu). SMTP khi chạy local đặt trong file `.dev.vars` (đã gitignore).
- `start.bat`: bản dùng cá nhân bằng Node, không có tài khoản và giới hạn.

## Tính năng
**Giọng → Chữ (STT):** Đa dạng mô hình AI chạy trong trình duyệt qua Transformers.js (danh mục ở `public/stt-models.js`). Các mô hình miễn phí: Whisper Small (mặc định), Whisper Tiny, Base, Moonshine Tiny (siêu tốc cho tiếng Anh), cùng các mô hình chuyên biệt từng thứ tiếng. Các mô hình Siêu cấp độc quyền gói Premium: Whisper Large v3 Turbo, Whisper Large v3 đầy đủ, Whisper Medium, PhoWhisper Base (VinAI tối ưu tiếng Việt), Kotoba-Whisper v2.2 (SOTA tiếng Nhật), Whisper Large v3 Turbo (Hàn Quốc, Tây Ban Nha, Đức, Nga, Quảng Đông). Hỗ trợ WebGPU và CPU tự động. Tab Dán link nhận file trực tiếp hoặc link HLS `.m3u8`. **Tách giọng khỏi nhạc nền** (Premium): bật ô tùy chọn dưới danh sách mô hình, mô hình MDX-Net `UVR-MDX-NET Voc FT` (~67 MB, tải về một lần rồi lưu cache) chạy trong trình duyệt để lọc nhạc nền trước khi Whisper nhận diện. Có WebGPU thì nhanh gấp ~5 lần thời gian thực (tối đa 20 phút), không có thì chậm ~6 lần thời gian thực (tối đa 3 phút). Cần deploy lại Worker để proxy `/hf/` cho phép file mô hình này. Tùy chọn Gemini / Groq bằng key riêng.

**Chữ → Giọng (TTS):**
| Kho giọng | Chạy ở đâu | Số lượng & Đặc điểm | Gói áp dụng |
|---|---|---|---|
| Microsoft Edge Neural | Worker (giới hạn theo ngày) | 2 giọng Việt + 300+ giọng quốc tế | Mọi gói |
| VieNeu-TTS Studio Pro | Worker (giới hạn theo ngày) | 35 giọng 3 miền (Review phim, VTV, Trinh thám, MC Bán hàng, ASMR...) | **Premium** |
| Supertonic 3 Pro | Worker (giới hạn theo ngày) | 20 giọng nam/nữ, 31 ngôn ngữ quốc tế, hỗ trợ thẻ cảm xúc | **Premium** |
| CapCut / TikTok Global | Worker (giới hạn theo ngày) | 30+ giọng viral (Việt Nam, US, Thái, Trung, Indo...) | **Premium** |
| Piper | Trong trình duyệt (WASM) | 1 giọng Việt (offline được) | Miễn phí |
| Meta MMS | Trong trình duyệt (WASM) | 1 giọng Việt (offline được) | Miễn phí |
| Giọng trình duyệt / HĐH | Trình duyệt (chỉ nghe) | Tùy hệ điều hành | Miễn phí |
| Google Gemini TTS | Gọi Google bằng key riêng | 30 giọng đa ngôn ngữ | Dùng API key |
