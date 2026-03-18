import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { shouldDeliverEmailTo } from "./emailDelivery";

export type WelcomeEmailResult =
  | { status: "sent"; reason: null }
  | { status: "skipped"; reason: string }
  | { status: "logged"; reason: string };

export type WelcomeEmailPreview = {
  subject: string;
  text: string;
  sampleData: {
    leagueName: string;
    email: string;
    username: string;
    temporaryPassword: string;
    signInUrl: string;
    myWrestlersUrl: string;
    coachName: string;
    coachEmail: string;
    teamLabel: string;
    linkedWrestlerNames: string[];
    passwordInstructions: string;
  };
};

type SendWelcomeEmailOptions = {
  request: Request;
  email: string;
  username: string;
  userId?: string | null;
  tempPassword?: string | null;
  teamId?: string | null;
  teamName?: string | null;
  teamLabel?: string | null;
  leagueName?: string | null;
  linkedWrestlerNames?: string[] | null;
  mustResetPassword?: boolean;
};

type WelcomeEmailContentOptions = {
  leagueName: string;
  email: string;
  username: string;
  tempPassword?: string | null;
  signInUrl: string;
  myWrestlersUrl: string;
  coachName?: string | null;
  coachEmail?: string | null;
  teamLabel?: string | null;
  linkedWrestlerNames?: string[] | null;
  mustResetPassword?: boolean;
};

type WelcomeEmailTemplateContext = {
  leagueName: string;
  email: string;
  username: string;
  temporaryPassword: string;
  signInUrl: string;
  myWrestlersUrl: string;
  coachName: string;
  coachEmail: string;
  teamLabel: string;
  linkedWrestlerNames: string[];
  passwordInstructions: string;
  usernameLine: string;
  temporaryPasswordLine: string;
  linkedWrestlersBlock: string;
  coachContactLine: string;
};

function resolveBaseUrl(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return request.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  }
}

async function resolveLeagueWelcomeSettings(explicitLeagueName?: string | null) {
  const trimmedExplicitLeagueName = explicitLeagueName?.trim();
  const league = await db.league.findFirst({
    select: {
      name: true,
    },
  });
  const storedLeagueName = league?.name?.trim() ?? "";
  const leagueName = trimmedExplicitLeagueName && trimmedExplicitLeagueName.length > 0
    ? trimmedExplicitLeagueName
    : storedLeagueName.length > 0
      ? storedLeagueName
      : "the league";
  return {
    leagueName,
  };
}

function buildPasswordInstructions(hasTemporaryPassword: boolean, mustResetPassword: boolean) {
  if (!hasTemporaryPassword) {
    return "Use the password you set during sign-up. You can change it from the Account page after signing in.";
  }
  return mustResetPassword
    ? "You will be prompted to reset your password after signing in."
    : "You can change your password from the Account page after signing in.";
}

export function buildWelcomeEmailSubject({
  leagueName,
  teamName,
}: {
  leagueName: string;
  teamName?: string | null;
}) {
  const trimmedLeagueName = leagueName.trim();
  const normalizedLeagueName = trimmedLeagueName.length > 0 ? trimmedLeagueName : "league";
  const normalizedTeamName = teamName?.trim() ?? "";
  if (normalizedTeamName) {
    return `Welcome to the ${normalizedLeagueName} meet scheduling app for ${normalizedTeamName}.`;
  }
  return `Welcome to the ${normalizedLeagueName} meet scheduling app.`;
}

