# HTML-Markdown

Công cụ web scraping chuyển đổi HTML sang Markdown sạch bằng headless browser (crawl4ai), kèm REST API và Next.js frontend.

> Cũng có sẵn bằng: [English](README.md)

## Tính năng

- **Crawl một trang** — Chuyển đổi một URL sang Markdown tức thì
- **Deep crawl** — Recursively crawl tối đa 10 trang dùng BFS với depth có thể cấu hình
- **Headless browser extraction** — Render các trang JavaScript nặng qua crawl4ai (AsyncWebCrawler)
- **REST API** — NestJS API với retry logic, concurrency control và response shapes gọn gàng
- **Next.js frontend** — Giao diện web đơn giản để trigger crawls

## Kiến trúc

```
┌─────────────────┐       ┌─────────────────┐       ┌─────────────────┐
│  Next.js Web    │──────▶│   NestJS API    │──────▶│ Python Server   │
│  (Port 3000)    │       │   (Port 3001)  │       │ (Port 11235)    │
└─────────────────┘       └─────────────────┘       └─────────────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │  crawl4ai       │
                                                    │  AsyncWebCrawler│
                                                    │  (headless)     │
                                                    └─────────────────┘
                                                              │
                                                              ▼
                                                    ┌─────────────────┐
                                                    │   Target URL(s) │
                                                    └─────────────────┘
```

Python server chạy một FastAPI app wrap crawl4ai's `AsyncWebCrawler`. Nó khởi động một headless Chromium instance và reuse nó qua các requests. Cả single-page và deep-crawl requests đều flow qua `POST /crawl`. NestJS API xử lý input validation, retry logic và response normalization trước khi trả về Markdown sạch về frontend.

## Bắt đầu nhanh

```bash
# 1. Cài đặt dependencies
pnpm install

# 2. Khởi động cả 3 services song song
pnpm dev
```

Mở [http://localhost:3000](http://localhost:3000) — nhập URL, chọn số trang để crawl, và tải kết quả.

## Cài đặt

### Yêu cầu

- **Node.js** 20+ (cho NestJS API và Next.js frontend)
- **Python** 3.10+ (cho crawl4ai server)
- **pnpm** 8+

### Python Server

```bash
# Cài crawl4ai
pip install crawl4ai fastapi uvicorn pydantic

# Khởi động server
python python_server.py
```

Python server lắng nghe trên `http://localhost:11235`. Nó khởi động headless Chromium và giữ nó warm giữa các requests.

### NestJS API

```bash
cd apps/api
pnpm install
pnpm start:dev
```

API lắng nghe trên `http://localhost:3001`.

### Next.js Frontend

```bash
cd apps/web
pnpm install
pnpm dev
```

Frontend lắng nghe trên `http://localhost:3000`.

## API Endpoints

### `POST /crawl`

Crawl một URL và trả về kết quả dạng Markdown.

**Request body:**

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | Target URL để crawl (bắt buộc) |
| `maxPages` | `integer` | `1` | Số trang để crawl (1–10). `1` = một trang |
| `cssSelector` | `string` | `null` | Giới hạn extraction đến CSS selector cụ thể, ví dụ `"main, article"` |
| `excludedTags` | `string[]` | `null` | Thêm HTML tags để loại bỏ khỏi output |

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
  "media": { "images": ["Alt text of first image", "Alt text of second image"] },
  "status_code": 200
}
```

### `GET /health`

Trả về `{"status": "ok"}` nếu API đang chạy.

### `GET /stats` (Python server only)

Trả về concurrency state hiện tại:

```json
{
  "running": 0,
  "max_concurrency": 2
}
```

## Environment Variables

### `apps/api/.env`

| Variable | Default | Description |
|---|---|---|
| `CRAWL4AI_URL` | `http://localhost:11235` | Python server base URL |
| `CRAWL4AI_TIMEOUT` | `120` | Request timeout tính bằng giây |
| `CRAWL4AI_API_KEY` | _(empty)_ | Optional API key cho crawl4ai auth |
| `CRAWL_MAX_PAGES_TOTAL` | `10` | Hard cap trên số trang mỗi crawl request |
| `CRAWL_MAX_DEPTH` | `3` | Maximum link depth cho deep crawl |
| `PORT` | `3001` | NestJS server port |

### `apps/web/.env`

| Variable | Default | Description |
|---|---|---|
| `NESTJS_API_URL` | `http://localhost:3001` | NestJS API base URL |

## Đóng góp

- Tên branch: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Style commit: `feat: add deep crawl option`, `fix: retry logic on 503`
- Chạy `pnpm lint` trước khi push
- Tất cả tests phải pass: `pnpm test`

## Troubleshooting

### Lỗi kết nối đến Python server

- Kiểm tra Python server đang chạy: `curl http://localhost:11235/health`
- Kiểm tra `CRAWL4AI_URL` trong `apps/api/.env`
- Thử restart Python server

### Memory errors

- Giảm `CRAWL4AI_MAX_CONCURRENT` trong Python server environment
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

## License

MIT — xem [LICENSE](LICENSE).
