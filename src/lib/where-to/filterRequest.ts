import type { PlaceForFilter } from './filter';

export const FILTER_LIMITS = {
  maxPlaces: 20,
  maxQueryLength: 100,
  maxNameLength: 200,
  maxTypes: 20,
  maxTypeLength: 50,
  maxVicinityLength: 300,
};

type ParsedFilterRequest =
  | { ok: true; userQuery: string; places: PlaceForFilter[] }
  | { ok: false; error: string };

const isString = (v: unknown): v is string => typeof v === 'string';

/**
 * Validate the public /api/filter body; bounds keep anonymous callers from running up Claude spend.
 */
export function parseFilterRequest(body: unknown): ParsedFilterRequest {
  const L = FILTER_LIMITS;
  if (!body || typeof body !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const { userQuery, places } = body as { userQuery?: unknown; places?: unknown };

  if (!isString(userQuery) || !userQuery.trim()) return { ok: false, error: 'userQuery is required' };
  if (userQuery.length > L.maxQueryLength) return { ok: false, error: `userQuery exceeds ${L.maxQueryLength} characters` };

  if (places === undefined) return { ok: true, userQuery, places: [] };
  if (!Array.isArray(places)) return { ok: false, error: 'places must be an array' };
  if (places.length > L.maxPlaces) return { ok: false, error: `places exceeds ${L.maxPlaces} items` };

  const parsed: PlaceForFilter[] = [];
  for (const p of places) {
    const { name, types, vicinity } = (p ?? {}) as { name?: unknown; types?: unknown; vicinity?: unknown };
    if (!isString(name) || name.length > L.maxNameLength) return { ok: false, error: 'Invalid place name' };
    if (types !== undefined && (!Array.isArray(types) || types.length > L.maxTypes || !types.every((t) => isString(t) && t.length <= L.maxTypeLength))) {
      return { ok: false, error: 'Invalid place types' };
    }
    if (vicinity !== undefined && (!isString(vicinity) || vicinity.length > L.maxVicinityLength)) {
      return { ok: false, error: 'Invalid place vicinity' };
    }
    parsed.push({ name, types: types as string[] | undefined, vicinity: vicinity as string | undefined });
  }
  return { ok: true, userQuery, places: parsed };
}
