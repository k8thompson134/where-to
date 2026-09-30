/**
 * Generate all combinations of one item from each array.
 * e.g. [[1,2], [3,4]] -> [[1,3], [1,4], [2,3], [2,4]]
 */
export function generateCombinations<T>(arrays: T[][]): T[][] {
  if (arrays.length === 0) return [[]];
  const result: T[][] = [];
  const first = arrays[0];
  const rest = generateCombinations(arrays.slice(1));
  for (const item of first) {
    for (const r of rest) {
      result.push([item, ...r]);
    }
  }
  return result;
}