function buildWelcomeEmailTemplateContext({
  leagueName,
  email,
  username,
  temporaryPassword,
  signInUrl,
  myWrestlersUrl,
  coachName,
  coachEmail,
  teamLabel,
  linkedWrestlerNames,
  mustResetPassword,
}: {
  leagueName: string;
  email: string;
  username: string;
  temporaryPassword: string;
  signInUrl: string;
  myWrestlersUrl: string;
  coachName: string;
  coachEmail: string;
  teamLabel: string;
  linkedWrestlerNames: string[];
  mustResetPassword: boolean;
}): WelcomeEmailTemplateContext {
  const hasTemporaryPassword = temporaryPassword.length > 0;
  const normalizedCoachName = coachName.trim();
  const normalizedCoachEmail = coachEmail.trim();
  const normalizedLinkedWrestlerNames = linkedWrestlerNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const linkedWrestlersBlock = normalizedLinkedWrestlerNames.length > 0
    ? [
      "This account has been linked to the following wrestlers:",
      ...normalizedLinkedWrestlerNames.map((name) => `- ${name}`),
      "",
      `After you sign in, you can correct any errors and keep track of your wrestlers on your My Wrestlers page: ${myWrestlersUrl}`,
    ].join("\n")
    : "";
  const coachContactLine = normalizedCoachName && normalizedCoachEmail
    ? `If you have questions about this app, please contact your coach: ${normalizedCoachName} <${normalizedCoachEmail}>`
    : normalizedCoachName
      ? `If you have questions about this app, please contact your coach: ${normalizedCoachName}`
      : normalizedCoachEmail
        ? `If you have questions about this app, please contact your coach: <${normalizedCoachEmail}>`
        : "";
  return {
    leagueName,
    email,
    username,
    temporaryPassword,
    signInUrl,
    myWrestlersUrl,
    coachName,
    coachEmail,
    teamLabel,
    linkedWrestlerNames: normalizedLinkedWrestlerNames,
    passwordInstructions: buildPasswordInstructions(hasTemporaryPassword, mustResetPassword),
    usernameLine: `Username: ${username}`,
    temporaryPasswordLine: hasTemporaryPassword ? `Temporary password: ${temporaryPassword}` : "",
    linkedWrestlersBlock,
    coachContactLine,
  };
}

async function resolveWelcomeEmailCoachContext(teamId?: string | null) {
  const normalizedTeamId = teamId?.trim() ?? "";
  if (!normalizedTeamId) {
    return {
      coachName: "",
      coachEmail: "",
    };
  }
  const team = await db.team.findUnique({
    where: { id: normalizedTeamId },
    select: {
      headCoach: {
        select: {
          name: true,
          username: true,
          email: true,
        },
      },
    },
  });
  const headCoach = team?.headCoach;
  const coachName = headCoach
    ? ((headCoach.name ? headCoach.name.trim() : "") || (headCoach.username ? headCoach.username.trim() : ""))
    : "";
  const coachEmail = headCoach?.email ? headCoach.email.trim() : "";
  return {
    coachName,
    coachEmail,
  };
}

async function resolveLinkedWrestlerNames({
  userId,
  explicitLinkedWrestlerNames,
}: {
  userId?: string | null;
  explicitLinkedWrestlerNames?: string[] | null;
}) {
  if (explicitLinkedWrestlerNames && explicitLinkedWrestlerNames.length > 0) {
    return explicitLinkedWrestlerNames
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
  }
  const normalizedUserId = userId?.trim() ?? "";
  if (!normalizedUserId) {
    return [];
  }
  const links = await db.userChild.findMany({
    where: { userId: normalizedUserId },
    select: {
      wrestler: {
        select: {
          first: true,
          last: true,
        },
      },
    },
    orderBy: [
      { wrestler: { last: "asc" } },
      { wrestler: { first: "asc" } },
    ],
  });
  return links
    .map((link) => `${link.wrestler.first} ${link.wrestler.last}`.trim())
    .filter((name) => name.length > 0);
}

function normalizeRenderedTemplate(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function renderWelcomeEmailTemplate(template: string, context: WelcomeEmailTemplateContext) {
  return normalizeRenderedTemplate(
    template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => {
      if (Object.prototype.hasOwnProperty.call(context, key)) {
        return String(context[key as keyof WelcomeEmailTemplateContext]);
      }
      return match;
    }),
  );
}

export function buildDefaultWelcomeEmailBodyTemplate() {
  return [
    "Welcome! Your account has been created.",
    "",
    "{usernameLine}",
    "{temporaryPasswordLine}",
    "",
    "Sign in here: {signInUrl}",
    "{passwordInstructions}",
    "",
    "{linkedWrestlersBlock}",
    "",
    "{coachContactLine}",
  ].join("\n");
}

