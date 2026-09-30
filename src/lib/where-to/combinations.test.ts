import { describe, it, expect } from 'vitest';
import { generateCombinations } from './combinations';

describe('generateCombinations', () => {
  it('returns single empty combination for empty arrays', () => {
    expect(generateCombinations([])).toEqual([[]]);
  });

  it('returns each item as single-element combo for one array', () => {
    expect(generateCombinations([['a', 'b', 'c']])).toEqual([['a'], ['b'], ['c']]);
  });

  it('returns all pairs for two arrays', () => {
    expect(generateCombinations([['a', 'b'], [1, 2]])).toEqual([
      ['a', 1],
      ['a', 2],
      ['b', 1],
      ['b', 2],
    ]);
  });

  it('returns 2*3*2 = 12 combos for [2,3,2] lengths', () => {
    const result = generateCombinations([
      [1, 2],
      [10, 20, 30],
      [100, 200],
    ]);
    expect(result).toHaveLength(12);
    expect(result[0]).toEqual([1, 10, 100]);
    expect(result[11]).toEqual([2, 30, 200]);
  });
});
