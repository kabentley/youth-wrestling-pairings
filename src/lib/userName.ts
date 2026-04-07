type UserNameParts = {
  firstName: string | null;
  lastName: string | null;
};

type UserNameLike = {
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
};

const CANONICAL_SUFFIXES = new Map<string, string>([
  ["JR", "Jr."],
  ["SR", "Sr."],
  ["II", "II"],
  ["III", "III"],
  ["IV", "IV"],
  ["V", "V"],
  ["VI", "VI"],
]);

export const LAST_NAME_SUFFIX_VALIDATION_MESSAGE = "Put suffixes like Jr. or Sr. in the first name field, not the last name.";

function normalizeNameValue(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeLegacyLastName(value: string | null | undefined) {
  const normalized = normalizeNameValue(value);
  if (!normalized) return null;
  return normalized.replace(/[.,;:]+$/g, "") || null;
}

function parseKnownSuffix(value: string | null | undefined) {
  const normalized = normalizeNameValue(value);
  if (!normalized) return null;
  const compact = normalized.replace(/\./g, "").toUpperCase();
  return CANONICAL_SUFFIXES.get(compact) ?? null;
}

export function lastNameHasDisallowedSuffix(value: string | null | undefined) {
  const normalized = normalizeNameValue(value);
  if (!normalized) return false;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return parseKnownSuffix(tokens[tokens.length - 1]) !== null;
}

function splitSuffixFromFirstName(value: string | null | undefined) {
  const normalized = normalizeNameValue(value);
  if (!normalized) {
    return { baseFirstName: null, suffix: null };
  }
  const tokens = normalized.split(/\s+/).filter(Boolean);
  const parsedSuffix = parseKnownSuffix(tokens[tokens.length - 1]);
  if (!parsedSuffix) {
    return { baseFirstName: normalized, suffix: null };
  }
  tokens.pop();
  const baseFirstName = tokens.join(" ").trim();
  return {
    baseFirstName: baseFirstName || null,
    suffix: parsedSuffix,
  };
}

export function buildFullName(firstName: string | null | undefined, lastName: string | null | undefined) {
  const normalizedLastName = normalizeNameValue(lastName);
  const { baseFirstName, suffix } = splitSuffixFromFirstName(firstName);
  const parts = [baseFirstName, normalizedLastName, suffix].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : null;
}

export function splitLegacyFullName(name: string | null | undefined): UserNameParts {
  const normalized = normalizeNameValue(name);
  if (!normalized) {
    return { firstName: null, lastName: null };
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  let suffix: string | null = null;
  const lastToken = tokens[tokens.length - 1];
  const parsedSuffix = parseKnownSuffix(lastToken);
  if (parsedSuffix) {
    suffix = parsedSuffix;
    tokens.pop();
  }

  if (tokens.length <= 1) {
    const firstName = [tokens[0] ?? normalized, suffix].filter(Boolean).join(" ").trim();
    return { firstName: firstName || null, lastName: null };
  }

  return {
    firstName: [tokens.slice(0, -1).join(" "), suffix].filter(Boolean).join(" ").trim(),
    lastName: normalizeLegacyLastName(tokens[tokens.length - 1]),
  };
}

export function resolveStoredUserName(input: {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
}): { firstName: string | null; lastName: string | null; fullName: string | null } {
  const directFirstName = normalizeNameValue(input.firstName);
  const directLastName = normalizeNameValue(input.lastName);

  if (directFirstName || directLastName) {
    return {
      firstName: directFirstName,
      lastName: directLastName,
      fullName: buildFullName(directFirstName, directLastName),
    };
  }

  const legacySplit = splitLegacyFullName(input.name);
  return {
    firstName: legacySplit.firstName,
    lastName: legacySplit.lastName,
    fullName: buildFullName(legacySplit.firstName, legacySplit.lastName),
  };
}

export function getUserFullName(user: UserNameLike) {
  const directFirstName = normalizeNameValue(user.firstName);
  const directLastName = normalizeNameValue(user.lastName);
  if (directFirstName || directLastName) {
    return buildFullName(directFirstName, directLastName);
  }
  return null;
}

export function getUserDisplayName(user: UserNameLike) {
  return getUserFullName(user) ?? normalizeNameValue(user.username) ?? "";
}
