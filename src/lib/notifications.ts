import { Prisma } from "@prisma/client";

import { db } from "./db";
import { normalizeMeetPhase } from "./meetPhase";

export type NotificationTransport = "off" | "log" | "live";
export type NotificationChannel = "email" | "system";
export type NotificationEvent = "meet_ready_for_attendance";
export type NotificationStatus = "SKIPPED" | "LOGGED" | "SENT" | "FAILED";
export type NotificationTeamSummary = {
  teamId: string;
  teamLabel: string;
  recipients: number;
  emailCount: number;
  successfulCount: number;
  failedCount: number;
  skippedCount: number;
};
export type MeetReadyForAttendanceSummary = {
  transport: NotificationTransport;
  recipients: number;
  attempted: number;
  sent: number;
  logged: number;
  successful: number;
  failed: number;
  skipped: number;
  teams: NotificationTeamSummary[];
};

function isNotificationLoggingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.ENABLE_NOTIFICATION_LOGGING === "true";
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
};

type MeetReadyContent = {
  emailSubject: string;
  emailText: string;
};

type MeetReadyContext = {
  meetName: string;
  meetDate: Date;
  location: string | null;
  attendanceDeadline: Date | null;
  teamLabels: string[];
  attendanceUrl: string;
  myWrestlersUrl: string;
  recipientName: string;
  childNames: string[];
};

export function resolveNotificationTransport(
  env: NodeJS.ProcessEnv = process.env,
): NotificationTransport {
  const raw = (env.NOTIFICATIONS_TRANSPORT ?? "").trim().toLowerCase();
  if (raw === "off" || raw === "log" || raw === "live") {
    return raw;
  }
  return env.NODE_ENV === "production" ? "live" : "log";
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

function formatList(items: string[]) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
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
  }

  return Array.from(byUserId.values());
}

export function buildMeetReadyForAttendanceContent(
  context: MeetReadyContext,
): MeetReadyContent {
  const childLine = context.childNames.length > 0
    ? `Linked wrestlers: ${formatList(context.childNames)}.`
    : "Link your wrestlers on the My Wrestlers page if you do not see them yet.";
  const locationLine = context.location ? `Location: ${context.location}.` : "Location: To be announced.";
  const teamsLine = context.teamLabels.length > 0
    ? `Teams: ${formatList(context.teamLabels)}.`
    : "";
  const deadlineLine = `Attendance deadline: ${formatDeadline(context.attendanceDeadline)}`;

  return {
    emailSubject: `Attendance open for ${context.meetName}`,
    emailText: [
      `Hi ${context.recipientName},`,
      "",
      `${context.meetName} is ready for attendance.`,
      `Meet date: ${formatMeetDate(context.meetDate)}.`,
      locationLine,
      teamsLine,
      deadlineLine,
      childLine,
      "",
      `Reply here: ${context.attendanceUrl}`,
      `My Wrestlers: ${context.myWrestlersUrl}`,
    ].filter(Boolean).join("\n"),
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

export function buildPreferredMessages(
  recipient: Pick<MeetReadyRecipient, "userId" | "email">,
  payload: {
    meetId: string;
    emailSubject: string;
    emailText: string;
    extraPayload: Prisma.InputJsonObject;
  },
): DeliveryMessage[] {
  if (recipient.email) {
    return [{
      channel: "email",
      recipient: recipient.email,
      subject: payload.emailSubject,
      message: payload.emailText,
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
      subject: input.subject ?? null,
      message: input.message,
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

async function sendEmailLive(subject: string, text: string, to: string): Promise<DeliveryResult> {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!apiKey || !from) {
    return { status: "FAILED", provider: "sendgrid", errorMessage: "SendGrid is not configured." };
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(apiKey);
  const [response] = await sgMail.default.send({
    to,
    from,
    subject,
    text,
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
    return await sendEmailLive(message.subject ?? "(no subject)", message.message, message.recipient);
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
) {
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
      name: true,
      teamId: true,
      team: {
        select: {
          name: true,
          symbol: true,
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
    displayName: parent.name?.trim() ? parent.name.trim() : parent.username,
    email: normalizeEmail(parent.email),
    childNames: uniqueSortedNames(
      parent.children.map((entry) => `${entry.wrestler.first} ${entry.wrestler.last}`.trim()),
    ),
  })));
}

export async function notifyMeetReadyForAttendance(
  meetId: string,
  options: { origin?: string | null } = {},
) : Promise<MeetReadyForAttendanceSummary> {
  const transport = resolveNotificationTransport();
  const meet = await db.meet.findUnique({
    where: { id: meetId },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      attendanceDeadline: true,
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

  // This event is only for the initial creation of the meet. Reopening attendance
  // should restore data, not send a new round of parent notifications.
  const claimed = await claimMeetEventDispatch("meet_ready_for_attendance", meet.id);
  if (!claimed) {
    const summary = buildEmptyMeetReadySummary(transport);
    summary.skipped = 1;
    return summary;
  }

  const baseUrl = buildBaseUrl(options.origin);
  const attendanceUrl = `${baseUrl}/parent/attendance`;
  const myWrestlersUrl = `${baseUrl}/parent`;
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
      teamLabels,
      attendanceUrl,
      myWrestlersUrl,
      recipientName: recipient.displayName,
      childNames: recipient.childNames,
    });

    const messages = buildPreferredMessages(recipient, {
      meetId: meet.id,
      emailSubject: content.emailSubject,
      emailText: content.emailText,
      extraPayload: { attendanceUrl, myWrestlersUrl, teamLabels, childNames: recipient.childNames },
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
      await recordDelivery("meet_ready_for_attendance", message, result);
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
