#!/usr/bin/env python3
"""Lightweight FastAPI server wrapping crawl4ai AsyncWebCrawler.

Runs on port 11235. No Docker, no Redis.
NestJS (or any HTTP client) calls this server's REST API.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Optional, Union

logger = logging.getLogger("crawl4ai-server")

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.deep_crawling import (
    BestFirstCrawlingStrategy,
    FilterChain,
    DomainFilter,
    ContentTypeFilter,
)
from crawl4ai.deep_crawling.scorers import (
    CompositeScorer,
    PathDepthScorer,
    ContentTypeScorer,
    FreshnessScorer,
    DomainAuthorityScorer,
)
from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator


# ---------------------------------------------------------------------------
# Concurrency control
# ---------------------------------------------------------------------------
MAX_CONCURRENT = int(os.getenv("CRAWL4AI_MAX_CONCURRENT", "2"))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)
_running_counter = 0
_counter_lock = asyncio.Lock()

# ---------------------------------------------------------------------------
# Deep-crawl configuration
# ---------------------------------------------------------------------------
# User-facing cap on total pages (root + sub) per request. NestJS enforces the same
# @Max as a UX-level gate. Python uses this value directly as the BFS cap.
CRAWL_MAX_PAGES_TOTAL = int(os.getenv("CRAWL_MAX_PAGES_TOTAL", "10"))
# Maximum link depth to follow during deep crawl.
CRAWL_MAX_DEPTH = int(os.getenv("CRAWL_MAX_DEPTH", "3"))


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------
class CrawlRequest(BaseModel):
    url: str = Field(..., description="URL to crawl")
    # 0 or 1 = single-page crawl; 2..CRAWL_MAX_PAGES_TOTAL = deep crawl up to that many pages.
    max_depth: Optional[int] = Field(default=0, ge=0, le=CRAWL_MAX_PAGES_TOTAL)
    bypass_cache: bool = Field(default=True)
    # Optional extraction scoping and exclusion overrides.
    # css_selector: scope extraction to specific element(s), e.g. "main, article"
    css_selector: Optional[str] = Field(default=None, max_length=500)
    # excluded_tags: additional HTML tags/CSS selectors to strip (merged with server defaults)
    excluded_tags: Optional[list[str]] = Field(default=None, max_length=50)


class CrawlResponse(BaseModel):
    url: str
    markdown: str
    metadata: dict
    success: bool
    error: Optional[str] = None
    media: Optional[dict] = None
    links: Optional[dict] = None
    status_code: Optional[int] = None
    tables: Optional[list] = None


class DeepCrawlResponse(BaseModel):
    success: bool
    results: list[CrawlResponse]
    message: Optional[str] = None
    crawledUrls: Optional[int] = None


# ---------------------------------------------------------------------------
# Browser lifecycle management
# ---------------------------------------------------------------------------
BROWSER_MAX_REQUESTS = int(os.getenv("BROWSER_MAX_REQUESTS", "50"))
_request_count = 0
crawler_global: Optional[AsyncWebCrawler] = None
_browser_cfg: Optional[BrowserConfig] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    global crawler_global
    print("[crawl4ai-server] Starting browser...")
    browser_cfg = BrowserConfig(
        headless=True,
        extra_args=[
            "--disable-dev-shm-usage",
            "--js-flags=--max-old-space-size=512",
            "--disable-gpu",
            "--no-sandbox",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-default-apps",
            "--disable-sync",
            "--disable-translate",
            "--metrics-recording-only",
            "--mute-audio",
            "--no-first-run",
            "--disable-media-stream",
            "--disable-web-security",
            "--enable-features=NetworkService,NetworkServiceInProcess",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
        ],
    )
    global _browser_cfg
    _browser_cfg = browser_cfg
    global crawler_global
    crawler_global = AsyncWebCrawler(config=browser_cfg)
    try:
        await asyncio.wait_for(crawler_global.start(), timeout=120.0)
    except asyncio.TimeoutError:
        print("[crawl4ai-server] Browser initialization timed out after 120s")
        raise RuntimeError("Browser init timeout")
    print("[crawl4ai-server] Ready on http://0.0.0.0:11235")
    yield
    print("[crawl4ai-server] Shutting down...")
    if crawler_global:
        await crawler_global.close()


app = FastAPI(title="crawl4ai-server", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/stats")
async def stats():
    async with _counter_lock:
        running = _running_counter
    return {
        "running": running,
        "max_concurrency": MAX_CONCURRENT,
    }


@app.post("/crawl", response_model=Union[CrawlResponse, DeepCrawlResponse])
async def crawl(req: CrawlRequest):
    global _running_counter, crawler_global

    if crawler_global is None:
        raise HTTPException(status_code=503, detail="Browser not ready")

    use_deep = req.max_depth is not None and req.max_depth > 1

    try:
        await asyncio.wait_for(_semaphore.acquire(), timeout=5.0)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Queue full")

    async with _counter_lock:
        _running_counter += 1

    try:
        md_generator = DefaultMarkdownGenerator(content_filter=None)
        # Merge user-provided excluded_tags with server defaults (user list extends defaults)
        merged_excluded_tags = list({"nav", "footer", "header", "aside", "script", "style", "noscript", "form"})
        if req.excluded_tags:
            for tag in req.excluded_tags:
                if tag not in merged_excluded_tags:
                    merged_excluded_tags.append(tag)
        run_cfg_kwargs = {
            "cache_mode": CacheMode.BYPASS if req.bypass_cache else CacheMode.DEFAULT,
            "markdown_generator": md_generator,
            # Noise-stripping defaults merged with user overrides
            "excluded_tags": merged_excluded_tags,
            "remove_overlay_elements": True,
            "exclude_external_links": True,
            "exclude_external_images": False,
            "exclude_social_media_links": True,
            "screenshot": False,
        }
        # Optional css_selector to scope extraction to specific elements
        if req.css_selector:
            run_cfg_kwargs["css_selector"] = req.css_selector
        if use_deep:
            filter_chain = FilterChain([
                DomainFilter(),
                ContentTypeFilter(allowed_types=["text/html"]),
            ])
            scorer = CompositeScorer(
                scorers=[
                    PathDepthScorer(optimal_depth=3, weight=0.8),
                    ContentTypeScorer(type_weights={"html": 1.0}, weight=0.9),
                    FreshnessScorer(weight=0.7, current_year=datetime.now().year),
                    DomainAuthorityScorer(domain_weights={}, default_weight=0.5, weight=0.5),
                ],
                normalize=True,
            )
            run_cfg_kwargs["deep_crawl_strategy"] = BestFirstCrawlingStrategy(
                max_depth=CRAWL_MAX_DEPTH,
                max_pages=min(req.max_depth + 1, CRAWL_MAX_PAGES_TOTAL),
                url_scorer=scorer,
                filter_chain=filter_chain,
            )
        run_cfg = CrawlerRunConfig(**run_cfg_kwargs)

        raw_results = await crawler_global.arun(url=req.url, config=run_cfg)
        # BFSDeepCrawlStrategy returns a list; single arun returns one CrawlResult.
        if not isinstance(raw_results, list):
            raw_results = [raw_results]

        logger.info(f"[DEBUG] arun returned {len(raw_results)} raw results for {req.url}")

        items: list[CrawlResponse] = []
        for idx, r in enumerate(raw_results):
            md = (r.markdown.raw_markdown if r.markdown else "") or ""
            items.append(
                CrawlResponse(
                    url=r.url,
                    markdown=md,
                    metadata={
                        "title": (r.metadata.get("title", "") if r.metadata else ""),
                        "description": (r.metadata.get("description", "") if r.metadata else ""),
                    },
                    success=bool(getattr(r, "success", True)),
                    media=getattr(r, "media", None),
                    links=getattr(r, "links", None),
                    status_code=getattr(r, "status_code", None),
                    tables=getattr(r, "tables", None),
                )
            )
            logger.info(f"[DEBUG]   item[{idx}] url={r.url} success={getattr(r, 'success', True)}")

        logger.info(f"[DEBUG] built {len(items)} items from {len(raw_results)} raw results")

        if use_deep:
            return DeepCrawlResponse(success=True, results=items, crawledUrls=len(items))
        return items[0]
    except Exception as exc:
        if use_deep:
            return DeepCrawlResponse(success=False, results=[], message=str(exc))
        return CrawlResponse(
            url=req.url,
            markdown="",
            metadata={},
            success=False,
            error=str(exc),
        )
    finally:
        async with _counter_lock:
            _running_counter -= 1
        _semaphore.release()

        # Restart browser periodically to prevent memory accumulation
        global _request_count  # crawler_global already declared global above
        _request_count += 1
        if _request_count >= BROWSER_MAX_REQUESTS:
            logger.info(f"[BROWSER] Restarting after {_request_count} requests...")
            if crawler_global:
                await crawler_global.close()
            if _browser_cfg is not None:
                crawler_global = AsyncWebCrawler(config=_browser_cfg)
                await asyncio.wait_for(crawler_global.start(), timeout=120.0)
            _request_count = 0


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("CRAWL4AI_PORT", "11235"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info", timeout_keep_alive=60)
