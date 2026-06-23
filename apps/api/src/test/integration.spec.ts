import { describe, it, expect } from 'vitest';

const API_BASE = process.env.API_URL || 'http://localhost:3001';

/**
 * Integration smoke tests for crawl4ai API
 * Requires services running: pnpm dev (web:3000, api:3001, crawl4ai:11235)
 */
describe('Phase 6: Integration Verification', () => {
  describe('Task 6.1: HTTP Smoke Test', () => {
    it('should accept valid URL and return markdown', async () => {
      const response = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', maxPages: 0 }),
        signal: AbortSignal.timeout(60000),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('markdown');
      expect(data).toHaveProperty('metadata');
      expect(data).toHaveProperty('pageCount');
      expect(data.markdown).toBeTruthy();
      expect(data.metadata).toHaveProperty('rootUrl');
    });

    it('should reject invalid URL with 400', async () => {
      const response = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'not-a-url', maxPages: 0 }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject URL without http scheme', async () => {
      const response = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'ftp://example.com', maxPages: 0 }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject maxPages > 10', async () => {
      const response = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', maxPages: 15 }),
      });

      expect(response.status).toBe(400);
    });

    it('should reject negative maxPages', async () => {
      const response = await fetch(`${API_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', maxPages: -1 }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('Task 6.1: Next.js Proxy', () => {
    const WEB_BASE = process.env.WEB_URL || 'http://localhost:3000';

    it('should proxy through Next.js frontend', async () => {
      const response = await fetch(`${WEB_BASE}/api/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com', maxPages: 0 }),
        signal: AbortSignal.timeout(90000),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('markdown');
    });
  });
});
