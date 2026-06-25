# HTML-Markdown

Chuyển đổi bất kỳ website nào thành Markdown sạch chỉ với một yêu cầu. Sử dụng headless browser để render các trang web nặng JavaScript, sau đó trích xuất nội dung thành Markdown dễ đọc.

## Tính năng

- **Crawl một trang** — Chuyển đổi một URL thành Markdown ngay lập tức
- **Deep crawl** — Crawl đệ quy tới 10 trang sử dụng best-first search với độ sâu có thể cấu hình
- **Headless rendering** — Hỗ trợ JavaScript đầy đủ qua crawl4ai (Chromium headless)
- **Lọc nội dung** — Giới hạn trích xuất theo CSS selector, loại trừ các tag không mong muốn
- **REST API** — API NestJS với retry logic, kiểm soát concurrency, và response format chuẩn
- **Memory adaptive** — Tự động điều chỉnh tốc độ crawl dựa trên bộ nhớ hệ thống
- **Next.js frontend** — Giao diện web đơn giản để crawl và xem trước kết quả

## Bắt đầu nhanh

```bash
# 1. Cài đặt dependencies
pnpm install

# 2. Khởi động tất cả services cùng lúc
pnpm dev

# 3. Mở giao diện web
# http://localhost:3000
```

Nhập URL, chọn số trang cần crawl, và tải kết quả dưới dạng Markdown.

---

## Kiến trúc

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js Web    │────▶│   NestJS API    │────▶│  Python Server  │
│   (Port 3000)   │     │   (Port 3001)   │     │  (Port 11235)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │    crawl4ai     │
                                              │ AsyncWebCrawler │
                                              │   (Chromium)    │
                                              └─────────────────┘
                                                        │
                                                        ▼
                                              ┌─────────────────┐
                                              │   Target URL    │
                                              └─────────────────┘
```

### Cách hoạt động

1. **Next.js Web** — User nhập URL và tùy chọn trên trình duyệt
2. **NestJS API** — Validate input, thêm retry logic, chuẩn hóa response
3. **Python Server** — Wrapper cho crawl4ai's AsyncWebCrawler với:
   - Lazy browser initialization (khởi động Chromium khi có request đầu tiên)
   - Memory-adaptive dispatching (điều chỉnh tốc độ theo memory hệ thống)
   - Best-first deep crawling strategy cho trích xuất nhiều trang
4. **crawl4ai** — Render trang trong headless Chromium, trích xuất nội dung thành Markdown

---

## Cài đặt

### Yêu cầu hệ thống

| Yêu cầu | Phiên bản | Ghi chú |
|----------|-----------|---------|
| Node.js | 20+ | Cho NestJS API và Next.js |
| Python | 3.10+ | Cho crawl4ai server |
| pnpm | 8+ | Package manager |
| Chromium | (tự cài) | Headless browser cho crawl4ai |

### Cài đặt một lệnh

```bash
pnpm install && pnpm dev
```

### Cài đặt thủ công

**Python Server** (crawl4ai)

```bash
pip install crawl4ai fastapi uvicorn pydantic psutil
python python_server.py
```

Server lắng nghe trên `http://localhost:11235`. Browser khởi động lazy khi có request đầu tiên.

**NestJS API**

```bash
cd apps/api
pnpm install
pnpm start:dev
```

API lắng nghe trên `http://localhost:3001`.

**Next.js Frontend**

```bash
cd apps/web
pnpm install
pnpm dev
```

Frontend lắng nghe trên `http://localhost:3000`.

---

## Cách sử dụng

### Giao diện Web

Mở `http://localhost:3000` trong trình duyệt.

1. Nhập URL (ví dụ: `https://example.com`)
2. Chọn số trang cần crawl (0-10)
3. Click "Convert to Markdown"
4. Xem trước kết quả hoặc tải về dưới dạng file `.md`

### Ví dụ API

**Crawl một trang:**

```bash
curl -X POST http://localhost:3001/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "maxPages": 1}'
```

**Deep crawl (5 trang):**

```bash
curl -X POST http://localhost:3001/crawl \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "maxPages": 5,
    "cssSelector": "main, article",
    "excludedTags": ["script", "style", "nav"]
  }'
```

**Kiểm tra health:**

```bash
curl http://localhost:3001/health
# {"status": "ok"}
```

**Xem stats server:**

```bash
curl http://localhost:11235/stats
```

---

## API Reference

### POST /crawl

Crawl một URL và trả về kết quả dạng Markdown.

**Request body:**

| Field | Type | Default | Mô tả |
|-------|------|---------|--------|
| `url` | `string` | Bắt buộc | URL cần crawl |
| `maxPages` | `integer` | `1` | Số trang cần crawl (1-10). `1` = một trang |
| `cssSelector` | `string` | `null` | CSS selector để giới hạn trích xuất (ví dụ: `"main, article"`) |
| `excludedTags` | `string[]` | `null` | Các HTML tag bổ sung cần loại trừ khỏi output |

**Response:**

```json
{
  "markdown": "# Page Title\n\nMarkdown content...",
  "metadata": {
    "title": "Page Title",
    "rootUrl": "https://example.com",
    "generatedAt": "2026-06-23T11:00:00.000Z"
  },
  "cached": false,
  "pageCount": 1,
  "hasErrors": false,
  "crawledUrls": ["https://example.com"],
  "crawledUrlsCount": 1,
  "media": {
    "images": ["Alt text của ảnh thứ nhất", "Alt text của ảnh thứ hai"]
  },
  "links": [],
  "status_code": 200,
  "tables": []
}
```

