import { db } from "./db";

export type EmailDeliveryMode = "off" | "all" | "whitelist";

export type EmailDeliverySettings = {
  mode: EmailDeliveryMode;
  whitelist: string[];
};

function normalizeEmail(value?: string | null) {
  const trimmed = value?.trim().toLowerCase();
  return trimmed ?? null;
}

export function parseEmailWhitelist(raw?: string | null) {
  if (!raw) return [];
  return Array.from(new Set(
    raw
      .split(/[\r\n,;]+/)
      .map((value) => normalizeEmail(value))
      .filter((value): value is string => Boolean(value)),
  )).sort((a, b) => a.localeCompare(b));
}

export function serializeEmailWhitelist(values: string[]) {
  return parseEmailWhitelist(values.join("\n")).join("\n");
}

export async function getEmailDeliverySettings(): Promise<EmailDeliverySettings> {
  const league = await db.league.findFirst({
    select: {
      emailDeliveryMode: true,
      emailWhitelist: true,
    },
  });
  return {
    mode: league?.emailDeliveryMode === "all"
      ? "all"
      : league?.emailDeliveryMode === "whitelist"
        ? "whitelist"
        : "off",
    whitelist: parseEmailWhitelist(league?.emailWhitelist ?? ""),
  };
}

export async function shouldDeliverEmailTo(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      allowed: false,
      mode: "off" as EmailDeliveryMode,
      reason: "Recipient email is missing.",
    };
  }
  const settings = await getEmailDeliverySettings();
  if (settings.mode === "off") {
    return {
      allowed: false,
      mode: settings.mode,
      normalizedEmail,
      whitelist: settings.whitelist,
      reason: "App email delivery is turned off.",
    };
  }
  if (settings.mode === "all") {
    return {
      allowed: true,
      mode: settings.mode,
      normalizedEmail,
      whitelist: settings.whitelist,
    };
  }
  const allowed = settings.whitelist.includes(normalizedEmail);
  return {
    allowed,
    mode: settings.mode,
    normalizedEmail,
    whitelist: settings.whitelist,
    reason: allowed ? null : "Recipient email is not on the admin whitelist.",
  };
}
