---
name: TXA Voice
description: Công cụ giọng nói ⇄ văn bản tiếng Việt, giao diện tối ánh tím–cyan, thẻ bo tròn, chạy gọn trong một trang.
colors:
  bg: "#0b0d14"
  bg-2: "#11141e"
  card: "#151926"
  card-2: "#1b2030"
  line: "#262c40"
  text: "#e9ecf5"
  muted: "#8b93ad"
  accent-violet: "#7c6cff"
  accent-blue: "#5b8cff"
  accent-cyan: "#22d3ee"
  ok: "#34d399"
  danger: "#f87171"
  light-bg: "#f5f6fb"
  light-card-2: "#f0f2f9"
  light-line: "#e1e5f0"
  light-text: "#1a1e2e"
  light-muted: "#6a7390"
typography:
  display:
    fontFamily: "Be Vietnam Pro, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "clamp(26px, 4.4vw, 42px)"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "-0.8px"
  title:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 600
    letterSpacing: "-0.3px"
  body:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Be Vietnam Pro, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
  mono:
    fontFamily: "ui-monospace, Consolas, monospace"
    fontSize: "0.85em"
rounded:
  sm: "9px"
  md: "11px"
  lg: "16px"
  pill: "999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "20px"
components:
  button-default:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-primary:
    backgroundColor: "{colors.accent-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  button-accent:
    backgroundColor: "{colors.card-2}"
    textColor: "{colors.accent-cyan}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "20px"
  input:
    backgroundColor: "{colors.bg-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "11px 13px"
---

# Design System: TXA Voice

## Overview

**Creative North Star: "The Night Studio"**

Một phòng thu tối, ánh đèn tím–cyan hắt lên các tấm thẻ nổi. Giao diện là công cụ làm việc, không phải trang quảng cáo: nền gần đen xanh, thẻ bo tròn lớn, chữ sáng, và đúng hai màu nhấn (tím cho hành động chính, cyan cho thông tin và thương hiệu). Mọi thứ nằm trong một trang rộng tối đa 1180px, chuyển giữa các chức năng bằng thanh tab ở đầu.

Giao diện dày thông tin nhưng thoáng nhờ khoảng cách đều (8–20px) và viền mảnh thay cho bóng nặng. Có chế độ sáng dùng cùng cấu trúc, và có giao diện theo mùa/ngày lễ phủ lên hero mà không đổi hệ thống.

**Key Characteristics:**
- Nền tối xanh đen, hai điểm sáng gradient mờ ở góc trên.
- Một màu tím cho hành động chính, một màu cyan cho thương hiệu và liên kết.
- Thẻ bo 16px, ô nhập và nút bo 11px, viền 1px.
- Chữ Be Vietnam Pro, hỗ trợ tiếng Việt đầy đủ dấu.
- Trạng thái (bận, hết hạn mức, Premium) có thẻ màu riêng, rõ ràng, không dùng toast đỏ cho lỗi hạ tầng.

## Colors

Bảng màu hai nhấn trên nền tối lạnh; trạng thái dùng xanh lá và đỏ nhạt, cảnh báo dùng vàng/hồng ở thẻ hết hạn mức.

### Primary
- **Tím Phòng Thu** (`#7c6cff`): màu hành động chính. Nút `.btn.primary` dùng gradient từ tím sang xanh dương (`#5b8cff`), viền ô nhập khi focus, thẻ Premium.
- **Cyan Thương Hiệu** (`#22d3ee`): chữ "Voice" trong logo, liên kết, nút phụ `.btn.accent`, điểm nhấn thông tin.

### Neutral
- **Đêm Xanh Đen** (`#0b0d14`): nền trang.
- **Nền Ô Nhập** (`#11141e`): ô nhập, thanh tab, vùng lõm.
- **Mặt Thẻ** (`#151926`): thẻ nội dung.
- **Mặt Thẻ Nổi** (`#1b2030`): nút mặc định, tab đang chọn.
- **Đường Kẻ** (`#262c40`): mọi viền 1px.
- **Chữ Sáng** (`#e9ecf5`) và **Chữ Mờ** (`#8b93ad`): chữ chính và chữ phụ.

### Trạng thái
- **Xanh Ổn** (`#34d399`): miễn phí, thành công. **Đỏ Nhạt** (`#f87171`): lỗi, hành động nguy hiểm.

### Chế độ sáng
Nền `#f5f6fb`, thẻ trắng, mặt thẻ nổi `#f0f2f9`, đường kẻ `#e1e5f0`, chữ `#1a1e2e`, chữ mờ `#6a7390`. Hai màu nhấn giữ nguyên.

### Named Rules
**The Two Lights Rule.** Chỉ có hai màu nhấn: tím cho việc người dùng sắp làm, cyan cho việc họ đang đọc. Không thêm màu nhấn thứ ba cho tính năng mới.
**The Tint Not Fill Rule.** Màu trạng thái và nhấn phụ dùng nền trong suốt 8–16% cùng viền 40–50%, không tô đặc.

## Typography

**Font:** Be Vietnam Pro (fallback: system-ui, Segoe UI, sans-serif), tải từ Google Fonts, trọng số 400–800.
**Mono:** ui-monospace, Consolas cho `code`.

