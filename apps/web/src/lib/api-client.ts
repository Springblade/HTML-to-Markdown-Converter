import { siteConfig } from '@/config/site';
import { CrawlResult } from './types';

export async function convertToMarkdown(
  payload: { url: string; maxPages: number },
  options?: { signal?: AbortSignal },
): Promise<CrawlResult> {
  const response = await fetch('/api/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: options?.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error((error as { message?: string }).message ?? 'Conversion failed');
  }

  return response.json() as Promise<CrawlResult>;
}
