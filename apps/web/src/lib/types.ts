export interface CrawlResult {
  markdown: string;
  metadata: {
    title: string;
    rootUrl: string;
    generatedAt: string;
  };
  cached: boolean;
  pageCount: number;
  hasErrors?: boolean;
  crawledUrls: string[];
}

export interface ServerStats {
  memory: {
    rss_mb: number;
    percent: number;
    threshold_percent: number;
  };
  crawler: {
    running: number;
    max_concurrent: number;
  };
  last_crawl?: {
    memory_before_mb: number;
    memory_after_mb: number;
  };
}
