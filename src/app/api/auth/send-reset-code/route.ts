import sgMail from "@sendgrid/mail";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { getEmailDeliverySettings, shouldDeliverEmailTo, shouldWriteEmailLogs } from "@/lib/emailDelivery";
import { buildPasswordResetEmailContent } from "@/lib/passwordResetEmail";

const RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_RESET_SENDS = 5;

const BodySchema = z.object({
  username: z.string().trim().min(6).max(32),
  email: z.string().trim().email(),
}).refine(v => Boolean(v.email), {
  message: "Provide email",
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function writePasswordResetEmailLog(input: {
  status: "SKIPPED" | "LOGGED" | "SENT" | "FAILED";
  recipient: string;
  subject: string;
  message: string;
  userId: string;
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  deliveredAt?: Date | null;
}) {
  const message = input.subject.trim() || input.message;
  await db.notificationLog.create({
    data: {
      event: "password_reset_code",
      channel: "email",
      status: input.status,
      recipient: input.recipient,
      subject: null,
      message,
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      errorMessage: input.errorMessage ?? null,
      userId: input.userId,
      deliveredAt: input.deliveredAt ?? null,
    },
  });
}

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  const username = body.username.trim().toLowerCase();
  const email = normalizeEmail(body.email);

  const user = await db.user.findUnique({ where: { username } });
  if (!user) return NextResponse.json({ ok: true });
  if (user.email.toLowerCase() !== email) return NextResponse.json({ ok: true });

  const windowStart = new Date(Date.now() - RESET_WINDOW_MS);
  const recentCount = await db.passwordResetCode.count({
    where: { userId: user.id, createdAt: { gt: windowStart } },
  });
  if (recentCount >= MAX_RESET_SENDS) {
    return NextResponse.json({ error: "Too many reset requests. Please wait." }, { status: 429 });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  const hash = Buffer.from(hashBuffer).toString("hex");
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await db.passwordResetCode.create({
    data: {
      userId: user.id,
      codeHash: hash,
      expiresAt,
      attempts: 0,
    },
  });

  const emailContent = buildPasswordResetEmailContent({ code, expiresInMinutes: 15 });
  const subject = emailContent.subject;
  const message = emailContent.text;
  const emailDeliverySettings = await getEmailDeliverySettings();
  const shouldLogEmail = shouldWriteEmailLogs(emailDeliverySettings.mode);

  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!key || !from) {
    if (shouldLogEmail) {
      await writePasswordResetEmailLog({
        status: "LOGGED",
        recipient: email,
        subject,
        message,
        userId: user.id,
        provider: "log",
        errorMessage: "SendGrid is not configured.",
        deliveredAt: new Date(),
      });
    }
    if (process.env.NODE_ENV !== "production") {
      console.log(`Password reset code for ${email}: ${code}`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Email delivery is not configured." }, { status: 500 });
  }
  const deliveryDecision = await shouldDeliverEmailTo(email);
  if (deliveryDecision.mode === "log") {
    await writePasswordResetEmailLog({
      status: "LOGGED",
      recipient: email,
      subject,
      message,
      userId: user.id,
      provider: "log",
      deliveredAt: new Date(),
    });
    return NextResponse.json({ ok: true, logged: true });
  }
  if (!deliveryDecision.allowed) {
    if (shouldLogEmail) {
      await writePasswordResetEmailLog({
        status: "SKIPPED",
        recipient: email,
        subject,
        message,
        userId: user.id,
        provider: deliveryDecision.mode === "off" ? "disabled" : "sendgrid",
        errorMessage: deliveryDecision.reason ?? "Recipient email is not allowed by the current delivery settings.",
      });
    }
    return NextResponse.json({ ok: true, skipped: true });
  }
  sgMail.setApiKey(key);
  try {
    const [response] = await sgMail.send({
      to: email,
      from,
      subject,
      text: message,
      html: emailContent.html,
    });
    if (shouldLogEmail) {
      await writePasswordResetEmailLog({
        status: "SENT",
        recipient: email,
        subject,
        message,
        userId: user.id,
        provider: "sendgrid",
        providerMessageId: response.headers["x-message-id"] ?? null,
        deliveredAt: new Date(),
      });
    }
  } catch (error) {
    if (shouldLogEmail) {
      await writePasswordResetEmailLog({
        status: "FAILED",
        recipient: email,
        subject,
        message,
        userId: user.id,
        provider: "sendgrid",
        errorMessage: error instanceof Error ? error.message : "Unknown password reset delivery error.",
      });
    }
    throw error;
  }

  return NextResponse.json({ ok: true });
}
