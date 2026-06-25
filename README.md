# HTML-Markdown

Convert any website to clean Markdown with a single request. Uses a headless browser to render JavaScript-heavy pages, then extracts content as readable Markdown.

> Also available in: [Tiếng Việt](README.vi.md)

## Features

- **Single-page crawl** — Convert one URL to Markdown instantly
- **Deep crawl** — Recursively crawl up to 10 pages using best-first search with configurable depth
- **Headless rendering** — Full JavaScript support via crawl4ai (Chromium headless)
- **Content filtering** — Scope extraction to specific CSS selectors, exclude unwanted tags
- **REST API** — NestJS-powered API with retry logic, concurrency control, and clean response shapes
- **Memory adaptive** — Automatically adjusts crawl speed based on system memory usage
- **Next.js frontend** — Simple web interface to trigger crawls and preview results

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start all services in parallel
pnpm dev

# 3. Open the web interface
# http://localhost:3000
```

Enter a URL, choose the number of pages to crawl, and download the result as Markdown.

---

## Architecture

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

### How it works

1. **Next.js Web** — User enters URL and options in the browser
2. **NestJS API** — Validates input, adds retry logic, normalizes response
3. **Python Server** — Wraps crawl4ai's AsyncWebCrawler with:
   - Lazy browser initialization (starts Chromium on first request)
   - Memory-adaptive dispatching (adjusts speed based on system load)
   - Best-first deep crawling strategy for multi-page extraction
4. **crawl4ai** — Renders page in headless Chromium, extracts content as Markdown

---

## Installation

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 20+ | For NestJS API and Next.js |
| Python | 3.10+ | For crawl4ai server |
| pnpm | 8+ | Package manager |
| Chromium | (auto-installed) | Headless browser for crawl4ai |

### One-command setup

```bash
pnpm install && pnpm dev
```

### Manual setup

**Python Server** (crawl4ai)

```bash
pip install crawl4ai fastapi uvicorn pydantic psutil
python python_server.py
```

The server listens on `http://localhost:11235`. Browser starts lazily on first request.

**NestJS API**

```bash
cd apps/api
pnpm install
pnpm start:dev
```

The API listens on `http://localhost:3001`.

**Next.js Frontend**

```bash
cd apps/web
pnpm install
pnpm dev
```

The frontend listens on `http://localhost:3000`.

---

## Usage

### Web Interface

Open `http://localhost:3000` in your browser.

1. Enter a URL (e.g., `https://example.com`)
2. Choose number of pages (0-10)
3. Click "Convert to Markdown"
4. Preview result or download as `.md` file

### API Examples

**Single page crawl:**

```bash
curl -X POST http://localhost:3001/crawl \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com", "maxPages": 1}'
```

**Deep crawl (5 pages):**

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

**Health check:**

```bash
curl http://localhost:3001/health
# {"status": "ok"}
```

**Server stats:**

```bash
curl http://localhost:11235/stats
```

---

## API Reference

### POST /crawl

Crawl a URL and return the result as Markdown.

**Request body:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `url` | `string` | Required | Target URL to crawl |
| `maxPages` | `integer` | `1` | Pages to crawl (1-10). `1` = single page |
| `cssSelector` | `string` | `null` | CSS selector to scope extraction (e.g., `"main, article"`) |
| `excludedTags` | `string[]` | `null` | Additional HTML tags to exclude from output |

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
    "images": ["Alt text of first image", "Alt text of second image"]
  },
  "links": [],
  "status_code": 200,
  "tables": []
}
```

**Error responses:**

| Status | Meaning |
|--------|---------|
| `400` | Invalid URL or parameters |
| `503` | Service unavailable (browser not started, server at capacity) |

### GET /health

Returns service health status.

```json
{"status": "ok"}
```

### GET /stats (Python server only)

Returns current server state including memory usage and concurrency.

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

## Configuration

### Environment Variables

#### `apps/api/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `CRAWL4AI_URL` | `http://localhost:11235` | Python server base URL |
| `CRAWL4AI_TIMEOUT` | `120` | Request timeout in seconds |
| `CRAWL4AI_API_KEY` | _(empty)_ | Optional API key for crawl4ai auth |
| `CRAWL_MAX_PAGES_TOTAL` | `10` | Hard cap on pages per crawl request |
| `CRAWL_MAX_DEPTH` | `3` | Maximum link depth for deep crawl |
| `PORT` | `3001` | NestJS server port |

#### `apps/web/.env`

| Variable | Default | Description |
|----------|---------|-------------|
| `NESTJS_API_URL` | `http://localhost:3001` | NestJS API base URL |

#### `python_server.py` (via environment)

| Variable | Default | Description |
|----------|---------|-------------|
| `CRAWL4AI_PORT` | `11235` | Python server port |
| `CRAWL4AI_MAX_CONCURRENT` | `2` | Maximum concurrent crawl requests |
| `CRAWL4AI_QUEUE_TIMEOUT` | `30` | Queue wait timeout in seconds |
| `CRAWL4AI_MEMORY_THRESHOLD` | `90.0` | System memory % threshold to pause crawling |
| `CRAWL4AI_MEMORY_TIMEOUT` | `30` | Wait time before retry when memory threshold reached |
| `CRAWL4AI_V8_MAX_OLD_SPACE_SIZE` | `1536` | V8 JavaScript heap size in MB |
| `IDLE_TIMEOUT` | `60` | Seconds before browser closes after last request |

---

## Troubleshooting

### Browser fails to start

```
Error: Browser failed to start
```

**Solutions:**
- Ensure Chromium/Chrome is installed on your system
- Check if port 11235 is available
- Run with verbose logging: `python python_server.py --log-level debug`

### Memory issues

```
Error: Memory threshold exceeded
```

**Solutions:**
- Reduce `maxPages` for deep crawl
- Increase `CRAWL4AI_MEMORY_THRESHOLD` if system has more RAM
- Close other memory-intensive applications

### Timeout errors

```
Error: crawl4ai unavailable: timeout
```

**Solutions:**
- Increase `CRAWL4AI_TIMEOUT` in `apps/api/.env`
- Try with fewer pages
- Check network connectivity to target URL

### Server at capacity

```
Error: Server at capacity, try again later
```

**Solutions:**
- Wait a few seconds and retry
- Increase `CRAWL4AI_MAX_CONCURRENT` in Python server environment
- Check `/stats` endpoint for current load

### Port already in use

```bash
# Kill processes on specific ports
# Windows:
.\scripts\kill-ports.ps1

# Linux/Mac:
kill -9 $(lsof -ti:3000,3001,11235)

# Then restart services
pnpm dev
```

---

## Development

### Project Structure

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
│           └── lib/         # Utilities and types
├── scripts/
│   └── kill-ports.ps1       # Port cleanup script
└── package.json             # pnpm workspace root
```

### Running tests

```bash
cd apps/api
pnpm test
```

### Code style

```bash
pnpm lint
```

---

## Contributing

1. Branch naming: `feat/<name>`, `fix/<name>`, `chore/<name>`
2. Commit style: `feat: add deep crawl option`, `fix: retry logic on 503`
3. Run `pnpm lint` before pushing
4. All tests must pass: `pnpm test`

---

## License

MIT — see [LICENSE](LICENSE).
