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
    child_mb: number;
    total_mb: number;
    percent: number;
    threshold_percent: number;
    system_total_gb: number;
    system_used_gb: number;
  };
  crawler: {
    running: number;
    max_concurrent: number;
    child_count: number;
  };
  last_crawl?: {
    memory_before_mb: number;
    memory_after_mb: number;
  };
}
