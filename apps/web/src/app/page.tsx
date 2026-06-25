'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { CrawlForm } from '@/components/CrawlForm';
import { MarkdownPreview } from '@/components/MarkdownPreview';
import { StatsPanel } from '@/components/StatsPanel';
import { convertToMarkdown } from '@/lib/api-client';

export default function Home() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [crawledUrls, setCrawledUrls] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (url: string, maxPages: number) => {
    setIsLoading(true);
    setError(null);
    setMarkdown(null);
    setCrawledUrls(null);

    try {
      const crawlResponse = await convertToMarkdown({ url, maxPages });
      setMarkdown(crawlResponse.markdown);
      setCrawledUrls(crawlResponse.crawledUrls ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const isEmpty = !markdown && !isLoading;

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Header />
      <main className="flex-1 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-12">
          <section className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-zinc-900">
              Convert any website to Markdown
            </h2>
            <p className="mt-3 text-zinc-500">
              Paste a URL below and get clean, readable markdown in seconds
            </p>
          </section>

          <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
            <CrawlForm onSubmit={handleSubmit} isLoading={isLoading} error={error} />
          </section>

          <section>
            <StatsPanel isCrawling={isLoading} />
          </section>

          <section>
            <MarkdownPreview
              markdown={markdown}
              crawledUrls={crawledUrls}
              isLoading={isLoading}
              isEmpty={isEmpty}
            />
          </section>
        </div>
      </main>

      <footer className="border-t border-zinc-100 px-6 py-6">
        <p className="text-center text-sm text-zinc-400">
          Built with crawl4ai
        </p>
      </footer>
    </div>
  );
}
