import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  buildPlacesList,
  buildFilterPrompt,
  parseFilterResponse,
  type FilterPromptStyle,
  type PlaceForFilter,
} from '@/lib/where-to';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const { userQuery, places } = (await req.json()) as {
      userQuery: string;
      places: PlaceForFilter[];
    };

    if (!places || places.length === 0) {
      return NextResponse.json({ filteredIndices: [] });
    }

    const placesList = buildPlacesList(places);
    const promptStyle = (process.env.PROMPT_STYLE || 'pattern') as FilterPromptStyle;
    const prompt = buildFilterPrompt(promptStyle, userQuery, placesList);

    console.log(`[Claude] Style: ${promptStyle} | Query: ${userQuery}`);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 64,
      temperature: 0,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '[' },
      ],
    });

    const block = response.content[0];
    const indices = parseFilterResponse(block?.type === 'text' ? block.text : '');
    console.log('[Claude] Filtered to indices:', indices);
    return NextResponse.json({ filteredIndices: indices });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Claude] Error:', message);
    return NextResponse.json(
      { filteredIndices: [], error: message },
      { status: 500 }
    );
  }
}
