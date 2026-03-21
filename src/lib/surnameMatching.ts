const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const SURNAME_PARTICLES = new Set([
  "da",
  "de",
  "del",
  "della",
  "der",
  "di",
  "dos",
  "du",
  "la",
  "le",
  "san",
  "st",
  "saint",
  "van",
  "von",
]);

export function normalizeSurnameToken(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function extractLastNameCandidates(name: string | null | undefined) {
  const rawTokens = (name ?? "")
    .split(/\s+/)
    .map(normalizeSurnameToken)
    .filter(Boolean);
  if (rawTokens.length === 0) return [] as string[];

  const tokens = [...rawTokens];
  if (tokens.length > 1 && NAME_SUFFIXES.has(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  if (tokens.length === 0) return [] as string[];

  const last = tokens[tokens.length - 1];
  const candidates = [last];
  const surnameParts = [last];
  for (let index = tokens.length - 2; index >= 0; index -= 1) {
    const token = tokens[index];
    if (!SURNAME_PARTICLES.has(token)) break;
    surnameParts.unshift(token);
  }
  if (surnameParts.length > 1) {
    candidates.push(surnameParts.join(""));
  }
  return Array.from(new Set(candidates));
}

export function levenshteinDistance(a: string, b: string) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

export function lastNameSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.includes(b) || b.includes(a))) {
    return 0.92;
  }
  const dist = levenshteinDistance(a, b);
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  const ratio = 1 - dist / maxLen;
  if (dist <= 1 && maxLen >= 5) return Math.max(ratio, 0.88);
  if (dist === 2 && maxLen >= 7) return Math.max(ratio, 0.8);
  return ratio;
}
