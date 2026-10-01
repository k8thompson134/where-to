import type Anthropic from '@anthropic-ai/sdk';
import {
  buildFilterPrompt,
  buildPlacesList,
  parseFilterResponse,
  type FilterPromptStyle,
  type PlaceForFilter,
} from './filter';

export const FILTER_MODEL = 'claude-haiku-4-5';

/**
 * Ask Claude which places match the query's primary purpose. Shared by the API route and prompt-eval.
 */
export async function filterPlacesWithClaude(
  client: Anthropic,
  userQuery: string,
  places: PlaceForFilter[],
  style: FilterPromptStyle
): Promise<{ indices: number[]; inputTokens: number; outputTokens: number }> {
  const prompt = buildFilterPrompt(style, userQuery, buildPlacesList(places));
  const response = await client.messages.create({
    model: FILTER_MODEL,
    max_tokens: 64,
    temperature: 0,
    // Haiku explains its picks after the array; stopping at the closing bracket keeps only the answer.
    stop_sequences: [']'],
    messages: [
      { role: 'user', content: prompt },
      { role: 'assistant', content: '[' },
    ],
  });
  const block = response.content[0];
  const indices = parseFilterResponse(block?.type === 'text' ? block.text : '');
  return {
    indices: [...new Set(indices)].filter((i) => i < places.length),
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  };
}
