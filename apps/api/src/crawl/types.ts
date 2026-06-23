export interface MediaResult {
  images: string[];
}

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
  crawledUrlsCount?: number;
  media?: MediaResult;
  links?: unknown;
  status_code?: number;
  tables?: unknown;
}

export interface Crawl4aiResponse {
  url: string;
  markdown: string;
  metadata: Record<string, string>;
  success: boolean;
  error?: string | null;
  error_message?: string | null;
  media?: unknown;
  links?: unknown;
  status_code?: number;
  tables?: unknown;
}

export interface Crawl4aiErrorResponse {
  detail?: string;
}

export interface Crawl4aiDeepResponse {
  success: boolean;
  results: Crawl4aiResponse[];
  message?: string;
  crawledUrls?: number;
}