**Error responses:**

| Status | Ý nghĩa |
|--------|---------|
| `400` | URL hoặc parameters không hợp lệ |
| `503` | Service không khả dụng (browser chưa khởi động, server đầy) |

### GET /health

Trả về trạng thái health của service.

```json
{"status": "ok"}
```

### GET /stats (chỉ Python server)

Trả về trạng thái hiện tại của server bao gồm memory usage và concurrency.

```json
{
  "running": 0,
  "max_concurrency": 2,
  "memory_threshold_percent": 90,
  "memory_timeout": 30,
  "memory_rss_mb": 85.2,
  "child_memory_mb": 245.1,
  "total_memory_mb": 330.3,
  "system_memory_percent": 65.4,
  "browser_ready": true,
  "idle_timeout": 60
}
```

---

## Cấu hình

### Environment Variables

#### `apps/api/.env`

| Variable | Default | Mô tả |
|----------|---------|--------|
| `CRAWL4AI_URL` | `http://localhost:11235` | Python server base URL |
| `CRAWL4AI_TIMEOUT` | `120` | Request timeout tính bằng giây |
| `CRAWL4AI_API_KEY` | _(trống)_ | Optional API key cho crawl4ai auth |
| `CRAWL_MAX_PAGES_TOTAL` | `10` | Giới hạn cứng số trang mỗi request |
| `CRAWL_MAX_DEPTH` | `3` | Độ sâu tối đa cho deep crawl |
| `PORT` | `3001` | Port của NestJS server |

#### `apps/web/.env`

| Variable | Default | Mô tả |
|----------|---------|--------|
| `NESTJS_API_URL` | `http://localhost:3001` | NestJS API base URL |

#### `python_server.py` (qua environment)

| Variable | Default | Mô tả |
|----------|---------|--------|
| `CRAWL4AI_PORT` | `11235` | Python server port |
| `CRAWL4AI_MAX_CONCURRENT` | `2` | Số request crawl đồng thời tối đa |
| `CRAWL4AI_QUEUE_TIMEOUT` | `30` | Thời gian chờ trong queue tính bằng giây |
| `CRAWL4AI_MEMORY_THRESHOLD` | `90.0` | Ngưỡng % memory hệ thống để tạm dừng crawl |
| `CRAWL4AI_MEMORY_TIMEOUT` | `30` | Thời gian chờ trước khi thử lại khi đạt ngưỡng memory |
| `CRAWL4AI_V8_MAX_OLD_SPACE_SIZE` | `1536` | V8 JavaScript heap size tính bằng MB |
| `IDLE_TIMEOUT` | `60` | Số giây trước khi browser đóng sau request cuối |

---

## Xử lý lỗi thường gặp

### Browser không khởi động được

```
Error: Browser failed to start
```

**Giải pháp:**
- Đảm bảo Chromium/Chrome đã được cài đặt
- Kiểm tra port 11235 có đang trống không
- Chạy với verbose logging: `python python_server.py --log-level debug`

### Vấn đề về bộ nhớ

```
Error: Memory threshold exceeded
```

**Giải pháp:**
- Giảm `maxPages` khi deep crawl
- Tăng `CRAWL4AI_MEMORY_THRESHOLD` nếu máy có nhiều RAM hơn
- Đóng các ứng dụng ngốn RAM khác

### Timeout errors

```
Error: crawl4ai unavailable: timeout
```

**Giải pháp:**
- Tăng `CRAWL4AI_TIMEOUT` trong `apps/api/.env`
- Thử với ít trang hơn
- Kiểm tra kết nối mạng tới URL đích

### Server đầy

```
Error: Server at capacity, try again later
```

**Giải pháp:**
- Chờ vài giây rồi thử lại
- Tăng `CRAWL4AI_MAX_CONCURRENT` trong Python server environment
- Kiểm tra `/stats` endpoint để xem load hiện tại

### Port đang được sử dụng

```bash
# Kill processes trên các port cụ thể
# Windows:
.\scripts\kill-ports.ps1

# Linux/Mac:
kill -9 $(lsof -ti:3000,3001,11235)

# Sau đó khởi động lại services
pnpm dev
```

---

## Phát triển

### Cấu trúc project

```
html-markdown/
├── python_server.py          # Python FastAPI server (crawl4ai wrapper)
├── apps/
│   ├── api/                  # NestJS API
│   │   └── src/
│   │       ├── crawl/       # Crawl module (controller, service, utils)
│   │       └── main.ts      # API entry point
│   └── web/                 # Next.js frontend
│       └── src/
│           ├── app/         # App router pages
│           ├── components/  # React components
│           └── lib/         # Utilities và types
├── scripts/
│   └── kill-ports.ps1       # Script dọn dẹp port
└── package.json             # pnpm workspace root
```

### Chạy tests

```bash
cd apps/api
pnpm test
```

### Code style

```bash
pnpm lint
```

---

## Đóng góp

1. Tên branch: `feat/<name>`, `fix/<name>`, `chore/<name>`
2. Commit style: `feat: add deep crawl option`, `fix: retry logic on 503`
3. Chạy `pnpm lint` trước khi push
4. Tất cả tests phải pass: `pnpm test`

---

## License

MIT — xem [LICENSE](LICENSE).
