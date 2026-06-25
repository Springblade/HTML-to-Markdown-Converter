import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import {
  CrawlResult,
  extractTitle,
  buildMarkdown,
  dedupePagesByUrl,
  isRetryableError,
  isRoutableHostname,
} from './crawl.utils';
import { Crawl4aiResponse, Crawl4aiDeepResponse } from './types';

function coerceEnvInt(value: string | undefined, fallback: number): number {
  const parsed = parseInt(value ?? '', 10);
  return isNaN(parsed) || parsed < 1 ? fallback : parsed;
}

function collectMediaImages(pages: Crawl4aiResponse[]): { images: string[] } {
  const images: string[] = pages
    .flatMap((page) => ((page.media as Record<string, unknown>)?.images as Record<string, unknown>[] | undefined) ?? [])
    .map((img) => {
      const alt = img?.alt as string | undefined;
      const desc = img?.desc as string | undefined;
      return alt?.trim() || desc?.trim() || null;
    })
    .filter((text): text is string => text !== null && text.length > 0);
  return { images };
}

@Injectable()
export class CrawlService {
  private readonly logger = new Logger(CrawlService.name);
  private client: AxiosInstance;
  private readonly maxPages: number;
  private readonly MAX_RETRIES = 2;
  private readonly BASE_DELAY_MS = 1_000;
  private readonly MAX_DELAY_MS = 10_000;

  constructor() {
    const baseURL = process.env.CRAWL4AI_URL ?? 'http://localhost:11235';
    const apiKey = process.env.CRAWL4AI_API_KEY;
    const timeout = coerceEnvInt(process.env.CRAWL4AI_TIMEOUT, 120) * 1_000;
    this.maxPages = coerceEnvInt(process.env.CRAWL_MAX_PAGES_TOTAL, 10);

    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    this.client = axios.create({
      baseURL,
      timeout,
      headers,
    });

    this.logger.log(
      `CrawlService initialized (crawl4ai=${baseURL}, timeout=${timeout}ms, maxPages=${this.maxPages})`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async crawlDeepOnce(
    rootUrl: string,
    maxPages: number,
    options?: { cssSelector?: string; excludedTags?: string[] },
  ): Promise<Crawl4aiResponse | Crawl4aiDeepResponse> {
    const parsed = new URL(rootUrl);
    if (!isRoutableHostname(parsed.hostname)) {
      throw new Error(`URL hostname is not publicly routable: ${parsed.hostname}`);
    }

    // max_pages caps the total BFS page count. 0 or 1 means single-page crawl.
    const maxDepth = maxPages > 1 ? Math.min(maxPages, this.maxPages) : 0;
    const payload: Record<string, unknown> = {
      url: rootUrl,
      max_depth: maxDepth,
      bypass_cache: true,
    };
    if (options?.cssSelector) {
      payload.css_selector = options.cssSelector;
    }
    if (options?.excludedTags) {
      payload.excluded_tags = options.excludedTags;
    }

    try {
      const response = await this.client.post<Crawl4aiResponse | Crawl4aiDeepResponse>(
        '/crawl',
        payload,
      );
      return response.data;
    } catch (err) {
      const error = err as { response?: { status?: number; data?: { detail?: string } }; message?: string };
      if (error.response?.status === 503) {
        const detail = error.response?.data?.detail ?? 'Service unavailable';
        throw new Error(`crawl4ai unavailable: ${detail}`, { cause: err });
      }
      throw err;
    }
  }

  private async crawlDeep(
    rootUrl: string,
    maxPages: number,
    options?: { cssSelector?: string; excludedTags?: string[] },
  ): Promise<CrawlResult> {
    const response = await this.crawlDeepOnce(rootUrl, maxPages, options);

    // Deep-crawl responses carry `results: []`; single-page responses have `markdown` directly.
    const isDeep = Array.isArray((response as Crawl4aiDeepResponse).results);
    const pages: Crawl4aiResponse[] = isDeep
      ? (response as Crawl4aiDeepResponse).results
      : [response as Crawl4aiResponse];

    // crawl4ai can return the same URL twice (root + child link discovered on root).
    // Dedupe once here so downstream consumers (markdown, crawledUrls, pageCount, hasErrors)
    // all see consistent, unique URLs.
    const dedupedPages = dedupePagesByUrl(pages);
     
    this.logger.log(
      `[DIAG] crawl url=${rootUrl} maxPages=${maxPages} raw=${pages.length} deduped=${dedupedPages.length} successful=${dedupedPages.filter((p) => p.success).length} failed=${dedupedPages.filter((p) => !p.success).length}`,
    );

    const title = dedupedPages[0]?.success ? extractTitle(dedupedPages[0].markdown) : '';
    const crawledUrls = dedupedPages.filter((page) => page.success).map((page) => page.url);
    const hasErrors = dedupedPages.some((page) => !page.success);

    const media = collectMediaImages(dedupedPages);

    // Collect links and tables from all pages
    const allLinks: Record<string, unknown>[] = dedupedPages.flatMap(
      (page) => ((page.links as Record<string, unknown>) ?? []) as Record<string, unknown>[],
    );
    const allTables: unknown[] = dedupedPages.flatMap((page) => (page.tables as unknown[]) ?? []);

    const statusCode = dedupedPages[0]?.status_code;
    const crawledUrlsCount = (response as Crawl4aiDeepResponse).crawledUrls;

    this.logger.log(
      `[DIAG] crawl url=${rootUrl} maxPages=${maxPages} raw=${pages.length} deduped=${dedupedPages.length} successful=${dedupedPages.filter((page) => page.success).length} failed=${dedupedPages.filter((page) => !page.success).length}`,
    );

    return {
      markdown: buildMarkdown(dedupedPages),
      metadata: {
        title,
        rootUrl,
        generatedAt: new Date().toISOString(),
      },
      cached: false,
      pageCount: dedupedPages.length,
      hasErrors,
      crawledUrls,
      crawledUrlsCount,
      media,
      links: allLinks,
      status_code: statusCode,
      tables: allTables,
    };
  }

  async crawlAndConvert(
    rootUrl: string,
    maxPages: number,
    options?: { cssSelector?: string; excludedTags?: string[] },
  ): Promise<CrawlResult> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        return await this.crawlDeep(rootUrl, maxPages, options);
      } catch (err) {
        lastError = err as Error;
        const axiosErr = err as { response?: { status?: number } };
        if (!isRetryableError(axiosErr.response?.status)) throw lastError;
        if (attempt < this.MAX_RETRIES) {
          const delay = Math.min(this.BASE_DELAY_MS * 2 ** attempt, this.MAX_DELAY_MS);
          this.logger.warn(`Retrying ${rootUrl} (attempt ${attempt + 1}/${this.MAX_RETRIES + 1}): ${lastError.message}`);
          await this.sleep(delay);
        }
      }
    }
    throw lastError!;
  }
}
