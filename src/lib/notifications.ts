import { Prisma } from "@prisma/client";

import { adjustTeamTextColor } from "./contrastText";
import { db } from "./db";
import type { EmailDeliveryMode } from "./emailDelivery";
import { getEmailDeliverySettings, shouldDeliverEmailTo, shouldWriteEmailLog } from "./emailDelivery";
import { formatMeetCheckinWindow } from "./meetDateTime";
import { normalizeMeetPhase } from "./meetPhase";
import { getUserDisplayName } from "./userName";

export type NotificationTransport = "off" | "log" | "live";
export type NotificationChannel = "email" | "system";
export type NotificationEvent = "meet_ready_for_attendance" | "meet_published" | "meet_attendees_message";
export type NotificationStatus = "SKIPPED" | "LOGGED" | "SENT" | "FAILED";
export type NotificationDispatchSummary = {
  transport: NotificationTransport;
  recipients: number;
  attempted: number;
  sent: number;
  logged: number;
  successful: number;
  failed: number;
  skipped: number;
};
export type NotificationTeamSummary = {
  teamId: string;
  teamLabel: string;
  recipients: number;
  emailCount: number;
  successfulCount: number;
  failedCount: number;
  skippedCount: number;
};
export type MeetReadyForAttendanceSummary = NotificationDispatchSummary & {
  teams: NotificationTeamSummary[];
};

function isNotificationLoggingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ENABLE_NOTIFICATION_LOGGING !== "false";
}

type NotificationLogInput = {
  event: NotificationEvent;
  channel: NotificationChannel;
  status: NotificationStatus;
  recipient: string;
  dedupeKey?: string | null;
  subject?: string | null;
  message: string;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  payload?: Prisma.InputJsonValue;
  userId?: string | null;
  meetId?: string | null;
  deliveredAt?: Date | null;
};

type DeliveryMessage = {
  channel: NotificationChannel;
  recipient: string;
  subject?: string;
  message: string;
  html?: string;
  userId?: string | null;
  meetId?: string | null;
  payload: Prisma.InputJsonValue;
};

type DeliveryResult = {
  status: NotificationStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
};

type MeetReadyRecipient = {
  userId: string;
  teamId: string;
  teamLabel: string;
  displayName: string;
  email: string | null;
  childNames: string[];
  headCoachName: string;
  headCoachEmail: string;
};

type MeetReadyContent = {
  emailSubject: string;
  emailText: string;
  emailHtml?: string;
};

type MeetReadyContext = {
  meetName: string;
  meetDate: Date;
  location: string | null;
  attendanceDeadline: Date | null;
  checkinStartAt?: Date | null;
  checkinDurationMinutes?: number | null;
  teamLabels: string[];
  attendanceUrl: string;
  recipientName: string;
  childNames: string[];
  headCoachName: string;
  headCoachEmail: string;
};

type MeetPublishedMatch = {
  boutId: string;
  boutNumber: string;
  opponentName: string;
  opponentTeam: string;
  opponentTeamColor?: string | null;
};

type MeetPublishedChild = {
  childId: string;
  fullName: string;
  teamLabel: string;
  matches: MeetPublishedMatch[];
};

type MeetPublishedRecipient = {
  userId: string;
  displayName: string;
  email: string | null;
  children: MeetPublishedChild[];
};

type MeetPublishedContext = {
  meetName: string;
  meetDate: Date;
  location: string | null;
  todayUrl: string;
  recipientName: string;
  children: MeetPublishedChild[];
};

type MeetAttendeeMessageRecipient = {
  userId: string;
  displayName: string;
  email: string | null;
  childNames: string[];
};

type MeetAttendeeMessageAudience = "attending" | "roster";

export function resolveNotificationTransport(
  emailDeliveryMode: EmailDeliveryMode,
): NotificationTransport {
  if (emailDeliveryMode === "off") {
    return "off";
  }
  if (emailDeliveryMode === "log") {
    return "log";
  }
  return "live";
}

function normalizeEmail(email?: string | null) {
  const trimmed = email?.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed;
}

function formatMeetDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDeadline(date: Date | null) {
  if (!date) return "No deadline has been set.";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function formatCheckinWindow(startAt?: Date | null, durationMinutes?: number | null) {
  return formatMeetCheckinWindow(startAt, durationMinutes) ?? "";
}

function formatList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uniqueSortedNames(names: string[]) {
  return Array.from(new Set(names.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function buildBaseUrl(origin?: string | null) {
  const trimmedOrigin = origin?.trim();
  if (trimmedOrigin) return trimmedOrigin;
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL;
  return "http://localhost:3000";
}

function buildTeamLabels(
  teams: Array<{ team: { symbol: string; name: string } }>,
) {
  return uniqueSortedNames(
    teams.map((entry) => (entry.team.symbol || entry.team.name || "Team").trim()),
  );
}

function buildTeamLabel(team: { symbol?: string | null; name?: string | null }) {
  return (team.symbol ?? team.name ?? "Team").trim() || "Team";
}

function formatBoutNumber(mat?: number | null, order?: number | null) {
  if (!mat || !order) return "TBD";
  return `${mat}${String(Math.max(0, order - 1)).padStart(2, "0")}`;
}

export function dedupeMeetRecipients(recipients: MeetReadyRecipient[]): MeetReadyRecipient[] {
  const byUserId = new Map<string, MeetReadyRecipient>();

  for (const recipient of recipients) {
    const existing = byUserId.get(recipient.userId);
    if (!existing) {
      byUserId.set(recipient.userId, {
        ...recipient,
        childNames: uniqueSortedNames(recipient.childNames),
      });
      continue;
    }

    existing.childNames = uniqueSortedNames([...existing.childNames, ...recipient.childNames]);
    if (!existing.email && recipient.email) existing.email = recipient.email;
    if (!existing.headCoachName && recipient.headCoachName) existing.headCoachName = recipient.headCoachName;
    if (!existing.headCoachEmail && recipient.headCoachEmail) existing.headCoachEmail = recipient.headCoachEmail;
  }

  return Array.from(byUserId.values());
}

function resolveHeadCoachName(headCoach?: {
  firstName?: string | null;
  lastName?: string | null;
  username: string;
} | null) {
  if (headCoach == null) return "";
  return getUserDisplayName(headCoach);
}

export function buildMeetReadyForAttendanceContent(
  context: MeetReadyContext,
): MeetReadyContent {
  const childLine = context.childNames.length > 0
    ? `Please indicate whether your wrestler${context.childNames.length === 1 ? "" : "s"} ${formatList(context.childNames)} will attend the upcoming meet.`
    : "Please indicate whether your wrestlers will attend the upcoming meet.";
  const childLineHtml = context.childNames.length > 0
    ? `Please indicate whether your wrestler${context.childNames.length === 1 ? "" : "s"} <strong>${escapeHtml(formatList(context.childNames))}</strong> will attend the upcoming meet.`
    : "Please indicate whether your wrestlers will attend the upcoming meet.";
  const locationLine = context.location ? `Location: ${context.location}.` : "Location: To be announced.";
  const teamsLine = context.teamLabels.length > 0
    ? `Teams: ${formatList(context.teamLabels)}.`
    : "";
  const deadlineLine = `Attendance deadline: ${formatDeadline(context.attendanceDeadline)}`;
  const checkinLine = formatCheckinWindow(context.checkinStartAt, context.checkinDurationMinutes);
  const headCoachLine = context.headCoachName && context.headCoachEmail
    ? `If you have questions, please contact your coach: ${context.headCoachName} <${context.headCoachEmail}>.`
    : context.headCoachName
      ? `If you have questions, please contact your coach: ${context.headCoachName}.`
      : context.headCoachEmail
        ? `If you have questions, please contact your coach: <${context.headCoachEmail}>.`
        : "";
  const formattedMeetDate = formatMeetDate(context.meetDate);
  const meetDetailsBlock = [
    `Meet date: ${formattedMeetDate}.`,
    checkinLine ? `Check-in time: ${checkinLine}.` : "",
    locationLine,
    teamsLine,
    deadlineLine,
  ].filter(Boolean).join("\n");
  const linksBlock = [
    `Reply here: ${context.attendanceUrl}`,
  ].join("\n");

  return {
    emailSubject: `Please respond with attendance for the upcoming wrestling meet on ${formattedMeetDate}`,
    emailText: [
      `Hello ${context.recipientName},`,
      childLine,
      meetDetailsBlock,
      linksBlock,
      headCoachLine,
    ].filter(Boolean).join("\n\n"),
    emailHtml: `
      <div style="background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
        <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #d9e1e8;border-radius:18px;overflow:hidden;">
          <div style="padding:24px 24px 18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);border-bottom:1px solid #e7edf3;">
            <div style="font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#5a6673;">Attendance Request</div>
            <h1 style="margin:8px 0 0;font-size:30px;line-height:1.1;color:#243041;">${escapeHtml(context.meetName)}</h1>
          </div>
          <div style="padding:24px;">
            <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Hello ${escapeHtml(context.recipientName)},</p>
            <p style="margin:0;font-size:16px;line-height:1.5;">${childLineHtml}</p>
            <div style="margin-top:18px;border:1px solid #d9e1e8;border-radius:14px;background:#ffffff;overflow:hidden;">
              <div style="padding:12px 14px;background:#f7f9fc;border-bottom:1px solid #e7edf3;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#5a6673;">Meet Details</div>
              <div style="padding:16px;">
                <div style="font-size:15px;line-height:1.6;color:#243041;"><strong>Date:</strong> ${escapeHtml(formattedMeetDate)}</div>
                ${checkinLine ? `<div style="font-size:15px;line-height:1.6;color:#243041;"><strong>Check-in time:</strong> ${escapeHtml(checkinLine)}</div>` : ""}
                <div style="font-size:15px;line-height:1.6;color:#243041;"><strong>Location:</strong> ${escapeHtml(context.location ?? "Location to be announced")}</div>
                <div style="font-size:15px;line-height:1.6;color:#243041;"><strong>Teams:</strong> ${escapeHtml(context.teamLabels.length > 0 ? formatList(context.teamLabels) : "To be announced")}</div>
                <div style="margin-top:14px;padding:14px 16px;border-radius:12px;background:#fff4d6;border:1px solid #f0d48a;">
                  <div style="font-size:12px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#8a5a00;">Attendance Deadline</div>
                  <div style="margin-top:6px;font-size:20px;line-height:1.25;font-weight:800;color:#243041;">${escapeHtml(formatDeadline(context.attendanceDeadline))}</div>
                </div>
              </div>
            </div>
            <div style="margin-top:20px;display:flex;gap:12px;flex-wrap:wrap;">
              <a href="${escapeHtml(context.attendanceUrl)}" style="display:inline-block;background:#2f7fe7;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px;">Reply to Attendance</a>
            </div>
            ${headCoachLine ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:#465567;">${escapeHtml(headCoachLine)}</p>` : ""}
          </div>
        </div>
      </div>
    `,
  };
}

export function buildMeetPublishedContent(
  context: MeetPublishedContext,
): MeetReadyContent {
  const formattedMeetDate = formatMeetDate(context.meetDate);
  const locationLine = context.location ? `Location: ${context.location}` : "Location: To be announced";
  const childBlocks = context.children.map((child) => {
    const matchLines = child.matches.length > 0
      ? child.matches.map((match) => `- Bout ${match.boutNumber}: ${match.opponentName}${match.opponentTeam ? ` (${match.opponentTeam})` : ""}`)
      : ["- No bout assigned yet."];
    return [`${child.fullName}${child.teamLabel ? ` (${child.teamLabel})` : ""}`, ...matchLines].join("\n");
  });

  const emailText = [
    `Hello ${context.recipientName},`,
    `Meet: ${context.meetName}`,
    `Meet date: ${formattedMeetDate}`,
    locationLine,
    "Today's bouts:",
    childBlocks.join("\n\n"),
    `View updates here: ${context.todayUrl}`,
  ].filter(Boolean).join("\n\n");

  const childCardsHtml = context.children.map((child) => {
    const rowsHtml = child.matches.length > 0
      ? child.matches.map((match) => `
            <tr>
              <td style="padding:10px 12px;border-top:1px solid #e7edf3;font-weight:700;color:#243041;white-space:nowrap;">Bout ${escapeHtml(match.boutNumber)}</td>
              <td style="padding:10px 12px;border-top:1px solid #e7edf3;color:#243041;"><span style="color:${escapeHtml(adjustTeamTextColor(match.opponentTeamColor))};font-weight:700;">${escapeHtml(match.opponentName)}</span>${match.opponentTeam ? ` <span style="color:${escapeHtml(adjustTeamTextColor(match.opponentTeamColor))};">(${escapeHtml(match.opponentTeam)})</span>` : ""}</td>
            </tr>
          `).join("")
      : `
            <tr>
              <td colspan="2" style="padding:12px;border-top:1px solid #e7edf3;color:#5a6673;">No bout assigned yet.</td>
            </tr>
          `;
    return `
      <section style="border:1px solid #d9e1e8;border-radius:14px;background:#ffffff;overflow:hidden;margin-top:14px;">
        <div style="padding:12px 14px;background:#f7f9fc;border-bottom:1px solid #e7edf3;">
          <div style="font-size:20px;font-weight:800;color:#243041;">${escapeHtml(child.fullName)}${child.teamLabel ? ` <span style="font-size:14px;font-weight:700;color:#5a6673;">(${escapeHtml(child.teamLabel)})</span>` : ""}</div>
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th align="left" style="padding:10px 12px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#5a6673;background:#fcfdff;">Bout</th>
              <th align="left" style="padding:10px 12px;font-size:12px;letter-spacing:0.04em;text-transform:uppercase;color:#5a6673;background:#fcfdff;">Opponent</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </section>
    `;
  }).join("");

  const emailHtml = `
    <div style="background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #d9e1e8;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 24px 18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);border-bottom:1px solid #e7edf3;">
          <h1 style="margin:0;font-size:30px;line-height:1.1;color:#243041;">${escapeHtml(context.meetName)}</h1>
          <div style="margin-top:12px;font-size:16px;color:#465567;">${escapeHtml(formattedMeetDate)}</div>
          <div style="margin-top:4px;font-size:16px;color:#465567;">${escapeHtml(context.location ?? "Location to be announced")}</div>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;font-size:16px;line-height:1.5;">Hello ${escapeHtml(context.recipientName)},</p>
          <h2 style="margin:0 0 14px;font-size:24px;line-height:1.2;color:#243041;">Today's bouts:</h2>
          ${childCardsHtml}
          <div style="margin-top:22px;">
            <a href="${escapeHtml(context.todayUrl)}" style="display:inline-block;background:#2f7fe7;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px;">Open Today Page</a>
          </div>
        </div>
      </div>
    </div>
  `;

  return {
    emailSubject: `Meet is ready to start: ${context.meetName}`,
    emailText,
    emailHtml,
  };
}

function getNotificationLogDelegate() {
  const delegate = (db as unknown as { notificationLog?: unknown }).notificationLog;
  if (!delegate || typeof delegate !== "object" || !("create" in delegate)) {
    throw new Error(
      "Prisma client is missing NotificationLog. Run `npm run db:sqlite`, `npx prisma db push --accept-data-loss`, `npx prisma generate`, then restart the dev server.",
    );
  }
  return delegate as typeof db.notificationLog;
}

function buildNotificationLogMessage(input: Pick<NotificationLogInput, "channel" | "subject" | "message">) {
  if (input.channel !== "email") return input.message;
  const subject = input.subject?.trim();
  return subject && subject.length > 0 ? subject : input.message;
}

function buildNotificationLogSubject(input: Pick<NotificationLogInput, "channel" | "subject">) {
  if (input.channel === "email") return null;
  return input.subject ?? null;
}

function buildEmptyMeetReadySummary(transport: NotificationTransport): MeetReadyForAttendanceSummary {
  return {
    transport,
    recipients: 0,
    attempted: 0,
    sent: 0,
    logged: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    teams: [],
  };
}

function buildEmptyDispatchSummary(transport: NotificationTransport): NotificationDispatchSummary {
  return {
    transport,
    recipients: 0,
    attempted: 0,
    sent: 0,
    logged: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
  };
}

export function buildPreferredMessages(
  recipient: Pick<MeetReadyRecipient, "userId" | "email">,
  payload: {
    meetId: string;
    emailSubject: string;
    emailText: string;
    emailHtml?: string;
    extraPayload: Prisma.InputJsonObject;
  },
): DeliveryMessage[] {
  if (recipient.email) {
    return [{
      channel: "email",
      recipient: recipient.email,
      subject: payload.emailSubject,
      message: payload.emailText,
      html: payload.emailHtml,
      userId: recipient.userId,
      meetId: payload.meetId,
      payload: payload.extraPayload,
    }];
  }
  return [];
}

async function writeNotificationLog(input: NotificationLogInput) {
  if (!isNotificationLoggingEnabled()) {
    return;
  }
  await getNotificationLogDelegate().create({
    data: {
      event: input.event,
      channel: input.channel,
      status: input.status,
      recipient: input.recipient,
      dedupeKey: input.dedupeKey ?? null,
      subject: buildNotificationLogSubject(input),
      message: buildNotificationLogMessage(input),
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      errorMessage: input.errorMessage ?? null,
      payload: input.payload ?? undefined,
      userId: input.userId ?? null,
      meetId: input.meetId ?? null,
      deliveredAt: input.deliveredAt ?? null,
    },
  });
}

async function sendEmailLive(subject: string, text: string, to: string, html?: string): Promise<DeliveryResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!apiKey || !from) {
    return { status: "FAILED", provider: "sendgrid", errorMessage: "SendGrid is not configured." };
  }
  const deliveryDecision = await shouldDeliverEmailTo(to);
  if (deliveryDecision.mode === "log") {
    return {
      status: "LOGGED",
      provider: "log",
    };
  }
  if (!deliveryDecision.allowed) {
    return {
      status: "SKIPPED",
      provider: "sendgrid",
      errorMessage: deliveryDecision.reason ?? "Recipient email is not allowed by the current delivery settings.",
    };
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(apiKey);
  const [response] = await sgMail.default.send({
    to,
    from,
    subject,
    text,
    ...(html ? { html } : {}),
  });
  return {
    status: "SENT",
    provider: "sendgrid",
    providerMessageId: response.headers["x-message-id"] ?? null,
  };
}

async function deliverNotification(
  message: DeliveryMessage,
  transport: NotificationTransport,
  event: NotificationEvent,
): Promise<DeliveryResult> {
  if (transport === "off") {
    return {
      status: "SKIPPED",
      provider: "disabled",
      errorMessage: "Notifications transport is disabled.",
    };
  }

  if (transport === "log") {
    return { status: "LOGGED", provider: "log" };
  }

  try {
    return await sendEmailLive(message.subject ?? "(no subject)", message.message, message.recipient, message.html);
  } catch (error) {
    return {
      status: "FAILED",
      provider: "sendgrid",
      errorMessage: error instanceof Error ? error.message : `Unknown ${event} delivery error.`,
    };
  }
}

async function recordDelivery(
  event: NotificationEvent,
  message: DeliveryMessage,
  result: DeliveryResult,
  options?: { skipEmailLog?: boolean },
) {
  if (options?.skipEmailLog && message.channel === "email") {
    return;
  }
  await writeNotificationLog({
    event,
    channel: message.channel,
    status: result.status,
    recipient: message.recipient,
    subject: message.subject ?? null,
    message: message.message,
    provider: result.provider ?? null,
    providerMessageId: result.providerMessageId ?? null,
    errorMessage: result.errorMessage ?? null,
    payload: message.payload,
    userId: message.userId ?? null,
    meetId: message.meetId ?? null,
    deliveredAt: result.status === "SENT" || result.status === "LOGGED" ? new Date() : null,
  });
}

function buildEventDedupeKey(event: NotificationEvent, meetId: string) {
  return `${event}:${meetId}`;
}

async function claimMeetEventDispatch(event: NotificationEvent, meetId: string) {
  if (!isNotificationLoggingEnabled()) {
    return true;
  }
  try {
    await writeNotificationLog({
      event,
      channel: "system",
      status: "LOGGED",
      recipient: "(meet)",
      dedupeKey: buildEventDedupeKey(event, meetId),
      message: "Dispatch claimed.",
      meetId,
      payload: { scope: "meet", onceOnly: true },
    });
    return true;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return false;
    }
    throw error;
  }
}

async function getMeetReadyRecipients(teamIds: string[]): Promise<MeetReadyRecipient[]> {
  const parents = await db.user.findMany({
    where: {
      role: "PARENT",
      teamId: { in: teamIds },
      children: {
        some: {
          wrestler: {
            teamId: { in: teamIds },
          },
        },
      },
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      teamId: true,
      team: {
        select: {
          name: true,
          symbol: true,
          headCoach: {
            select: {
              firstName: true,
              lastName: true,
              username: true,
              email: true,
            },
          },
        },
      },
      email: true,
      children: {
        where: {
          wrestler: {
            teamId: { in: teamIds },
          },
        },
        select: {
          wrestler: {
            select: {
              first: true,
              last: true,
            },
          },
        },
      },
    },
    orderBy: [{ username: "asc" }],
  });

  return dedupeMeetRecipients(parents.map((parent) => ({
    // Prefer the full name when present, otherwise fall back to username.
    userId: parent.id,
    teamId: parent.teamId ?? "",
    teamLabel: buildTeamLabel(parent.team ?? {}),
    displayName: getUserDisplayName(parent),
    email: normalizeEmail(parent.email),
    childNames: uniqueSortedNames(
      parent.children.map((entry) => `${entry.wrestler.first} ${entry.wrestler.last}`.trim()),
    ),
    headCoachName: resolveHeadCoachName(parent.team?.headCoach),
    headCoachEmail: normalizeEmail(parent.team?.headCoach?.email) ?? "",
  })));
}

async function getMeetPublishedRecipients(meetId: string, teamIds: string[]): Promise<MeetPublishedRecipient[]> {
  const parents = await db.user.findMany({
    where: {
      role: "PARENT",
      children: {
        some: {
          wrestler: {
            teamId: { in: teamIds },
          },
        },
      },
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      children: {
        where: {
          wrestler: {
            teamId: { in: teamIds },
          },
        },
        select: {
          wrestler: {
            select: {
              id: true,
              first: true,
              last: true,
              teamId: true,
              team: {
                select: {
                  name: true,
                  symbol: true,
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ username: "asc" }],
  });

  const childIds = Array.from(new Set(
    parents.flatMap((parent) => parent.children.map((entry) => entry.wrestler.id)),
  ));
  const childIdSet = new Set(childIds);
  const bouts = childIds.length > 0
    ? await db.bout.findMany({
        where: {
          meetId,
          OR: [{ redId: { in: childIds } }, { greenId: { in: childIds } }],
        },
        select: {
          id: true,
          redId: true,
          greenId: true,
          mat: true,
          order: true,
        },
        orderBy: [{ mat: "asc" }, { order: "asc" }, { createdAt: "asc" }],
      })
    : [];

  const wrestlerIds = new Set<string>();
  for (const bout of bouts) {
    wrestlerIds.add(bout.redId);
    wrestlerIds.add(bout.greenId);
  }

  const wrestlers = wrestlerIds.size > 0
    ? await db.wrestler.findMany({
        where: { id: { in: Array.from(wrestlerIds) } },
        select: {
          id: true,
          first: true,
          last: true,
          team: {
            select: {
              name: true,
              symbol: true,
              color: true,
            },
          },
        },
      })
    : [];
  const wrestlerMap = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));
  const matchesByChildId = new Map<string, MeetPublishedMatch[]>();

  for (const bout of bouts) {
    const pushMatch = (childId: string, opponentId: string) => {
      const opponent = wrestlerMap.get(opponentId);
      const match: MeetPublishedMatch = {
        boutId: bout.id,
        boutNumber: formatBoutNumber(bout.mat, bout.order),
        opponentName: opponent ? `${opponent.first} ${opponent.last}`.trim() : opponentId,
        opponentTeam: opponent ? buildTeamLabel(opponent.team) : "",
        opponentTeamColor: opponent?.team.color ?? null,
      };
      matchesByChildId.set(childId, [...(matchesByChildId.get(childId) ?? []), match]);
    };

    if (childIdSet.has(bout.redId)) pushMatch(bout.redId, bout.greenId);
    if (childIdSet.has(bout.greenId)) pushMatch(bout.greenId, bout.redId);
  }

  return parents.map((parent) => ({
    userId: parent.id,
    displayName: getUserDisplayName(parent),
    email: normalizeEmail(parent.email),
    children: parent.children
      .map((entry) => {
        const wrestler = entry.wrestler;
        return {
          childId: wrestler.id,
          fullName: `${wrestler.first} ${wrestler.last}`.trim(),
          teamLabel: buildTeamLabel(wrestler.team),
          matches: matchesByChildId.get(wrestler.id) ?? [],
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  }));
}

async function getMeetAttendeeMessageRecipients(meetId: string): Promise<MeetAttendeeMessageRecipient[]> {
  const attendeeStatuses = ["COMING", "LATE", "EARLY"] as const;
  const parents = await db.user.findMany({
    where: {
      role: "PARENT",
      children: {
        some: {
          wrestler: {
            meetStatuses: {
              some: {
                meetId,
                status: { in: attendeeStatuses as unknown as never[] },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      email: true,
      children: {
        where: {
          wrestler: {
            meetStatuses: {
              some: {
                meetId,
                status: { in: attendeeStatuses as unknown as never[] },
              },
            },
          },
        },
        select: {
          wrestler: {
            select: {
              first: true,
              last: true,
            },
          },
        },
      },
    },
    orderBy: [{ username: "asc" }],
  });

  return parents.map((parent) => ({
    userId: parent.id,
    displayName: getUserDisplayName(parent),
    email: normalizeEmail(parent.email),
    childNames: uniqueSortedNames(
      parent.children.map((entry) => `${entry.wrestler.first} ${entry.wrestler.last}`.trim()),
    ),
  }));
}

async function getMeetRosterMessageRecipients(teamIds: string[]): Promise<MeetAttendeeMessageRecipient[]> {
  const recipients = await getMeetReadyRecipients(teamIds);
  return recipients.map((recipient) => ({
    userId: recipient.userId,
    displayName: recipient.displayName,
    email: recipient.email,
    childNames: recipient.childNames,
  }));
}

export async function notifyMeetReadyForAttendance(
  meetId: string,
  options: { origin?: string | null; checkinStartAt?: Date | null; checkinDurationMinutes?: number | null } = {},
) : Promise<MeetReadyForAttendanceSummary> {
  const emailDeliverySettings = await getEmailDeliverySettings();
  const transport = resolveNotificationTransport(emailDeliverySettings.mode);
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      attendanceDeadline: true,
      checkinStartAt: true,
      checkinDurationMinutes: true,
      status: true,
      deletedAt: true,
      meetTeams: {
        select: {
          teamId: true,
          team: {
            select: {
              name: true,
              symbol: true,
            },
          },
        },
      },
    },
  });

  if (!meet || meet.deletedAt || normalizeMeetPhase(meet.status) !== "ATTENDANCE") {
    return buildEmptyMeetReadySummary(transport);
  }

  if (transport === "off" || emailDeliverySettings.mode === "off") {
    return buildEmptyMeetReadySummary("off");
  }

  const baseUrl = buildBaseUrl(options.origin);
  const attendanceUrl = `${baseUrl}/parent/attendance`;
  const teamIds = meet.meetTeams.map((entry) => entry.teamId);
  const teamLabels = buildTeamLabels(meet.meetTeams);
  const recipients = await getMeetReadyRecipients(teamIds);
  const teamSummaryMap = new Map<string, NotificationTeamSummary>();
  for (const team of meet.meetTeams) {
    teamSummaryMap.set(team.teamId, {
      teamId: team.teamId,
      teamLabel: buildTeamLabel(team.team),
      recipients: 0,
      emailCount: 0,
      successfulCount: 0,
      failedCount: 0,
      skippedCount: 0,
    });
  }

  let attempted = 0;
  let sent = 0;
  let logged = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const recipientTeam = teamSummaryMap.get(recipient.teamId);
    if (recipientTeam) {
      recipientTeam.recipients += 1;
    }
    const content = buildMeetReadyForAttendanceContent({
      meetName: meet.name,
      meetDate: meet.date,
      location: meet.location ?? null,
      attendanceDeadline: meet.attendanceDeadline ?? null,
      checkinStartAt: options.checkinStartAt ?? meet.checkinStartAt ?? null,
      checkinDurationMinutes: options.checkinDurationMinutes ?? meet.checkinDurationMinutes ?? null,
      teamLabels,
      attendanceUrl,
      recipientName: recipient.displayName,
      childNames: recipient.childNames,
      headCoachName: recipient.headCoachName,
      headCoachEmail: recipient.headCoachEmail,
    });

    const messages = buildPreferredMessages(recipient, {
      meetId: meet.id,
      emailSubject: content.emailSubject,
      emailText: content.emailText,
      emailHtml: content.emailHtml,
      extraPayload: {
        attendanceUrl,
        teamLabels,
        childNames: recipient.childNames,
        checkinStartAt: (options.checkinStartAt ?? meet.checkinStartAt)?.toISOString() ?? null,
        checkinDurationMinutes: options.checkinDurationMinutes ?? meet.checkinDurationMinutes ?? null,
      },
    });

    if (messages.length === 0) {
      skipped += 1;
      if (recipientTeam) {
        recipientTeam.skippedCount += 1;
      }
      continue;
    }

    for (const message of messages) {
      attempted += 1;
      const result = await deliverNotification(message, transport, "meet_ready_for_attendance");
      await recordDelivery("meet_ready_for_attendance", message, result, {
        skipEmailLog: !shouldWriteEmailLog(emailDeliverySettings.mode, result.status),
      });
      if (message.channel === "email" && recipientTeam) recipientTeam.emailCount += 1;
      if (result.status === "SENT") {
        sent += 1;
        if (recipientTeam) recipientTeam.successfulCount += 1;
      } else if (result.status === "LOGGED") {
        logged += 1;
        if (recipientTeam) recipientTeam.successfulCount += 1;
      } else if (result.status === "FAILED") {
        failed += 1;
        if (recipientTeam) recipientTeam.failedCount += 1;
      } else {
        skipped += 1;
        if (recipientTeam) recipientTeam.skippedCount += 1;
      }
    }
  }

  return {
    transport,
    recipients: recipients.length,
    attempted,
    sent,
    logged,
    successful: sent + logged,
    failed,
    skipped,
    teams: Array.from(teamSummaryMap.values()),
  };
}

export async function notifyMeetPublished(
  meetId: string,
  options: { origin?: string | null } = {},
): Promise<NotificationDispatchSummary> {
  const emailDeliverySettings = await getEmailDeliverySettings();
  const transport = resolveNotificationTransport(emailDeliverySettings.mode);
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      status: true,
      deletedAt: true,
      sendNotificationsToParents: true,
      meetTeams: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!meet || meet.deletedAt || normalizeMeetPhase(meet.status) !== "PUBLISHED" || !meet.sendNotificationsToParents) {
    return buildEmptyDispatchSummary(transport);
  }

  if (transport === "off" || emailDeliverySettings.mode === "off") {
    return buildEmptyDispatchSummary("off");
  }

  const claimed = await claimMeetEventDispatch("meet_published", meet.id);
  if (!claimed) {
    const summary = buildEmptyDispatchSummary(transport);
    summary.skipped = 1;
    return summary;
  }

  const baseUrl = buildBaseUrl(options.origin);
  const todayUrl = `${baseUrl}/parent/today`;
  const teamIds = meet.meetTeams.map((entry) => entry.teamId);
  const recipients = await getMeetPublishedRecipients(meet.id, teamIds);

  let attempted = 0;
  let sent = 0;
  let logged = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const content = buildMeetPublishedContent({
      meetName: meet.name,
      meetDate: meet.date,
      location: meet.location ?? null,
      todayUrl,
      recipientName: recipient.displayName,
      children: recipient.children,
    });

    const messages = buildPreferredMessages(recipient, {
      meetId: meet.id,
      emailSubject: content.emailSubject,
      emailText: content.emailText,
      emailHtml: content.emailHtml,
      extraPayload: {
        todayUrl,
        children: recipient.children.map((child) => ({
          childId: child.childId,
          fullName: child.fullName,
          teamLabel: child.teamLabel,
          matches: child.matches,
        })),
      },
    });

    if (messages.length === 0) {
      skipped += 1;
      continue;
    }

    for (const message of messages) {
      attempted += 1;
      const result = await deliverNotification(message, transport, "meet_published");
      await recordDelivery("meet_published", message, result, {
        skipEmailLog: !shouldWriteEmailLog(emailDeliverySettings.mode, result.status),
      });
      if (result.status === "SENT") {
        sent += 1;
      } else if (result.status === "LOGGED") {
        logged += 1;
      } else if (result.status === "FAILED") {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return {
    transport,
    recipients: recipients.length,
    attempted,
    sent,
    logged,
    successful: sent + logged,
    failed,
    skipped,
  };
}

export async function notifyMeetAttendeesMessage(
  meetId: string,
  input: { subject: string; body: string; audience: MeetAttendeeMessageAudience },
): Promise<NotificationDispatchSummary> {
  const emailDeliverySettings = await getEmailDeliverySettings();
  const transport = resolveNotificationTransport(emailDeliverySettings.mode);
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      meetTeams: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!meet || meet.deletedAt) {
    return buildEmptyDispatchSummary(transport);
  }

  if (transport === "off" || emailDeliverySettings.mode === "off") {
    return buildEmptyDispatchSummary("off");
  }

  const recipients = input.audience === "roster"
    ? await getMeetRosterMessageRecipients(meet.meetTeams.map((entry) => entry.teamId))
    : await getMeetAttendeeMessageRecipients(meetId);
  let attempted = 0;
  let sent = 0;
  let logged = 0;
  let failed = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    const messages: DeliveryMessage[] = recipient.email
      ? [{
          channel: "email",
          recipient: recipient.email,
          subject: input.subject,
          message: input.body,
          userId: recipient.userId,
          meetId,
          payload: {
            childNames: recipient.childNames,
            source: "meet_attendees_message",
            audience: input.audience,
          },
        }]
      : [];

    if (messages.length === 0) {
      skipped += 1;
      continue;
    }

    for (const message of messages) {
      attempted += 1;
      const result = await deliverNotification(message, transport, "meet_attendees_message");
      await recordDelivery("meet_attendees_message", message, result, {
        skipEmailLog: !shouldWriteEmailLog(emailDeliverySettings.mode, result.status),
      });
      if (result.status === "SENT") {
        sent += 1;
      } else if (result.status === "LOGGED") {
        logged += 1;
      } else if (result.status === "FAILED") {
        failed += 1;
      } else {
        skipped += 1;
      }
    }
  }

  return {
    transport,
    recipients: recipients.length,
    attempted,
    sent,
    logged,
    successful: sent + logged,
    failed,
    skipped,
  };
}

export async function countMeetAttendeeMessageRecipients(
  meetId: string,
  audience: MeetAttendeeMessageAudience,
): Promise<number> {
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      deletedAt: true,
      meetTeams: {
        select: {
          teamId: true,
        },
      },
    },
  });

  if (!meet || meet.deletedAt) {
    return 0;
  }

  const recipients = audience === "roster"
    ? await getMeetRosterMessageRecipients(meet.meetTeams.map((entry) => entry.teamId))
    : await getMeetAttendeeMessageRecipients(meetId);
  return recipients.length;
}
