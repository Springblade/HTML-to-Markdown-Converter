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

import psutil

logger = logging.getLogger("crawl4ai-server")

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
from crawl4ai.async_dispatcher import MemoryAdaptiveDispatcher
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
QUEUE_TIMEOUT = float(os.getenv("CRAWL4AI_QUEUE_TIMEOUT", "30"))
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)
_running_counter = 0
_counter_lock = asyncio.Lock()

# ---------------------------------------------------------------------------
# Memory-adaptive dispatcher configuration
# ---------------------------------------------------------------------------
MEMORY_THRESHOLD = float(os.getenv("CRAWL4AI_MEMORY_THRESHOLD", "90.0"))
MEMORY_TIMEOUT = float(os.getenv("CRAWL4AI_MEMORY_TIMEOUT", "30"))
V8_MAX_OLD_SPACE_SIZE = int(os.getenv("CRAWL4AI_V8_MAX_OLD_SPACE_SIZE", "1536"))

# ---------------------------------------------------------------------------
# Deep-crawl configuration
# ---------------------------------------------------------------------------
# User-facing cap on total pages (root + sub) per request. NestJS enforces the same
# @Max as a UX-level gate. Python uses this value directly as the BFS cap.
CRAWL_MAX_PAGES_TOTAL = int(os.getenv("CRAWL_MAX_PAGES_TOTAL", "10"))
# Maximum link depth to follow during deep crawl.
CRAWL_MAX_DEPTH = int(os.getenv("CRAWL_MAX_DEPTH", "3"))

# ---------------------------------------------------------------------------
# Lazy browser initialization configuration
# ---------------------------------------------------------------------------
IDLE_TIMEOUT = int(os.getenv("IDLE_TIMEOUT", "60"))  # seconds before browser closes
last_request_time: float = 0.0
browser_initializing: bool = False


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
# Global state
# ---------------------------------------------------------------------------
crawler_global: Optional[AsyncWebCrawler] = None
dispatcher_global: Optional[MemoryAdaptiveDispatcher] = None
_init_lock = asyncio.Lock()


async def _ensure_browser() -> bool:
    """Lazily initialize browser on first request. Returns True if browser is ready."""
    global crawler_global, last_request_time, browser_initializing

    if crawler_global is not None:
        last_request_time = asyncio.get_event_loop().time()
        return True

    async with _init_lock:
        if crawler_global is not None:  # Another coroutine initialized while waiting
            last_request_time = asyncio.get_event_loop().time()
            return True

        if browser_initializing:  # Prevent concurrent init
            while browser_initializing:
                await asyncio.sleep(0.1)
            return crawler_global is not None

        browser_initializing = True
        try:
            logger.info("[LAZY_INIT] Starting browser on first request...")
            browser_cfg = BrowserConfig(
                headless=True,
                extra_args=[
                    "--disable-dev-shm-usage",
                    f"--js-flags=--max-old-space-size={V8_MAX_OLD_SPACE_SIZE}",
                    "--disable-gpu",
                    "--no-sandbox",
                ],
            )
            crawler_global = AsyncWebCrawler(config=browser_cfg)
            await crawler_global.start()
            last_request_time = asyncio.get_event_loop().time()
            logger.info("[LAZY_INIT] Browser started successfully")
            return True
        except Exception as e:
            logger.error(f"[LAZY_INIT] Failed to start browser: {e}")
            return False
        finally:
            browser_initializing = False


async def _close_browser():
    """Close browser if exists."""
    global crawler_global
    if crawler_global is not None:
        logger.info("[CLEANUP] Closing browser after idle timeout")
        await crawler_global.close()
        crawler_global = None


async def _idle_monitor():
    """Background task: close browser after idle timeout."""
    while True:
        await asyncio.sleep(30)  # Check every 30 seconds
        if crawler_global is not None:
            current_time = asyncio.get_event_loop().time()
            idle_time = current_time - last_request_time
            if idle_time >= IDLE_TIMEOUT:
                await _close_browser()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
    global dispatcher_global
    dispatcher_global = MemoryAdaptiveDispatcher(
        memory_threshold_percent=MEMORY_THRESHOLD,
        memory_wait_timeout=MEMORY_TIMEOUT,
        check_interval=1.0,
    )
    logger.info(f"[INIT] Dispatcher created: memory_threshold={MEMORY_THRESHOLD}%, timeout={MEMORY_TIMEOUT}s")
    logger.info("[INIT] Browser will start lazily on first crawl request")
    logger.info(f"[crawl4ai-server] Ready on http://0.0.0.0:11235 (idle)")

    # Start idle monitor background task
    monitor_task = asyncio.create_task(_idle_monitor())

    yield
    logger.info("[crawl4ai-server] Shutting down...")
    monitor_task.cancel()
    try:
        await monitor_task
    except asyncio.CancelledError:
        pass
    await _close_browser()


app = FastAPI(title="crawl4ai-server", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "ok", "browser_ready": crawler_global is not None}


@app.get("/stats")
async def stats():
    async with _counter_lock:
        running = _running_counter
    process = psutil.Process()
    memory_info = process.memory_info()

    # Track child processes (browser instances spawned by crawl4ai)
    children = process.children(recursive=True)
    child_memory_mb = 0.0
    child_count = 0
    for child in children:
        try:
            child_memory_mb += child.memory_info().rss / 1024 / 1024
            child_count += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    memory_rss_mb = memory_info.rss / 1024 / 1024
    total_memory_mb = memory_rss_mb + child_memory_mb

    return {
        "running": running,
        "max_concurrency": MAX_CONCURRENT,
        "memory_threshold_percent": MEMORY_THRESHOLD,
        "memory_timeout": MEMORY_TIMEOUT,
        "v8_max_old_space_size": V8_MAX_OLD_SPACE_SIZE,
        "queue_timeout": QUEUE_TIMEOUT,
        "memory_rss_mb": round(memory_rss_mb, 1),
        "memory_vms_mb": round(memory_info.vms / 1024 / 1024, 1),
        "child_memory_mb": round(child_memory_mb, 1),
        "child_count": child_count,
        "total_memory_mb": round(total_memory_mb, 1),
        "system_memory_percent": psutil.virtual_memory().percent,
        "system_memory_total_gb": round(psutil.virtual_memory().total / (1024**3), 1),
        "system_memory_used_gb": round(psutil.virtual_memory().used / (1024**3), 1),
        "browser_ready": crawler_global is not None,
        "idle_timeout": IDLE_TIMEOUT,
    }


@app.post("/crawl", response_model=Union[CrawlResponse, DeepCrawlResponse])
async def crawl(req: CrawlRequest):
    global _running_counter

    # Lazy browser init on first request
    if not await _ensure_browser():
        raise HTTPException(status_code=503, detail="Browser failed to start")

    use_deep = req.max_depth is not None and req.max_depth > 1

    try:
        await asyncio.wait_for(_semaphore.acquire(), timeout=QUEUE_TIMEOUT)
    except asyncio.TimeoutError:
        raise HTTPException(status_code=503, detail="Server at capacity, try again later")

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
            # Always enable screenshot to populate r.media
            "screenshot": True,
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

        if dispatcher_global is None:
            raise HTTPException(status_code=503, detail="Dispatcher not initialized")

        logger.info(f"[DEBUG] Starting crawl for {req.url} with dispatcher={type(dispatcher_global).__name__}")
        raw_results = await crawler_global.arun(url=req.url, config=run_cfg, dispatcher=dispatcher_global)
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
                    metadata=dict(r.metadata) if r.metadata else {},
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


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("CRAWL4AI_PORT", "11235"))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
