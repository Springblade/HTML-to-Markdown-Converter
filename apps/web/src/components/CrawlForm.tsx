'use client';

import { useState, useRef } from 'react';
import { validateUrl } from '@/lib/validators';

interface CrawlFormProps {
  onSubmit: (url: string, maxPages: number) => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

export function CrawlForm({ onSubmit, isLoading, error }: CrawlFormProps) {
  const [url, setUrl] = useState('');
  const [maxPages, setMaxPages] = useState<number | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const checkUrl = (value: string): boolean => {
    const result = validateUrl(value);
    if (!result.valid) {
      setValidationError(result.error);
      return false;
    }
    setValidationError(null);
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkUrl(url)) {
      inputRef.current?.focus();
      return;
    }
    await onSubmit(url, maxPages ?? 0);
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value);
    if (validationError) {
      checkUrl(e.target.value);
    }
  };

  const displayError = validationError || error;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <label htmlFor="url" className="block text-sm font-medium text-zinc-900">
          Website URL
        </label>
        <input
          ref={inputRef}
          id="url"
          type="url"
          value={url}
          onChange={handleUrlChange}
          placeholder="https://example.com"
          disabled={isLoading}
          autoComplete="url"
          autoFocus
          className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 placeholder-zinc-400 transition-all duration-200
            focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-zinc-500">
          Enter the full URL including https://
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="maxPages" className="block text-sm font-medium text-zinc-900">
          Number of pages to crawl
        </label>
        <input
          id="maxPages"
          type="number"
          min={0}
          max={10}
          value={maxPages ?? ''}
          onChange={(e) =>
            setMaxPages(e.target.value === '' ? null : parseInt(e.target.value, 10))
          }
          disabled={isLoading}
          className="w-32 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-zinc-900 transition-all duration-200
            focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-zinc-500">
          0 to 10 pages
        </p>
      </div>

      {displayError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {displayError}
        </div>
      )}

      <button
        type="submit"
        disabled={isLoading}
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-8 py-3 text-sm font-medium text-white shadow-sm transition-all duration-200
          hover:bg-blue-700 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
          disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600 disabled:hover:shadow-sm"
      >
        {isLoading ? (
          <>
            <svg
              className="mr-2 h-4 w-4 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Đang crawl...
          </>
        ) : (
          'Convert to Markdown'
        )}
      </button>
    </form>
  );
}
