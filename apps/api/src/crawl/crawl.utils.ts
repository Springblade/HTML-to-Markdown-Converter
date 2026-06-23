import { Crawl4aiResponse } from './types';

export function extractTitle(markdown: string): string {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  const titleMatch = markdown.match(/<title>([^<]+)<\/title>/i);
  if (titleMatch) return titleMatch[1].trim();
  return '';
}

export function buildMarkdown(pages: Crawl4aiResponse[]): string {
  const sorted = [...pages].sort((a, b) => a.url.localeCompare(b.url));
  return sorted
    .map((page) => {
      if (!page.success) {
        const errMsg = page.error_message ?? page.error ?? 'unknown';
        return `## [FAILED] ${page.url}\n\n> Error: ${errMsg}`;
      }
      const meta = page.metadata ?? {};
      const title = meta.title || extractTitle(page.markdown) || page.url;
      const parts: string[] = [`# ${title}`, `**URL:** ${page.url}`];
      if (meta.description) parts.push(`> ${meta.description}`);
      parts.push(page.markdown);
      return parts.join('\n\n');
    })
    .join('\n\n---\n\n');
}

// crawl4ai's BFSDeepCrawlStrategy can return the same URL twice
// (root page + child link discovered on the root). Dedupe by URL,
// preserving first-occurrence order so the root page stays first.
export function dedupePagesByUrl(pages: Crawl4aiResponse[]): Crawl4aiResponse[] {
  const seen = new Set<string>();
  return pages.filter((page) => {
    if (seen.has(page.url)) return false;
    seen.add(page.url);
    return true;
  });
}

export function isRetryableError(status: number | undefined): boolean {
  if (status === undefined) return true;
  return status >= 500 || status === 503;
}

export function isRoutableHostname(hostname: string): boolean {
  const blocked = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
  if (blocked.includes(hostname)) return false;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(hostname)) return false;
  if (/\.(local|internal|corp|intra|private)$/i.test(hostname)) return false;
  return true;
}

export * from './types';
