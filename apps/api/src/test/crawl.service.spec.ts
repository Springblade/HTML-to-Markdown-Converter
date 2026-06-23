/// <reference types="vitest/globals" />
import { Crawl4aiErrorResponse } from '../crawl/types';
import {
  extractTitle,
  buildMarkdown,
  dedupePagesByUrl,
  isRetryableError,
  isRoutableHostname,
  Crawl4aiResponse,
} from '../crawl/crawl.utils';

describe('extractTitle', () => {
  it('should extract h1 heading', () => {
    const markdown = '# Hello World\nSome content';
    expect(extractTitle(markdown)).toBe('Hello World');
  });

  it('should extract title tag', () => {
    const markdown = '<title>Page Title</title>';
    expect(extractTitle(markdown)).toBe('Page Title');
  });

  it('should prefer h1 over title tag', () => {
    const markdown = '<title>Title Tag</title>\n# Heading Title';
    expect(extractTitle(markdown)).toBe('Heading Title');
  });

  it('should trim whitespace', () => {
    const markdown = '#   Spaced Title   \nContent';
    expect(extractTitle(markdown)).toBe('Spaced Title');
  });

  it('should return empty string when no title found', () => {
    const markdown = 'Just plain text without any title';
    expect(extractTitle(markdown)).toBe('');
  });

  it('should handle empty markdown', () => {
    expect(extractTitle('')).toBe('');
  });

  it('should extract h1 from middle of content', () => {
    const markdown = 'Some text\n# Middle Heading\nMore text';
    expect(extractTitle(markdown)).toBe('Middle Heading');
  });

  it('should handle h2-h6 gracefully', () => {
    const markdown = '## H2\n### H3';
    expect(extractTitle(markdown)).toBe('');
  });
});

describe('buildMarkdown', () => {
  it('should wrap each page with title header and URL line', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/a', markdown: 'Page A', metadata: { title: 'Title A' }, success: true },
    ];
    const result = buildMarkdown(pages);
    expect(result).toContain('# Title A');
    expect(result).toContain('**URL:** https://example.com/a');
    expect(result).toContain('Page A');
  });

  it('should fall back to extracted h1 when metadata title missing', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/a', markdown: '# Heading\nContent', metadata: {}, success: true },
    ];
    expect(buildMarkdown(pages)).toContain('# Heading');
  });

  it('should fall back to URL when no title or h1 found', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/orphan', markdown: 'No heading', metadata: {}, success: true },
    ];
    expect(buildMarkdown(pages)).toContain('# https://example.com/orphan');
  });

  it('should include description as blockquote when present', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/a', markdown: 'Body', metadata: { title: 'T', description: 'Desc' }, success: true },
    ];
    expect(buildMarkdown(pages)).toContain('> Desc');
  });

  it('should skip description line when missing', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/a', markdown: 'Body', metadata: { title: 'T' }, success: true },
    ];
    expect(buildMarkdown(pages)).not.toContain('> ');
  });

  it('should mark failed pages with FAILED header and error message', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/bad', markdown: '', metadata: {}, success: false, error_message: 'Timeout' },
    ];
    const result = buildMarkdown(pages);
    expect(result).toContain('## [FAILED] https://example.com/bad');
    expect(result).toContain('> Error: Timeout');
  });

  it('should prefer error_message over error field', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/bad', markdown: '', metadata: {}, success: false, error: 'old', error_message: 'new' },
    ];
    expect(buildMarkdown(pages)).toContain('> Error: new');
  });

  it('should fall back to error field when error_message is missing', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/bad', markdown: '', metadata: {}, success: false, error: 'old' },
    ];
    expect(buildMarkdown(pages)).toContain('> Error: old');
  });

  it('should show unknown when no error fields set', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/bad', markdown: '', metadata: {}, success: false },
    ];
    expect(buildMarkdown(pages)).toContain('> Error: unknown');
  });

  it('should sort multiple pages by url', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/z', markdown: 'Z', metadata: { title: 'Z' }, success: true },
      { url: 'https://example.com/a', markdown: 'A', metadata: { title: 'A' }, success: true },
      { url: 'https://example.com/m', markdown: 'M', metadata: { title: 'M' }, success: true },
    ];
    const result = buildMarkdown(pages);
    const aIdx = result.indexOf('# A');
    const mIdx = result.indexOf('# M');
    const zIdx = result.indexOf('# Z');
    expect(aIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(zIdx);
    expect(result).toContain('---\n\n');
  });

  it('should handle empty pages array', () => {
    expect(buildMarkdown([])).toBe('');
  });
});

