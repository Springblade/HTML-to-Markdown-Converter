import { NextResponse } from 'next/server';
import { siteConfig } from '@/config/site';
import { validateUrl } from '@/lib/validators';

export async function POST(request: Request) {
  try {
    const requestBody = await request.json();
    const MAX_PAGES = parseInt(process.env.CRAWL_MAX_PAGES_TOTAL ?? '10', 10);
    const { url, maxPages } = requestBody;

    if (!url || typeof url !== 'string') {
      return NextResponse.json(
        { message: 'URL is required' },
        { status: 400 }
      );
    }

    const urlResult = validateUrl(url);
    if (!urlResult.valid) {
      return NextResponse.json(
        { message: urlResult.error },
        { status: 400 }
      );
    }

    const maxPagesNum = Number(maxPages);
    if (isNaN(maxPagesNum) || maxPagesNum < 0 || maxPagesNum > MAX_PAGES) {
      return NextResponse.json(
        { message: `Number of pages must be a number between 0 and ${MAX_PAGES}` },
        { status: 400 }
      );
    }

    const response = await fetch(`${siteConfig.apiUrl}/api/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, maxPages: maxPagesNum }),
      signal: AbortSignal.timeout(90000),
    });

    const apiResponse = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { message: apiResponse.message || `API error: ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json(apiResponse, { status: 200 });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { message: 'Failed to process request. Please try again.' },
      { status: 500 }
    );
  }
}