**Character:** Một họ chữ duy nhất, phân cấp bằng trọng số và cỡ chữ. Be Vietnam Pro giữ dấu tiếng Việt rõ ở cỡ nhỏ.

### Hierarchy
- **Display** (800, `clamp(26px, 4.4vw, 42px)`, 1.2, -0.8px): tiêu đề hero, có thể tô gradient tím–cyan (`.grad`).
- **Title** (600–800, 19px, -0.3px): logo, tiêu đề thẻ lớn.
- **Body** (400, 14px, 1.55): nội dung, ô nhập. Đoạn mô tả hero tối đa 640px.
- **Label** (600, 12.5–14px): nút, tab, nhãn trường.

### Named Rules
**The One Family Rule.** Không thêm họ chữ thứ hai. Cần nhấn thì tăng trọng số.

## Layout

Trang một cột giữa, rộng tối đa 1180px, thanh đầu trang gồm logo, tab chính ở giữa và cụm tài khoản bên phải. Nội dung xếp thành các thẻ; khoảng cách 8 / 12 / 16 / 20px. Điểm gãy chính ở 1180, 900, 640 và 560px: tab thu gọn, lưới thẻ chuyển về một cột. Nền có hai quầng sáng mờ cố định ở góc trên.

## Elevation & Depth

Lai giữa lớp màu và bóng. Thẻ phân tầng bằng độ sáng nền (`#0b0d14` → `#151926` → `#1b2030`) kèm viền 1px; bóng chỉ nhẹ và rộng.

### Shadow Vocabulary
- **Thẻ** (`box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35)`; chế độ sáng `0 10px 40px rgba(30, 40, 90, 0.08)`): thẻ nội dung.
- **Nút chính** (`0 8px 24px rgba(124, 108, 255, 0.38)`, hover `0 10px 30px rgba(124, 108, 255, 0.55)`): vầng sáng tím dưới nút hành động chính.
- **Logo** (`0 6px 18px rgba(124, 108, 255, 0.45)`).
- **Focus** (`0 0 0 3px rgba(124, 108, 255, 0.2)`): vòng sáng quanh ô nhập.

### Named Rules
**The Glow Is Action Rule.** Vầng sáng màu chỉ dành cho thứ bấm được hoặc đang focus; thẻ tĩnh chỉ có bóng đen.

## Shapes

Hình khối mềm: thẻ 16px, nút và ô nhập 11px, nút nhỏ và tab 9px, chip tròn hẳn (999px). Viền luôn 1px màu đường kẻ; trạng thái đặc biệt đổi màu viền, không dày thêm.

## Components

### Buttons
- **Shape:** bo 11px, đệm 10px 16px, chữ 14px đậm 600, có icon 18px bên trái.
- **Mặc định:** nền mặt thẻ nổi, viền đường kẻ; hover đổi viền sang tím và nhấc lên 1px.
- **Primary:** gradient tím → xanh dương, chữ trắng, bóng tím; `.big` rộng 100%, đệm 14px.
- **Accent:** nền cyan 12%, viền cyan 40%, chữ cyan. **Danger:** chữ đỏ nhạt. **Disabled:** mờ 45%.

### Cards / Containers
- **Bo góc** 16px, nền mặt thẻ, viền 1px đường kẻ, đệm 20px, bóng thẻ.

### Inputs / Fields
- **Style:** nền ô nhập, viền 1px, bo 11px, đệm 11px 13px.
- **Focus:** viền tím và vòng sáng 3px tím 20%. Textarea giãn dọc, dòng 1.6.

### Navigation
- Tab chính dạng "seg": khay bo 12px nền ô nhập, tab đang chọn nổi bằng nền mặt thẻ nổi và viền trong. Chữ mờ khi chưa chọn, sáng khi hover.

### Logo
- Ô vuông 34px bo 10px, gradient tím → cyan, icon micro trắng; chữ "TXA" thường kèm "Voice" đậm 800 màu cyan.

### Thẻ báo VieNeu bận
- Nền gradient tím/cyan 14% (hết hạn mức: vàng/hồng), viền màu 45–50%, bo 14px, biểu tượng 26px, nhịp sáng chậm 2,4s (tắt khi `prefers-reduced-motion`). Có nút thử lại và nút chuyển Edge.

## Do's and Don'ts

### Do:
- **Do** dùng biến `--bg`, `--card`, `--line`, `--accent`, `--accent-2`; mọi thành phần mới phải chạy được ở cả chế độ tối và sáng.
- **Do** giữ viền 1px màu đường kẻ và bo 11px/16px cho thành phần mới.
- **Do** báo lỗi hạ tầng bằng thẻ trạng thái có đường thoát, theo mẫu thẻ VieNeu bận.
- **Do** viết nhãn tiếng Việt, ngắn, động từ trước.

### Don't:
- **Don't** thêm màu nhấn thứ ba hoặc họ chữ thứ hai.
- **Don't** dùng vầng sáng màu cho thẻ tĩnh.
- **Don't** nhắc tên hạ tầng nền (Space, ZeroGPU) trong chữ hiển thị cho người dùng.
- **Don't** viết "VoiceKit" ở bất kỳ đâu hiển thị; tên là TXA Voice.
