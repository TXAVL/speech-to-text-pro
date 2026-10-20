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
- Chưa có thanh toán tự động: người dùng liên hệ, quản trị viên bật Premium trong trang Quản trị (tùy chọn gửi email báo).

## Tài khoản
Đăng ký, xác minh email (link 24 giờ), đăng nhập (phiên 30 ngày, cookie HttpOnly), quên mật khẩu (link 1 giờ, dùng một lần, đăng xuất mọi thiết bị), đổi mật khẩu. Mật khẩu băm PBKDF2-SHA256 100.000 vòng. Chống spam: tối đa 60 thao tác đăng nhập/đăng ký/gửi mail mỗi IP mỗi ngày, gửi lại mail cách nhau 60 giây.

## Chạy thử trên máy
- `npm run dev:worker`: chạy giống hệt bản deploy (cần `npx wrangler d1 migrations apply voicekit --local` lần đầu). SMTP khi chạy local đặt trong file `.dev.vars` (đã gitignore).
- `start.bat`: bản dùng cá nhân bằng Node, không có tài khoản và giới hạn.

## Tính năng
**Giọng → Chữ:** 16 mô hình chạy trong trình duyệt, danh mục ở `public/stt-models.js` (đã chạy thử từng mô hình): PhoWhisper Base của VinAI (tiếng Việt); Whisper Tiny / Base / Small (chạy mọi máy, Small mặc định); Whisper Medium, Large v3 Turbo, Large v3 (cần WebGPU); mô hình riêng từng ngôn ngữ: Moonshine (Anh), Kotoba-Whisper (Nhật), Whisper tinh chỉnh cho Pháp, Đức, Ý, Nga, Ba Tư, KB-Whisper (Thụy Điển), NB-Whisper (Na Uy). Máy không có WebGPU (hoặc tắt tăng tốc phần cứng) thì các mô hình cần GPU bị khóa và có hướng dẫn bật. Tab Dán link nhận file trực tiếp hoặc link HLS `.m3u8`: tự chọn luồng tiếng, tải các đoạn (hỗ trợ AES-128, BYTERANGE, .ts / fMP4 / .aac) rồi ghép lại; link chặn CORS đi qua `/api/fetch-proxy`. Tùy chọn Gemini / Groq bằng key riêng, app tự dò model theo key.

**Chữ → Giọng:**
| Kho giọng | Chạy ở đâu | Giọng Việt |
|---|---|---|
| Microsoft Edge Neural | Worker (có giới hạn theo gói) | 2 + 300 giọng đa ngôn ngữ |
| CapCut / TikTok | Worker (có giới hạn theo gói) | 24 |
| Piper | Trong trình duyệt | 1 |
| Meta MMS | Trong trình duyệt | 1 |
| Giọng trình duyệt / hệ điều hành | Trình duyệt (chỉ nghe) | Tùy máy |
| Google Gemini TTS | Gọi thẳng Google bằng key riêng | 30 giọng đa ngôn ngữ |