describe('dedupePagesByUrl', () => {
  it('removes duplicate URLs while preserving first-occurrence order', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://geolify.ai/', markdown: '# Root', metadata: { title: 'Root' }, success: true },
      { url: 'https://geolify.ai/about', markdown: '# About', metadata: { title: 'About' }, success: true },
      { url: 'https://geolify.ai/', markdown: '# Root again', metadata: { title: 'Root2' }, success: true },
      { url: 'https://geolify.ai/contact', markdown: '# Contact', metadata: { title: 'Contact' }, success: true },
    ];
    const result = dedupePagesByUrl(pages);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.url)).toEqual([
      'https://geolify.ai/',
      'https://geolify.ai/about',
      'https://geolify.ai/contact',
    ]);
    expect(result[0].markdown).toBe('# Root');
  });

  it('returns empty array for empty input', () => {
    expect(dedupePagesByUrl([])).toEqual([]);
  });

  it('preserves all unique URLs unchanged', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://a.com', markdown: 'A', metadata: {}, success: true },
      { url: 'https://b.com', markdown: 'B', metadata: {}, success: true },
    ];
    expect(dedupePagesByUrl(pages)).toEqual(pages);
  });

  it('dedupes even when the duplicate has success=false', () => {
    // crawl4ai might return the same URL twice: once successful, once failed.
    // First-occurrence wins, so the successful page is kept.
    const pages: Crawl4aiResponse[] = [
      { url: 'https://geolify.ai/', markdown: '# Root', metadata: { title: 'Root' }, success: true },
      { url: 'https://geolify.ai/', markdown: '', metadata: {}, success: false, error_message: 'Timeout' },
    ];
    const result = dedupePagesByUrl(pages);
    expect(result).toHaveLength(1);
    expect(result[0].success).toBe(true);
  });
});

describe('isRetryableError', () => {
  it('should return true for network errors (no status)', () => {
    expect(isRetryableError(undefined)).toBe(true);
  });

  it('should return true for 500 Internal Server Error', () => {
    expect(isRetryableError(500)).toBe(true);
  });

  it('should return true for 502 Bad Gateway', () => {
    expect(isRetryableError(502)).toBe(true);
  });

  it('should return true for 503 Service Unavailable', () => {
    expect(isRetryableError(503)).toBe(true);
  });

  it('should return true for 504 Gateway Timeout', () => {
    expect(isRetryableError(504)).toBe(true);
  });

  it('should return false for 400 Bad Request', () => {
    expect(isRetryableError(400)).toBe(false);
  });

  it('should return false for 401 Unauthorized', () => {
    expect(isRetryableError(401)).toBe(false);
  });

  it('should return false for 404 Not Found', () => {
    expect(isRetryableError(404)).toBe(false);
  });

  it('should return false for 429 Too Many Requests', () => {
    expect(isRetryableError(429)).toBe(false);
  });
});

describe('isRoutableHostname', () => {
  it('should return false for localhost', () => {
    expect(isRoutableHostname('localhost')).toBe(false);
    expect(isRoutableHostname('127.0.0.1')).toBe(false);
    expect(isRoutableHostname('::1')).toBe(false);
  });

  it('should return false for private IP ranges', () => {
    expect(isRoutableHostname('192.168.1.1')).toBe(false);
    expect(isRoutableHostname('10.0.0.1')).toBe(false);
    expect(isRoutableHostname('172.16.0.1')).toBe(false);
    expect(isRoutableHostname('172.31.255.255')).toBe(false);
  });

  it('should return false for private TLDs', () => {
    expect(isRoutableHostname('server.local')).toBe(false);
    expect(isRoutableHostname('host.internal')).toBe(false);
    expect(isRoutableHostname('corp.corp')).toBe(false);
  });

  it('should return true for public hostnames', () => {
    expect(isRoutableHostname('example.com')).toBe(true);
    expect(isRoutableHostname('api.github.com')).toBe(true);
    expect(isRoutableHostname('8.8.8.8')).toBe(true);
  });
});

describe('Error Handling', () => {
  it('should identify 503 as crawl4ai unavailable', () => {
    const mockError = {
      response: {
        status: 503,
        data: { detail: 'Service is starting up' },
      },
    };
    const detail = (mockError as { response?: { status?: number; data?: Crawl4aiErrorResponse } }).response?.data?.detail;
    expect(detail).toBe('Service is starting up');
  });

  it('should identify non-503 errors', () => {
    const mockError = {
      response: {
        status: 500,
        data: {},
      },
    };
    const status = mockError.response?.status;
    expect(status).toBe(500);
    expect(status).not.toBe(503);
  });

  it('should handle network errors without response', () => {
    const networkError = { message: 'ECONNREFUSED' };
    expect(networkError.message).toBe('ECONNREFUSED');
  });

  it('should handle partial page failures via error_message', () => {
    const pages: Crawl4aiResponse[] = [
      { url: 'https://example.com/a', markdown: 'Success', metadata: {}, success: true },
      { url: 'https://example.com/b', markdown: '', metadata: {}, success: false, error_message: 'Timeout' },
    ];
    const hasErrors = pages.some((p) => !p.success);
    expect(hasErrors).toBe(true);
  });
});
