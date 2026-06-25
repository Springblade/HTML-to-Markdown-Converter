import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch('http://localhost:11235/stats', {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch stats from server' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Stats API error:', error);
    return NextResponse.json(
      { error: 'Server unreachable' },
      { status: 503 }
    );
  }
}
