import type { Prisma } from "@prisma/client";

import { db } from "./db";
import { getEmailDeliverySettings, shouldDeliverEmailTo, shouldWriteEmailLog, shouldWriteEmailLogs } from "./emailDelivery";

export type PasswordResetEmailResult =
  | { status: "sent"; reason: null }
  | { status: "skipped"; reason: string }
  | { status: "logged"; reason: string };

export type PasswordResetEmailContent = {
  subject: string;
  text: string;
  html: string;
};

export type PasswordResetEmailPreview = PasswordResetEmailContent & {
  sampleData: {
    leagueName: string;
    fullName: string;
    email: string;
    username: string;
    temporaryPassword: string;
    signInUrl: string;
  };
};

type BuildPasswordResetEmailContentOptions = {
  leagueName: string;
  email: string;
  username: string;
  tempPassword: string;
  signInUrl: string;
  fullName?: string | null;
};

type SendPasswordResetEmailOptions = {
  request: Request;
  email: string;
  username: string;
  tempPassword: string;
  userId?: string | null;
  fullName?: string | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function resolveBaseUrl(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return request.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  }
}

async function resolveLeagueName() {
  const league = await db.league.findFirst({
    select: { name: true },
  });
  return league?.name?.trim() || "the league";
}

export function buildPasswordResetEmailContent({
  leagueName,
  email,
  username,
  tempPassword,
  signInUrl,
  fullName = null,
}: BuildPasswordResetEmailContentOptions): PasswordResetEmailContent {
  const normalizedLeagueName = leagueName.trim() || "the league";
  const normalizedEmail = email.trim();
  const normalizedUsername = username.trim();
  const normalizedPassword = tempPassword.trim();
  const normalizedSignInUrl = signInUrl.trim();
  const normalizedFullName = fullName?.trim() ?? "";
  const greeting = normalizedFullName ? `Hello ${normalizedFullName},` : "Hello,";
  const subject = `Your temporary password for ${normalizedLeagueName}`;
  const text = [
    greeting,
    "",
    `A coach or administrator reset your password for ${normalizedLeagueName}.`,
    "",
    `Username: ${normalizedUsername}`,
    `Temporary password: ${normalizedPassword}`,
    `Sign in: ${normalizedSignInUrl}`,
    "",
    "You will be required to choose a new password after signing in.",
    "",
    "If you were not expecting this change, contact your coach or league administrator.",
    normalizedEmail ? `This email was sent to ${normalizedEmail}.` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
  const html = `
    <div style="background:#f4f7fb;padding:24px;font-family:Arial,sans-serif;color:#1f2937;">
      <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #d9e1e8;border-radius:18px;overflow:hidden;">
        <div style="padding:24px 24px 18px;background:linear-gradient(180deg,#f8fbff 0%,#ffffff 100%);border-bottom:1px solid #e7edf3;">
          <div style="font-size:14px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#5a6673;">Password Reset</div>
          <h1 style="margin:8px 0 0;font-size:30px;line-height:1.1;color:#243041;">Your temporary password</h1>
        </div>
        <div style="padding:24px;">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#243041;">${escapeHtml(greeting)}</p>
          <p style="margin:0;font-size:16px;line-height:1.5;color:#243041;">
            A coach or administrator reset your password for ${escapeHtml(normalizedLeagueName)}.
          </p>
          <div style="margin-top:20px;padding:18px 20px;border:1px solid #d9e1e8;border-radius:14px;background:#f7f9fc;">
            <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5a6673;">Username</div>
            <div style="margin-top:6px;font-size:18px;line-height:1.3;font-weight:700;color:#243041;">${escapeHtml(normalizedUsername)}</div>
            <div style="margin-top:16px;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#5a6673;">Temporary Password</div>
            <div style="margin-top:6px;font-size:28px;line-height:1.1;font-weight:800;letter-spacing:0.08em;color:#243041;">${escapeHtml(normalizedPassword)}</div>
          </div>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:#5a6673;">
            You will be required to choose a new password after signing in.
          </p>
          <div style="margin-top:22px;">
            <a
              href="${escapeHtml(normalizedSignInUrl)}"
              style="display:inline-block;padding:12px 18px;border-radius:999px;background:#1e88e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;"
            >
              Sign In
            </a>
          </div>
          <p style="margin:18px 0 0;font-size:14px;line-height:1.5;color:#5a6673;">
            If you were not expecting this change, contact your coach or league administrator.
          </p>
        </div>
      </div>
    </div>
  `;

  return { subject, text, html };
}

export async function buildPasswordResetEmailPreview({
  request,
  email,
  username,
  tempPassword,
  fullName = null,
}: Omit<SendPasswordResetEmailOptions, "userId">): Promise<PasswordResetEmailPreview> {
  const leagueName = await resolveLeagueName();
  const preview = buildPasswordResetEmailContent({
    leagueName,
    email,
    username,
    tempPassword,
    signInUrl: `${resolveBaseUrl(request)}/auth/signin?username=${encodeURIComponent(username.trim())}`,
    fullName,
  });

  return {
    ...preview,
    sampleData: {
      leagueName,
      fullName: fullName?.trim() ?? "",
      email: email.trim(),
      username: username.trim(),
      temporaryPassword: tempPassword.trim(),
      signInUrl: `${resolveBaseUrl(request)}/auth/signin?username=${encodeURIComponent(username.trim())}`,
    },
  };
}

export function describePasswordResetEmailResult(result: PasswordResetEmailResult) {
  if (result.status === "sent") return "Password reset email sent.";
  if (result.status === "logged") return `Password reset email logged without sending${result.reason ? `: ${result.reason}` : "."}`;
  return `Password reset email skipped${result.reason ? `: ${result.reason}` : "."}`;
}

async function writePasswordResetEmailLog(input: {
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
      event: "password_reset",
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

export async function sendPasswordResetEmail({
  request,
  email,
  username,
  tempPassword,
  userId = null,
  fullName = null,
}: SendPasswordResetEmailOptions): Promise<PasswordResetEmailResult> {
  const emailDeliverySettings = await getEmailDeliverySettings();
  const shouldLogEmail = shouldWriteEmailLogs(emailDeliverySettings.mode);
  const preview = await buildPasswordResetEmailPreview({
    request,
    email,
    username,
    tempPassword,
    fullName,
  });
  const payload = {
    fullName: preview.sampleData.fullName,
    username: preview.sampleData.username,
    signInUrl: preview.sampleData.signInUrl,
  };
  const deliveryDecision = await shouldDeliverEmailTo(email);

  if (deliveryDecision.mode === "log") {
    await writePasswordResetEmailLog({
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
      reason: "App email delivery is set to log only.",
    };
  }

  if (!deliveryDecision.allowed) {
    if (shouldWriteEmailLog(emailDeliverySettings.mode, "SKIPPED")) {
      await writePasswordResetEmailLog({
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

  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Temp password for ${email} (${username}): ${tempPassword.trim()}`);
      if (shouldLogEmail) {
        await writePasswordResetEmailLog({
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
      return {
        status: "logged",
        reason: "SendGrid is not configured.",
      };
    }
    if (shouldWriteEmailLog(emailDeliverySettings.mode, "FAILED")) {
      await writePasswordResetEmailLog({
        status: "FAILED",
        recipient: email,
        subject: preview.subject,
        message: preview.text,
        userId,
        provider: "sendgrid",
        errorMessage: "SendGrid is not configured.",
        payload,
      });
    }
    throw new Error("PASSWORD_RESET_DELIVERY_FAILED");
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  try {
    const [response] = await sgMail.default.send({
      to: email,
      from,
      subject: preview.subject,
      text: preview.text,
      html: preview.html,
    });
    if (shouldWriteEmailLog(emailDeliverySettings.mode, "SENT")) {
      await writePasswordResetEmailLog({
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
    if (shouldWriteEmailLog(emailDeliverySettings.mode, "FAILED")) {
      await writePasswordResetEmailLog({
        status: "FAILED",
        recipient: email,
        subject: preview.subject,
        message: preview.text,
        userId,
        provider: "sendgrid",
        errorMessage: error instanceof Error ? error.message : "Unknown password reset delivery error.",
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
