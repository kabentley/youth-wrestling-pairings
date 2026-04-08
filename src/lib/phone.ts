const PHONE_EXTENSION_PATTERN = /(?:ext\.?|extension|x|#)\s*\d+\s*$/i;

export const PHONE_VALIDATION_MESSAGE = "Phone must be a 10-digit phone number, or 11 digits starting with 1.";

function trimPhone(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizePhoneNumber(value?: string | null) {
  const trimmed = trimPhone(value);
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  return trimmed;
}

export function getPhoneValidationError(value?: string | null) {
  const trimmed = trimPhone(value);
  if (!trimmed) return null;
  if (PHONE_EXTENSION_PATTERN.test(trimmed)) {
    return PHONE_VALIDATION_MESSAGE;
  }

  const normalized = normalizePhoneNumber(trimmed);
  return normalized.startsWith("+1") && normalized.length === 12 ? null : PHONE_VALIDATION_MESSAGE;
}

export function isValidPhoneNumber(value?: string | null) {
  return getPhoneValidationError(value) === null;
}

export function standardizePhoneNumber(value?: string | null) {
  const trimmed = trimPhone(value);
  if (!trimmed) return "";
  return isValidPhoneNumber(trimmed) ? normalizePhoneNumber(trimmed) : trimmed;
}
