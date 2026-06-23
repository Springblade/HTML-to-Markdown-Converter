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
