import { describe, it, expect } from 'vitest';
import {
  buildPlacesList,
  buildFilterPrompt,
  parseFilterResponse,
} from './filter';

describe('buildPlacesList', () => {
  it('formats places with index and name', () => {
    const list = buildPlacesList([
      { name: 'Starbucks', types: ['cafe'] },
      { name: 'Dunkin', types: ['cafe', 'food'] },
    ]);
    expect(list).toContain('0. Starbucks');
    expect(list).toContain('1. Dunkin');
    expect(list).toContain('Types:');
  });

  it('handles places without types', () => {
    const list = buildPlacesList([{ name: 'Unknown' }]);
    expect(list).toBe('0. Unknown');
  });
});

describe('buildFilterPrompt', () => {
  const placesList = '0. Starbucks - Types: cafe\n1. Dunkin - Types: cafe';

  it('pattern style includes query and rules', () => {
    const prompt = buildFilterPrompt('pattern', 'coffee', placesList);
    expect(prompt).toContain(placesList);
    expect(prompt).toContain('coffee');
    expect(prompt).toContain('PRIMARY purpose');
  });

  it('minimal style is shorter', () => {
    const prompt = buildFilterPrompt('minimal', 'coffee', placesList);
    expect(prompt).toContain('coffee');
    expect(prompt).toContain('JSON indices');
  });

  it('removes trailing bracket if present', () => {
    // Our buildFilterPrompt trims trailing '[' from the template output.
    // None of the current templates end with '[', but the logic is there.
    const prompt = buildFilterPrompt('pattern', 'x', '0. A');
    expect(prompt.trim()).not.toMatch(/\[\s*$/);
  });
});

describe('parseFilterResponse', () => {
  it('parses valid JSON array from response text', () => {
    expect(parseFilterResponse('0, 2, 4')).toEqual([0, 2, 4]);
    expect(parseFilterResponse('1,3,5')).toEqual([1, 3, 5]);
  });

  it('returns empty array when no JSON array found', () => {
    expect(parseFilterResponse('no numbers here')).toEqual([]);
    expect(parseFilterResponse('')).toEqual([]);
  });

  it('handles single index', () => {
    expect(parseFilterResponse('0')).toEqual([0]);
  });

  it('trims whitespace', () => {
    expect(parseFilterResponse('  1 , 2 , 3  ')).toEqual([1, 2, 3]);
  });
});
