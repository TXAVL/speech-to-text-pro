# VoiceKit — Giọng nói ⇄ Văn bản (miễn phí, không cần API key)

## Chạy thử trên máy
Nhấp đúp `start.bat` rồi mở http://localhost:3000 (server Node), hoặc `npm run dev:worker` để chạy đúng như khi deploy Cloudflare.

## Deploy lên website (Cloudflare)
```bash
npx wrangler login
npm run deploy
```
Worker (`worker.js`) phục vụ giao diện trong `public/` và hai proxy nhỏ cho TTS (`/api/edge/*`, `/api/capcut/*`). Mọi thứ còn lại chạy ngay trong trình duyệt người dùng, không cần server Node.

## Giọng → Chữ (STT)
Whisper chạy trong trình duyệt (Transformers.js, WebGPU/CPU): không key, không giới hạn thời lượng, âm thanh không rời máy. Mô hình tải một lần rồi lưu cache.

| Mô hình | Dung lượng | Ghi chú |
|---|---|---|
| Whisper Small (mặc định) | ~250 MB | Tiếng Việt tốt, cân bằng |
| Whisper Large v3 Turbo | ~600 MB | Chính xác nhất, cần WebGPU (Chrome/Edge mới) |
| Whisper Base | ~80 MB | Chỉ nên dùng cho tiếng Anh |

Tùy chọn có key: Gemini / Groq. App hỏi thẳng Google/Groq xem key đó dùng được model nào rồi mới hiện vào danh sách (không gõ cứng tên model).

## Chữ → Giọng (TTS) — kho giọng ghi rõ trong giao diện
| Kho giọng | Key? | Chạy ở đâu | Giọng Việt |
|---|---|---|---|
| Microsoft Edge Neural | Không | Cloudflare Worker / server | 2 (HoaiMy, NamMinh) + 300 giọng đa ngôn ngữ |
| CapCut / TikTok | Không | Cloudflare Worker / server | 24 |
| Piper | Không | Trong trình duyệt (offline sau lần đầu, ~63 MB) | 1 |
| Meta MMS | Không | Trong trình duyệt (~114 MB, giọng hơi máy) | 1 |
| Giọng của trình duyệt / hệ điều hành | Không | Trình duyệt (chỉ nghe, không tải file) | Tùy máy (Edge có giọng Natural) |
| Google Gemini TTS | Có (Gemini key) | Gọi thẳng Google từ trình duyệt | 30 giọng đa ngôn ngữ |

Edge và CapCut cần proxy vì trình duyệt không tự gọi được (Microsoft/CapCut chặn Origin lạ). Nếu host tĩnh thuần không có Worker thì hai kho này tự ẩn.
