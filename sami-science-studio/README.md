# SAMI Science Studio

Plugin sản xuất video motion graphic khoa học (Toán, Vũ trụ, Hóa học; sau này Vật lý, Máy móc) cho YouTube và
Facebook thị trường Mỹ, Âu. Từ một chủ đề, một tài liệu hoặc ghi chép lab, hệ thống đi đến file MP4 (hoặc SVG)
kèm gói đăng bài. Dùng được trên Claude Code (plugin) và Google Antigravity (skills).

Ba ý chính của thiết kế:

1. **Hình ảnh sinh từ code và phép tính.** Mỗi cảnh là một hàm thuần của thời gian `t`; đường cong, quỹ đạo,
   mực chất lỏng đều lấy từ script tính toán. Cùng một dự án cho ra cùng một khung hình trên mọi máy.
2. **Sổ dữ kiện (fact ledger) chặn số liệu chưa kiểm chứng.** Mọi con số, công thức, phương trình trên màn hình
   phải có một "fact" đứng sau: được máy tính lại, là đầu vào do người chọn, hoặc là trích dẫn có nguồn. Lint
   từ chối render nếu có số không rõ nguồn gốc.
3. **Mỗi công đoạn trao đổi bằng file, không bằng hội thoại.** Vì vậy có thể đổi model theo từng vai trò
   (đạo diễn dùng Fable hoặc Gemini Carbon, dựng cảnh dùng Opus hoặc Sonnet), làm lại từng bước, và tái sử dụng
   tài nguyên giữa các video và các kênh.

## Có gì trong thư mục này

```
.claude-plugin/plugin.json   khai báo plugin
skills/                      5 skill: science-video (điều phối), motion-engine, fact-ledger,
                             video-reference (phân tích video mẫu), channel-strategy (kênh, SEO, CTA)
agents/                      4 vai trò: science-director, fact-checker, scene-builder, publisher
config/models.json           model và mức effort cho từng vai trò, theo 4 profile
channels/                    hồ sơ kênh: pure-science, everyday-science, absurd-lab
engine/                      runtime (Three.js + SVG + thẻ chữ), render (Playwright -> ffmpeg),
                             verify (facts.py, lint_project.py), styles (3 style pack), tools
templates/project/            khung một dự án video
examples/                    3 video mẫu chạy được: hóa (3D), toán (2D, xuất SVG), vũ trụ (2D)
references/samples/          4 file JSON tái tạo 4 video mẫu đã gửi
schemas/video-spec.schema.json   cấu trúc JSON dùng chung cho storyboard và bản tái tạo video mẫu
install/antigravity.sh       cài skills cho Antigravity
```

## Cài đặt

Cần: Node 18+, Python 3.10+, ffmpeg.

```bash
cd engine && npm install
```

```bash
npm i playwright && npx playwright install chromium
```

```bash
pip install sympy
```

**Claude Code** (nạp plugin từ thư mục):

```bash
claude --plugin-dir /duong/dan/sami-science-studio
```

Sau đó gọi `/sami-science-studio:science-video <chủ đề hoặc đường dẫn tài liệu>`.
Khi tách thư mục này thành repo riêng, có thể thêm `.claude-plugin/marketplace.json` ở gốc repo để cài qua
`/plugin marketplace add` và `/plugin install`.

**Antigravity** (cài skills cho một workspace, hoặc `--global`):

```bash
sh install/antigravity.sh /duong/dan/workspace
```

Antigravity không có sub-agent: skill `science-video` sẽ tự đóng lần lượt các vai trò trong một hội thoại,
vẫn giữ nguyên file và cổng kiểm tra. Đường dẫn skills của Antigravity (`.agents/skills`) lấy theo tài liệu
hiện tại của họ; nếu họ đổi, sửa biến `DEST` trong script.

## Quy trình một video