async function buildWelcomeEmailPreviewInternal({
  request,
  email,
  username,
  userId = null,
  tempPassword = null,
  teamId = null,
  teamName = null,
  teamLabel = null,
  leagueName,
  linkedWrestlerNames = null,
  mustResetPassword = true,
}: SendWelcomeEmailOptions): Promise<WelcomeEmailPreview> {
  const signInUrl = `${resolveBaseUrl(request)}/auth/signin`;
  const myWrestlersUrl = `${resolveBaseUrl(request)}/parent`;
  const resolvedLeagueSettings = await resolveLeagueWelcomeSettings(leagueName);
  const normalizedTempPassword = tempPassword?.trim() ?? "";
  const coachContext = await resolveWelcomeEmailCoachContext(teamId);
  const resolvedLinkedWrestlerNames = await resolveLinkedWrestlerNames({
    userId,
    explicitLinkedWrestlerNames: linkedWrestlerNames,
  });
  const context = buildWelcomeEmailTemplateContext({
    leagueName: resolvedLeagueSettings.leagueName,
    email,
    username,
    temporaryPassword: normalizedTempPassword,
    signInUrl,
    myWrestlersUrl,
    coachName: coachContext.coachName,
    coachEmail: coachContext.coachEmail,
    teamLabel: teamLabel ? teamLabel.trim() : "",
    linkedWrestlerNames: resolvedLinkedWrestlerNames,
    mustResetPassword,
  });
  return {
    subject: buildWelcomeEmailSubject({
      leagueName: resolvedLeagueSettings.leagueName,
      teamName,
    }),
    text: buildWelcomeEmailText({
      leagueName: resolvedLeagueSettings.leagueName,
      email,
      username,
      tempPassword: normalizedTempPassword,
      signInUrl,
      myWrestlersUrl,
      coachName: coachContext.coachName,
      coachEmail: coachContext.coachEmail,
      teamLabel,
      linkedWrestlerNames: resolvedLinkedWrestlerNames,
      mustResetPassword,
    }),
    sampleData: {
      leagueName: context.leagueName,
      email: context.email,
      username: context.username,
      temporaryPassword: context.temporaryPassword,
      signInUrl: context.signInUrl,
      myWrestlersUrl: context.myWrestlersUrl,
      coachName: context.coachName,
      coachEmail: context.coachEmail,
      teamLabel: context.teamLabel,
      linkedWrestlerNames: context.linkedWrestlerNames,
      passwordInstructions: context.passwordInstructions,
    },
  };
}

export async function buildWelcomeEmailPreview(options: SendWelcomeEmailOptions): Promise<WelcomeEmailPreview> {
  return buildWelcomeEmailPreviewInternal(options);
}

export function buildWelcomeEmailText({
  leagueName,
  email,
  username,
  tempPassword = null,
  signInUrl,
  myWrestlersUrl,
  coachName = null,
  coachEmail = null,
  teamLabel,
  linkedWrestlerNames = null,
  mustResetPassword = true,
}: WelcomeEmailContentOptions) {
  const normalizedTempPassword = tempPassword?.trim() ?? "";
  const normalizedTemplate = buildDefaultWelcomeEmailBodyTemplate();
  const context = buildWelcomeEmailTemplateContext({
    leagueName,
    email,
    username,
    temporaryPassword: normalizedTempPassword,
    signInUrl,
    myWrestlersUrl,
    coachName: coachName?.trim() ?? "",
    coachEmail: coachEmail?.trim() ?? "",
    teamLabel: teamLabel?.trim() ?? "",
    linkedWrestlerNames: linkedWrestlerNames ?? [],
    mustResetPassword,
  });
  return renderWelcomeEmailTemplate(normalizedTemplate, context);
}

export function describeWelcomeEmailResult(result: WelcomeEmailResult) {
  if (result.status === "sent") {
    return "Welcome email sent.";
  }
  if (result.status === "logged") {
    return result.reason;
  }
  return `Welcome email skipped: ${result.reason}`;
}

