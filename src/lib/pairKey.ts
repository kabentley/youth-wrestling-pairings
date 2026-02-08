export function normalizePair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

export function pairKey(a: string, b: string) {
  const [first, second] = normalizePair(a, b);
  return `${first}|${second}`;
}
