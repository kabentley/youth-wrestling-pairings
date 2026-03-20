import type { Prisma } from "@prisma/client";

import { adjustTeamTextColor } from "./contrastText";
import { db } from "./db";
import { getEmailDeliverySettings, shouldDeliverEmailTo, shouldWriteEmailLogs } from "./emailDelivery";

export type WelcomeEmailResult =
  | { status: "sent"; reason: null }
  | { status: "skipped"; reason: string }
  | { status: "logged"; reason: string };

export type WelcomeEmailPreview = {
  subject: string;
  text: string;
  html?: string;
  sampleData: {
    leagueName: string;
    fullName: string;
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

type SendWelcomeEmailOptions = {
  request: Request;
  email: string;
  username: string;
  fullName?: string | null;
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
  fullName?: string | null;
  tempPassword?: string | null;
  signInUrl: string;
  myWrestlersUrl: string;
  coachName?: string | null;
  coachEmail?: string | null;
  teamLabel?: string | null;
  linkedWrestlerNames?: string[] | null;
  mustResetPassword?: boolean;
  leagueLogoUrl?: string | null;
  teamLogoUrl?: string | null;
  teamColor?: string | null;
};

type WelcomeEmailTemplateContext = {
  leagueName: string;
  email: string;
  username: string;
  fullName: string;
  temporaryPassword: string;
  signInUrl: string;
  myWrestlersUrl: string;
  coachName: string;
  coachEmail: string;
  teamLabel: string;
  linkedWrestlerNames: string[];
  passwordInstructions: string;
  greetingLine: string;
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
      logoData: true,
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
    hasLeagueLogo: Boolean(league?.logoData),
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
  fullName,
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
  fullName: string;
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
  const normalizedFullName = fullName.trim();
  const normalizedCoachName = coachName.trim();
  const normalizedCoachEmail = coachEmail.trim();
  const normalizedLinkedWrestlerNames = linkedWrestlerNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  const linkedWrestlersBlock = normalizedLinkedWrestlerNames.length > 0
    ? [
      "This account has been linked to the following wrestlers:",
      ...normalizedLinkedWrestlerNames.map((name) => `- ${name}`),
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
    fullName: normalizedFullName,
    temporaryPassword,
    signInUrl,
    myWrestlersUrl,
    coachName,
    coachEmail,
    teamLabel,
    linkedWrestlerNames: normalizedLinkedWrestlerNames,
    passwordInstructions: buildPasswordInstructions(hasTemporaryPassword, mustResetPassword),
    greetingLine: normalizedFullName
      ? `Welcome ${normalizedFullName}! Your account has been created.`
      : "Welcome! Your account has been created.",
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
      logoData: true,
      color: true,
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
    hasTeamLogo: Boolean(team?.logoData),
    teamColor: team?.color.trim() ?? "",
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
    "{greetingLine}",
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
  fullName = null,
  userId = null,
  tempPassword = null,
  teamId = null,
  teamName = null,
  teamLabel = null,
  leagueName,
  linkedWrestlerNames = null,
  mustResetPassword = true,
}: SendWelcomeEmailOptions): Promise<WelcomeEmailPreview> {
  const baseUrl = resolveBaseUrl(request);
  const signInUrl = `${baseUrl}/auth/signin?username=${encodeURIComponent(username)}`;
  const myWrestlersUrl = `${baseUrl}/parent`;
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
    fullName: fullName?.trim() ?? "",
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
      fullName,
      tempPassword: normalizedTempPassword,
      signInUrl,
      myWrestlersUrl,
      coachName: coachContext.coachName,
      coachEmail: coachContext.coachEmail,
      teamLabel,
      linkedWrestlerNames: resolvedLinkedWrestlerNames,
      mustResetPassword,
    }),
    html: buildWelcomeEmailHtml({
      leagueName: resolvedLeagueSettings.leagueName,
      email,
      username,
      fullName,
      tempPassword: normalizedTempPassword,
      signInUrl,
      myWrestlersUrl,
      coachName: coachContext.coachName,
      coachEmail: coachContext.coachEmail,
      teamLabel,
      linkedWrestlerNames: resolvedLinkedWrestlerNames,
      mustResetPassword,
      leagueLogoUrl: resolvedLeagueSettings.hasLeagueLogo ? `${baseUrl}/api/league/logo/file` : null,
      teamLogoUrl: teamId && coachContext.hasTeamLogo ? `${baseUrl}/api/teams/${teamId}/logo/file` : null,
      teamColor: coachContext.teamColor,
    }),
    sampleData: {
      leagueName: context.leagueName,
      fullName: context.fullName,
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
  fullName = null,
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
    fullName: fullName?.trim() ?? "",
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

export function buildWelcomeEmailHtml({
  leagueName,
  email,
  username,
  fullName = null,
  tempPassword = null,
  signInUrl,
  myWrestlersUrl,
  coachName = null,
  coachEmail = null,
  teamLabel,
  linkedWrestlerNames = null,
  mustResetPassword = true,
  leagueLogoUrl = null,
  teamLogoUrl = null,
  teamColor = null,
}: WelcomeEmailContentOptions) {
  const normalizedTempPassword = tempPassword?.trim() ?? "";
  const context = buildWelcomeEmailTemplateContext({
    leagueName,
    email,
    username,
    fullName: fullName?.trim() ?? "",
    temporaryPassword: normalizedTempPassword,
    signInUrl,
    myWrestlersUrl,
    coachName: coachName?.trim() ?? "",
    coachEmail: coachEmail?.trim() ?? "",
    teamLabel: teamLabel?.trim() ?? "",
    linkedWrestlerNames: linkedWrestlerNames ?? [],
    mustResetPassword,
  });
  const linkedWrestlersHtml = context.linkedWrestlerNames.length > 0
    ? `
        <div style="margin-top:20px;border:1px solid #d9e1e8;border-radius:14px;overflow:hidden;background:#ffffff;">
          <div style="padding:12px 14px;background:#f7f9fc;border-bottom:1px solid #e7edf3;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#5a6673;">Linked Wrestlers</div>
          <div style="padding:14px 16px;display:grid;gap:10px;">
            ${context.linkedWrestlerNames.map((name) => `
              <div style="font-size:22px;line-height:1.2;font-weight:800;color:#243041;background:#fcfdff;border:1px solid #e7edf3;border-radius:12px;padding:12px 14px;">
                ${escapeHtml(name)}
              </div>
            `).join("")}
          </div>
        </div>
      `
    : "";
  const coachLine = context.coachContactLine
    ? `<p style="margin:18px 0 0;font-size:15px;line-height:1.5;color:#465567;">${escapeHtml(context.coachContactLine)}</p>`
    : "";
  const adjustedTeamColor = adjustTeamTextColor(teamColor);

  return `
    <div style="background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:760px;margin:0 auto;background:#ffffff;border:1px solid #d9e1e8;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 24px 18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);border-bottom:1px solid #e7edf3;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:18px;">
            <div style="min-width:0;">
              <h1 style="margin:0;font-size:30px;line-height:1.1;color:#243041;">Welcome to the ${escapeHtml(context.leagueName)} meet scheduling app</h1>
            </div>
            ${leagueLogoUrl ? `<img src="${escapeHtml(leagueLogoUrl)}" alt="League logo" style="width:72px;height:72px;object-fit:contain;flex:0 0 auto;" />` : ""}
          </div>
          ${context.teamLabel || teamLogoUrl ? `
            <div style="margin-top:16px;display:flex;align-items:center;gap:14px;">
              ${teamLogoUrl ? `<img src="${escapeHtml(teamLogoUrl)}" alt="${escapeHtml(context.teamLabel || "Team")} logo" style="width:56px;height:56px;object-fit:contain;flex:0 0 auto;" />` : ""}
              ${context.teamLabel ? `<div style="font-size:26px;line-height:1.15;font-weight:800;color:${escapeHtml(adjustedTeamColor)};">${escapeHtml(context.teamLabel)}</div>` : ""}
            </div>
          ` : ""}
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 12px;font-size:18px;line-height:1.5;">Welcome, ${context.fullName ? `<strong>${escapeHtml(context.fullName)}</strong>` : "there"}. Your account has been created.</p>
          <div style="border:1px solid #d9e1e8;border-radius:14px;background:#ffffff;overflow:hidden;">
            <div style="padding:12px 14px;background:#f7f9fc;border-bottom:1px solid #e7edf3;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#5a6673;">Account Details</div>
            <div style="padding:16px;">
              <div style="font-size:15px;line-height:1.6;color:#243041;"><strong>Username:</strong> ${escapeHtml(context.username)}</div>
              ${context.temporaryPassword ? `<div style="font-size:15px;line-height:1.6;color:#243041;"><strong>Temporary password:</strong> ${escapeHtml(context.temporaryPassword)}</div>` : ""}
              <div style="font-size:15px;line-height:1.6;color:#465567;margin-top:10px;">${escapeHtml(context.passwordInstructions)}</div>
              <div style="margin-top:16px;display:flex;gap:12px;flex-wrap:wrap;">
                <a href="${escapeHtml(context.signInUrl)}" style="display:inline-block;background:#2f7fe7;color:#ffffff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px;">Sign In</a>
              </div>
            </div>
          </div>
          ${linkedWrestlersHtml}
          ${coachLine}
        </div>
      </div>
    </div>
  `;
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
  const message = input.subject.trim() || input.message;
  await db.notificationLog.create({
    data: {
      event: "welcome_email",
      channel: "email",
      status: input.status,
      recipient: input.recipient,
      subject: null,
      message,
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
  fullName = null,
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
  const emailDeliverySettings = await getEmailDeliverySettings();
  const shouldLogEmail = shouldWriteEmailLogs(emailDeliverySettings.mode);
  const preview = await buildWelcomeEmailPreviewInternal({
    request,
    email,
    username,
    fullName,
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
    fullName: preview.sampleData.fullName,
    signInUrl: preview.sampleData.signInUrl,
    myWrestlersUrl: preview.sampleData.myWrestlersUrl,
    linkedWrestlerNames: preview.sampleData.linkedWrestlerNames,
    coachName: preview.sampleData.coachName,
    coachEmail: preview.sampleData.coachEmail,
  };

  if (!key || !from) {
    if (shouldLogEmail) {
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
    }
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
    if (shouldLogEmail) {
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
    }
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
      ...(preview.html ? { html: preview.html } : {}),
    });
    if (shouldLogEmail) {
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
    }
  } catch (error) {
    if (shouldLogEmail) {
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
    }
    throw error;
  }

  return {
    status: "sent",
    reason: null,
  };
}