async function writeWelcomeEmailLog(input: {
  status: "SKIPPED" | "LOGGED" | "SENT" | "FAILED";
  recipient: string;
  subject: string;
  message: string;
  userId?: string | null;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  deliveredAt?: Date | null;
  payload?: Prisma.InputJsonValue;
}) {
  await db.notificationLog.create({
    data: {
      event: "welcome_email",
      channel: "email",
      status: input.status,
      recipient: input.recipient,
      subject: input.subject,
      message: input.message,
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      errorMessage: input.errorMessage ?? null,
      payload: input.payload,
      userId: input.userId ?? null,
      deliveredAt: input.deliveredAt ?? null,
    },
  });
}

export async function sendWelcomeEmail({
  request,
  email,
  username,
  userId = null,
  tempPassword = null,
  teamId = null,
  teamName = null,
  teamLabel = null,
  leagueName,
  linkedWrestlerNames = null,
  mustResetPassword = true,
}: SendWelcomeEmailOptions): Promise<WelcomeEmailResult> {
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  const normalizedTempPassword = tempPassword?.trim() ?? "";
  const preview = await buildWelcomeEmailPreviewInternal({
    request,
    email,
    username,
    userId,
    tempPassword,
    teamId,
    teamName,
    teamLabel,
    leagueName,
    linkedWrestlerNames,
    mustResetPassword,
  });
  const signInUrl = preview.sampleData.signInUrl;
  const payload = {
    signInUrl: preview.sampleData.signInUrl,
    myWrestlersUrl: preview.sampleData.myWrestlersUrl,
    linkedWrestlerNames: preview.sampleData.linkedWrestlerNames,
    coachName: preview.sampleData.coachName,
    coachEmail: preview.sampleData.coachEmail,
  };

  if (!key || !from) {
    await writeWelcomeEmailLog({
      status: "LOGGED",
      recipient: email,
      subject: preview.subject,
      message: preview.text,
      userId,
      provider: "log",
      errorMessage: "SendGrid is not configured.",
      deliveredAt: new Date(),
      payload,
    });
    if (process.env.NODE_ENV !== "production") {
      if (normalizedTempPassword) {
        console.log(`Temp password for ${email} (${username}): ${normalizedTempPassword}`);
      } else {
        console.log(`Welcome email fallback for ${email} (${username}). Sign in at: ${signInUrl}`);
      }
      return {
        status: "logged",
        reason: normalizedTempPassword
          ? "Welcome email not configured; temporary password logged locally."
          : "Welcome email not configured; sign-in details logged locally.",
      };
    }
    throw new Error("WELCOME_DELIVERY_FAILED");
  }

  const deliveryDecision = await shouldDeliverEmailTo(email);
  if (deliveryDecision.mode === "log") {
    await writeWelcomeEmailLog({
      status: "LOGGED",
      recipient: email,
      subject: preview.subject,
      message: preview.text,
      userId,
      provider: "log",
      deliveredAt: new Date(),
      payload,
    });
    return {
      status: "logged",
      reason: "Welcome email logged without sending.",
    };
  }
  if (!deliveryDecision.allowed) {
    await writeWelcomeEmailLog({
      status: "SKIPPED",
      recipient: email,
      subject: preview.subject,
      message: preview.text,
      userId,
      provider: deliveryDecision.mode === "off" ? "disabled" : "sendgrid",
      errorMessage: deliveryDecision.reason ?? "Recipient email is not allowed by the current delivery settings.",
      payload,
    });
    return {
      status: "skipped",
      reason: deliveryDecision.reason ?? "Recipient email is not allowed by the current delivery settings.",
    };
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  try {
    const [response] = await sgMail.default.send({
      to: email,
      from,
      subject: preview.subject,
      text: preview.text,
    });
    await writeWelcomeEmailLog({
      status: "SENT",
      recipient: email,
      subject: preview.subject,
      message: preview.text,
      userId,
      provider: "sendgrid",
      providerMessageId: response.headers["x-message-id"] ?? null,
      deliveredAt: new Date(),
      payload,
    });
  } catch (error) {
    await writeWelcomeEmailLog({
      status: "FAILED",
      recipient: email,
      subject: preview.subject,
      message: preview.text,
      userId,
      provider: "sendgrid",
      errorMessage: error instanceof Error ? error.message : "Unknown welcome email delivery error.",
      payload,
    });
    throw error;
  }

  return {
    status: "sent",
    reason: null,
  };
}
