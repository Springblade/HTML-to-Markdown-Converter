# HTML-Markdown

A web scraping tool that converts HTML pages to clean Markdown using a headless browser (crawl4ai), with a REST API and a Next.js frontend.

## Features

- **Single-page crawl** — Convert one URL to Markdown instantly
- **Deep crawl** — Recursively crawl up to 10 pages using BFS with configurable depth
- **Headless browser extraction** — Renders JavaScript-heavy pages via crawl4ai (AsyncWebCrawler)
- **REST API** — NestJS-powered API with retry logic, concurrency control, and clean response shapes
- **Next.js frontend** — Simple web interface to trigger crawls

## Architecture

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

The Python server runs a FastAPI app wrapping crawl4ai's `AsyncWebCrawler`. It starts a single headless browser instance on boot and reuses it across requests. Single-page and deep-crawl requests both flow through `POST /crawl`. The NestJS API handles input validation, retry logic, and response normalization before returning clean Markdown to the frontend.

## Quick Start

```bash
# 1. Install dependencies
pnpm install

# 2. Start all three services in parallel
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — enter a URL, pick the number of pages to crawl, and download the result.

## Setup

### Prerequisites

- **Node.js** 20+ (for NestJS API and Next.js frontend)
- **Python** 3.10+ (for the crawl4ai server)
- **pnpm** 8+

### Python Server

```bash
# Install crawl4ai
pip install crawl4ai fastapi uvicorn pydantic

# Start the server
python python_server.py
```

The Python server listens on `http://localhost:11235`. It starts a headless Chromium browser and keeps it warm between requests.

### NestJS API

```bash
cd apps/api
pnpm install
pnpm start:dev
```

The API listens on `http://localhost:3001`.

### Next.js Frontend

```bash
cd apps/web
pnpm install
pnpm dev
```

The frontend listens on `http://localhost:3000`.

## API Endpoints

### `POST /crawl`

Crawl a URL and return the result as Markdown.

**Request body:**

| Field | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | Target URL to crawl (required) |
| `maxPages` | `integer` | `1` | Number of pages to crawl (1–10). `1` = single page |
| `cssSelector` | `string` | `null` | Scope extraction to specific CSS selector(s), e.g. `"main, article"` |
| `excludedTags` | `string[]` | `null` | Additional HTML tags to strip from output |

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

Returns `{"status": "ok"}` if the API is running.

### `GET /stats` (Python server only)

Returns current concurrency state:

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
| `CRAWL4AI_TIMEOUT` | `120` | Request timeout in seconds |
| `CRAWL4AI_API_KEY` | _(empty)_ | Optional API key for crawl4ai auth |
| `CRAWL_MAX_PAGES_TOTAL` | `10` | Hard cap on pages per crawl request |
| `CRAWL_MAX_DEPTH` | `3` | Maximum link depth for deep crawl |
| `PORT` | `3001` | NestJS server port |

### `apps/api/.env`

| Variable | Default | Description |
|---|---|---|
| `CRAWL4AI_URL` | `http://localhost:11235` | Python server base URL |
| `CRAWL4AI_TIMEOUT` | `120` | Request timeout in seconds |
| `CRAWL4AI_API_KEY` | _(empty)_ | Optional API key for crawl4ai auth |
| `CRAWL_MAX_PAGES_TOTAL` | `10` | Hard cap on pages per crawl request |
| `CRAWL_MAX_DEPTH` | `3` | Maximum link depth for deep crawl |
| `PORT` | `3001` | NestJS server port |

### `apps/web/.env.local`

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | NestJS API base URL |

## Deployment

This is a multi-service stack. Vercel hosts the Next.js frontend; backend services (NestJS API + Python crawl4ai server) are deployed to Render.com (free tier).

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Vercel         │     │  Render         │     │  Render         │
│  Next.js        │────▶│  NestJS API     │────▶│  crawl4ai       │
│  (Frontend)     │     │  (Port 3001)    │     │  (Port 11235)   │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Step 1 — Deploy backend to Render

1. Push your code to a GitHub repo.
2. Go to [render.com/blueprints](https://render.com/blueprints) and click **"New Blueprint Instance"**.
3. Connect your GitHub account and select your repo — `render.yaml` is auto-detected.
4. Render will create two services: `crawl4ai-server` and `html-markdown-api`.
5. Wait for both to deploy. Note the URL of `html-markdown-api` (e.g. `https://html-markdown-api.onrender.com`).

> **Cold start:** On Render's free tier, services sleep after 15 minutes of inactivity. The first request after sleep takes ~30–60 seconds to wake both services.

### Step 2 — Deploy frontend to Vercel

1. Go to [vercel.com](https://vercel.com) and import your GitHub repo.
2. Set **Root Directory** to `apps/web`.
3. Set **Build Command** to: `pnpm install && pnpm --filter web build`
4. Set **Output Directory** to: `.next`
5. Add environment variable:
   - **Key:** `NEXT_PUBLIC_API_URL`
   - **Value:** your Render API URL from Step 1 (e.g. `https://html-markdown-api.onrender.com`)
6. Click **Deploy**.

### Keep services awake (optional)

Use a free cron job service (e.g. [Kaffeine](https://kaffeine.herokuapp.com/)) to ping your Render services every 10 minutes so they never sleep.

## Contributing

- Branch naming: `feat/<name>`, `fix/<name>`, `chore/<name>`
- Commit style: `feat: add deep crawl option`, `fix: retry logic on 503`
- Run `pnpm lint` before pushing
- All tests must pass: `pnpm test`

## License

MIT — see [LICENSE](LICENSE).