| Bước | Vai trò | Model (profile `premium`) | Kết quả | Cổng kiểm tra |
|------|---------|---------------------------|---------|---------------|
| 0 Khởi tạo | điều phối | | dự án từ template | kênh, style, định dạng tồn tại |
| 1 Đạo diễn, kịch bản | science-director | Fable 5.2, effort high (hoặc Gemini 4 Carbon) | `storyboard.json`, danh sách claim | mọi claim đều được liệt kê |
| 2 Kiểm chứng | fact-checker | Fable 5.2, effort high | `labs/*.py`, `data/`, `facts.json` | `facts.py` không có lỗi |
| 3 Dựng cảnh | scene-builder | Opus 5.5 (hoặc Sonnet 5.5), effort medium | `scenes/main.js` | lint sạch, đã xem contact sheet |
| 4 Duyệt | science-director | Fable 5.2 | tối đa 5 yêu cầu sửa | tối đa 2 vòng |
| 5 Render | không dùng model | | `out/*.mp4` hoặc `.svg` | file tồn tại, đúng thời lượng |
| 6 Xuất bản | publisher | Sonnet 5.5 | `publish.json`, ảnh thumbnail | lint `--strict` |

Các profile trong `config/models.json`: `premium` (mặc định), `balanced` (tập trong một series đã có khuôn),
`opus-only` (chỉ dùng Opus 5.5), `carbon` (làm trong Antigravity). Vì các bước trao đổi bằng file, có thể chạy
bước 1 và 2 trong Antigravity bằng Carbon rồi mở cùng thư mục dự án trong Claude Code để dựng bằng Opus.

Lệnh chạy tay:

```bash
python3 -I engine/tools/new_project.py videos/ten-video --id ten-video --title "Tiêu đề" --channel pure-science
```

```bash
python3 -I engine/verify/facts.py videos/ten-video --write
```

```bash
python3 -I engine/verify/lint_project.py videos/ten-video
```

```bash
node engine/render/render.cjs videos/ten-video --sheet 12
```

```bash
node engine/render/render.cjs videos/ten-video --workers 4
```

Tùy chọn render: `--format 9x16|16x9|1x1`, `--style <pack>`, `--scale 0.5` (bản nháp) hoặc `2` (4K),
`--still <giây>`, `--svg <giây>` (cảnh 2D), `--audio <file>`, `--gpu`, `--serve` (xem thử trong trình duyệt).

## Độ chính xác: làm được gì và không làm được gì

`facts.json` có ba loại dữ kiện:

- `computed`: máy tính lại. Các kiểu kiểm tra: biểu thức số học (`expr`), đồng nhất thức ký hiệu qua sympy
  (`identity`), cân bằng nguyên tử và điện tích của phương trình hóa học (`chem_balance`), giá trị và đường
  cong từ script lab (`lab`).
- `given`: đầu vào do brief chọn (nồng độ, thể tích).
- `cited`: số đo hoặc hằng số lấy từ tài liệu, phải ghi nguồn và vị trí trong nguồn, và phải có người xác nhận
  (`confirmed`). Chạy `lint --strict` trước khi đăng sẽ chặn mọi trích dẫn chưa ai xác nhận.

Thêm ba ràng buộc: chữ trên màn hình chỉ nằm trong `storyboard.texts`; công thức hiển thị có thể bắt buộc
trùng với LaTeX sinh ra từ chính phương trình đã kiểm (`tex_of`); code dựng cảnh không được gõ số khoa học mà
phải đọc từ ledger và từ `data/`.

Giới hạn cần biết: hệ thống đảm bảo mỗi con số truy được về phép tính hoặc nguồn, nhưng không tự chứng minh
được rằng **mô hình** dùng để tính phù hợp với thực tế. Vì vậy mỗi video ghi rõ mô hình và giới hạn
(`science.caveats`) và nên hiện một "method card" ở cuối, giống video mẫu về đám mây electron. Khi nạp tài
liệu, hồ sơ, labs của bạn vào `sources/`, đạo diễn và người kiểm chứng sẽ ưu tiên các nguồn đó, và dừng lại
báo cáo nếu tài liệu và phép tính mâu thuẫn nhau.

## Style

Style là dữ liệu, không phải code: mỗi file trong `engine/styles/` gồm biến CSS, ánh sáng 3D, bảng màu và
chuyển động. Đang có:

- `midnight-lab`: nền xanh đêm, thủy tinh phát sáng, thẻ viền xanh, toán chữ serif (theo hai video dọc mẫu).
- `clean-bench`: studio trắng, nhãn xanh đặc có đường dẫn, thanh chú thích trắng (theo video điều chế axit).
- `paper-blueprint`: giấy kẻ ô màu kem, nét mực, điểm nhấn cam gỉ (theo bản ghi màn hình ESP Labs).

