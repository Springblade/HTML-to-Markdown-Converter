'use client';

import { useState } from 'react';

interface MarkdownPreviewProps {
  markdown: string | null;
  crawledUrls: string[] | null;
  isLoading: boolean;
  isEmpty?: boolean;
}

interface CrawledUrlItemProps {
  url: string;
  onCopy: (url: string) => void;
  copiedUrl: string | null;
}

function CrawledUrlItem({ url, onCopy, copiedUrl }: CrawledUrlItemProps) {
  return (
    <li className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-zinc-100 group">
      <svg className="h-3.5 w-3.5 shrink-0 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="truncate flex-1 text-zinc-600" title={url}>
        {url}
      </span>
      <button
        onClick={() => onCopy(url)}
        className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-zinc-600"
        title="Copy URL"
      >
        {copiedUrl === url ? (
          <svg className="h-3.5 w-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </li>
  );
}

function CrawledUrlList({ urls, onCopy, copiedUrl }: { urls: string[]; onCopy: (url: string) => void; copiedUrl: string | null }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-zinc-700">
        {urls.length} {urls.length === 1 ? 'page' : 'pages'} crawled
      </p>
      <ul className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
        {urls.map((url) => (
          <CrawledUrlItem key={url} url={url} onCopy={onCopy} copiedUrl={copiedUrl} />
        ))}
      </ul>
    </div>
  );
}

export function MarkdownPreview({
  markdown,
  crawledUrls,
  isLoading,
  isEmpty = true,
}: MarkdownPreviewProps) {
  const [copied, setCopied] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const handleCopy = async () => {
    if (!markdown) return;
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyUrl = async (url: string) => {
    await navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-6 w-44 animate-pulse rounded bg-zinc-200" />
        </div>
        <div className="h-32 animate-pulse rounded bg-zinc-100" />
        <div className="flex items-center justify-between">
          <div className="h-6 w-32 animate-pulse rounded bg-zinc-200" />
          <div className="h-8 w-24 animate-pulse rounded bg-zinc-200" />
        </div>
        <div className="space-y-3">
          {[100, 80, 60, 90, 70, 85].map((width, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-zinc-200"
              style={{ width: `${width}%` }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 py-16 text-center">
        <svg
          className="mb-4 h-12 w-12 text-zinc-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm font-medium text-zinc-500">
          Your markdown will appear here
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Enter a URL above to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {crawledUrls && crawledUrls.length > 0 && (
        <CrawledUrlList urls={crawledUrls} onCopy={handleCopyUrl} copiedUrl={copiedUrl} />
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-zinc-900">Result</h2>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-all duration-200
            hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500/20"
        >
          {copied ? (
            <>
              <svg className="h-4 w-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-green-700">Copied</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-zinc-200">
        <pre className="max-h-[500px] overflow-auto bg-white p-4 font-mono text-sm text-zinc-800">
          <code>{markdown}</code>
        </pre>
      </div>
    </div>
  );
}
