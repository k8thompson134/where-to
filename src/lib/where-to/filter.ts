export type FilterPromptStyle = 'pattern' | 'minimal' | 'primary' | 'verbose';

export interface PlaceForFilter {
  name: string;
  types?: string[];
  vicinity?: string;
}

const prompts: Record<
  FilterPromptStyle,
  (query: string, placesList: string) => string
> = {
  pattern: (query, placesList) => `${placesList}

"${query}" → JSON indices where query matches PRIMARY purpose.
Rule: Include if query IS what they do. Exclude if query is just something they ALSO offer.
Specific Brands: If query is a brand name (e.g., "World Market", "Dunkin"), ONLY match that specific chain.
Examples:
- "coffee" ✓ coffee shops, ✗ restaurants with coffee
- "grocery" ✓ supermarkets, ✗ convenience stores
- "bank" ✓ financial banks, ✗ places with "bank" in name`,

  minimal: (query, placesList) => `${placesList}

"${query}" → JSON indices of matches:`,

  primary: (query, placesList) => `${placesList}

Query: "${query}"
Return JSON array of indices where query is the place's PRIMARY purpose (not secondary). Retail only.`,

  verbose: (query, placesList) => `Filter these Google Places results. User wants: "${query}"

Places:
${placesList}

STRICT RULES - only include RETAIL STORES where you can BUY things:
- "coffee" = coffee shops ONLY (Starbucks, Colectivo, Stone Creek). EXCLUDE restaurants/cafes that just serve coffee.
- "craft store" = RETAIL arts & crafts supply stores ONLY (Michaels, Joann, Hobby Lobby, Blick Art Materials). EXCLUDE: university facilities, community centers, hardware stores, sex shops, variety stores, bead shops.
- "grocery" = grocery stores/supermarkets ONLY.

Return ONLY a JSON array of indices. No explanation, no text, just the array.
Example: [0, 3]`,
};

/**
 * Build the numbered places list string for the filter prompt.
 */
export function buildPlacesList(places: PlaceForFilter[]): string {
  return places
    .map(
      (p, i) =>
        `${i}. ${p.name}${p.types ? ' - Types: ' + p.types.join(', ') : ''}`
    )
    .join('\n');
}

/**
 * Build the filter prompt for the given style, query, and places list.
 */
export function buildFilterPrompt(
  style: FilterPromptStyle,
  userQuery: string,
  placesList: string
): string {
  const fn = prompts[style] ?? prompts.pattern;
  let prompt = fn(userQuery, placesList);
  if (prompt.trim().endsWith('[')) {
    prompt = prompt.trim().slice(0, -1).trim();
  }
  return prompt;
}

/**
 * Parse the LLM response text into an array of indices.
 * Response is expected to continue after a pre-filled '[' so we prepend it.
 */
export function parseFilterResponse(responseText: string): number[] {
  let fullJsonStr = '[' + (responseText ?? '').trim();
  if (!fullJsonStr.endsWith(']')) fullJsonStr += ']';
  const jsonMatch = fullJsonStr.match(/\[[\d,\s]*\]/);
  if (!jsonMatch) return [];
  return JSON.parse(jsonMatch[0]);
}
