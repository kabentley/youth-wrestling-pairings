/** Returns a pair of ids in canonical ascending order. */
export function normalizePair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

/** Builds a stable matchup key that is order-independent. */
export function pairKey(a: string, b: string) {
  const [first, second] = normalizePair(a, b);
  return `${first}|${second}`;
}
