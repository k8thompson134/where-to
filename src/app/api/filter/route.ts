import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  createRateLimiter,
  DEFAULT_PROMPT_STYLE,
  filterPlacesWithClaude,
  parseFilterRequest,
  type FilterPromptStyle,
} from '@/lib/where-to';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

// A search makes one call per stop, so 30/min leaves room for several searches.
const allowRequest = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  if (!allowRequest(ip)) {
    return NextResponse.json(
      { filteredIndices: [], error: 'Too many requests. Wait a minute and try again.' },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ filteredIndices: [], error: 'Body must be JSON' }, { status: 400 });
  }

  const parsed = parseFilterRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ filteredIndices: [], error: parsed.error }, { status: 400 });
  }
  if (parsed.places.length === 0) {
    return NextResponse.json({ filteredIndices: [] });
  }

  try {
    const style = (process.env.PROMPT_STYLE || DEFAULT_PROMPT_STYLE) as FilterPromptStyle;
    const { indices } = await filterPlacesWithClaude(anthropic, parsed.userQuery, parsed.places, style);
    console.log(`[Claude] Style: ${style} | Query: ${parsed.userQuery} | Kept ${indices.length}/${parsed.places.length}`);
    return NextResponse.json({ filteredIndices: indices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Claude] Error:', message);
    return NextResponse.json({ filteredIndices: [], error: message }, { status: 500 });
  }
}
