const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmailAddress(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ?? null;
}

export function isValidEmailAddress(value?: string | null) {
  const normalized = normalizeEmailAddress(value);
  return Boolean(normalized && EMAIL_REGEX.test(normalized));
}

export function tokenizeEmailAddressList(raw?: string | null) {
  if (!raw) return [];
  return raw
    .split(/[\s,;]+/)
    .map((value) => normalizeEmailAddress(value))
    .filter((value): value is string => Boolean(value));
}

export function findInvalidEmailAddresses(raw?: string | null) {
  return Array.from(new Set(
    tokenizeEmailAddressList(raw).filter((value) => !isValidEmailAddress(value)),
  )).sort((a, b) => a.localeCompare(b));
}