Đổi style khi render bằng `--style <pack>`; thêm style mới bằng cách chép một file JSON và sửa giá trị
(xem `skills/motion-engine/references/extending.md`). Khi bạn gửi video mẫu mới, skill `video-reference` sẽ
phân tích, viết file JSON mô tả, rồi chọn hoặc tạo style pack tương ứng.

## Kênh và chiến lược

Mỗi kênh là một file trong `channels/`: lời hứa, khán giả, giọng điệu, mức hài hước (0 đến 3), trụ cột nội
dung, style, các yếu tố nhận diện, mẫu CTA, mẫu tiêu đề, nhịp đăng. Có sẵn ba hồ sơ:

- `pure-science`: khoa học thuần, chính xác, không hài.
- `everyday-science`: khoa học lý thú gắn với đời sống, có thẻ "Try it".
- `absurd-lab`: câu hỏi kỳ quặc, trả lời bằng số thật, hài nằm trên nền phép tính.

Chiến lược đầy đủ (series, giữ chân người xem, SEO, CTA, kế hoạch 90 ngày, chống bị sao chép) nằm trong
`skills/channel-strategy/references/playbook.md`. Tóm tắt phần chống sao chép: thứ khó chép nhất là hình ảnh
sinh từ phép tính, method card cuối video, hệ style riêng với yếu tố nhận diện được làm mới định kỳ, series
đánh số, và nội dung dựng từ tài liệu riêng của bạn. Các video mẫu của kênh khác chỉ dùng làm tham chiếu về
phong cách và cấu trúc; video mới có thương hiệu, lời và số liệu riêng.

## Tối ưu chi phí

- Suy nghĩ sâu một lần ở bước đạo diễn; các bước sau làm theo storyboard.
- Việc kiểm tra do script làm (`facts.py`, `lint_project.py`), model không đọc lại.
- Xem một contact sheet 12 khung độ phân giải thấp thay vì từng khung hình.
- Agent nhận đường dẫn file, trả lời tối đa 5 dòng.
- Tái sử dụng: bộ component, style pack, hồ sơ kênh, script lab, khuôn series. Một series được đạo diễn một
  lần, mỗi tập chỉ thay chữ, dữ kiện và dữ liệu.
- Cảnh 2D (toán, quỹ đạo) không bật WebGL nên render nhanh và xuất được SVG.

## Tình trạng hiện tại

Đã chạy thật trong môi trường Linux (Chromium không GPU):

- `claude plugin validate` báo đạt (chỉ còn cảnh báo thiếu icon, cần khi đưa lên thư mục plugin).

- `examples/chem-titration`: 24 giây, 1080x1920, 3D, 720 khung trong khoảng 4 phút 40 giây với 4 nhân CPU.
- `examples/math-odd-squares`: 16 giây, 2D, xuất được SVG.
- `examples/space-mars-year`: 20 giây, 2D, quỹ đạo giải từ phương trình Kepler; số liệu NASA khớp trang fact
  sheet khi đối chiếu tự động, vẫn để trạng thái chưa có người xác nhận.

Chưa làm, cần biết trước khi dùng thật:

- Âm thanh: render nhận `--audio <file>` để ghép nhạc, nhưng chưa có bước tự tạo nhạc, hiệu ứng hay giọng đọc.
  Bốn video mẫu đều không có lời thoại (hai video có nhạc nền, hai video không có tiếng).
- Bộ 3D mới có dụng cụ cơ bản (ống nghiệm, cốc, bình tam giác, buret, giá, chai, phân tử dạng que cầu).
  Các phần còn thiếu để tái tạo trọn 4 video mẫu được liệt kê trong `render.missing_components` của từng file
  JSON (bình cầu, sinh hàn, bếp đun, mặt đẳng trị từ dữ liệu lượng tử, bộ giao diện kiểu ESP Labs).
- Chưa thử trên Windows và macOS, chưa thử trong Antigravity thật (script cài đã chạy thử, skill chưa).
- Vật lý và Máy móc: chưa có component riêng; cơ chế thêm đã mô tả trong `extending.md`.
