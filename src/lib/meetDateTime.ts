const MEET_TIME_ZONE = "America/New_York";

const LOCAL_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

const EXPLICIT_TIME_ZONE_PATTERN = /(Z|[+-]\d{2}:\d{2})$/i;

function parseOffsetMinutes(token: string) {
  const match = token.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "+" ? 1 : -1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] || "0");
  return sign * (hours * 60 + minutes);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone = MEET_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const token = formatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  return parseOffsetMinutes(token);
}

function resolveDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!EXPLICIT_TIME_ZONE_PATTERN.test(trimmed)) {
    return parseMeetLocalDateTime(trimmed);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatTimeParts(date: Date, timeZone = MEET_TIME_ZONE) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const hour = formatter.formatToParts(date).find((part) => part.type === "hour")?.value ?? "00";
  const minute = formatter.formatToParts(date).find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}`;
}

export function combineMeetDateAndTimeInput(dateStr: string, timeStr?: string | null) {
  const trimmedTime = timeStr?.trim();
  if (!dateStr || !trimmedTime) return null;
  return `${dateStr}T${trimmedTime}`;
}

export function parseMeetLocalDateTime(value?: string | null, timeZone = MEET_TIME_ZONE) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  if (EXPLICIT_TIME_ZONE_PATTERN.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const match = trimmed.match(LOCAL_DATE_TIME_PATTERN);
  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const seconds = Number(match[6] || "0");
  const milliseconds = Number((match[7] || "0").padEnd(3, "0"));
  const localUtcMillis = Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds);
  let utcMillis = localUtcMillis - getTimeZoneOffsetMinutes(new Date(localUtcMillis), timeZone) * 60_000;
  const adjustedUtcMillis = localUtcMillis - getTimeZoneOffsetMinutes(new Date(utcMillis), timeZone) * 60_000;
  if (adjustedUtcMillis !== utcMillis) {
    utcMillis = adjustedUtcMillis;
  }
  return new Date(utcMillis);
}

export function formatMeetTimeInput(value?: string | Date | null, timeZone = MEET_TIME_ZONE) {
  const date = resolveDate(value);
  if (!date) return "";
  return formatTimeParts(date, timeZone);
}

export function formatMeetTime(value?: string | Date | null, timeZone = MEET_TIME_ZONE) {
  const date = resolveDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatMeetCheckinWindow(
  startValue?: string | Date | null,
  durationMinutes?: number | null,
  timeZone = MEET_TIME_ZONE,
) {
  const start = resolveDate(startValue);
  if (!start) return null;
  const normalizedDuration = typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : 30;
  const end = new Date(start.getTime() + normalizedDuration * 60_000);
  return `${formatMeetTime(start, timeZone)} to ${formatMeetTime(end, timeZone)}`;
}
