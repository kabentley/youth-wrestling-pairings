import sgMail from "@sendgrid/mail";
import { NextResponse } from "next/server";
import twilio from "twilio";
import { z } from "zod";

import { db } from "@/lib/db";

const RESET_WINDOW_MS = 15 * 60 * 1000;
const MAX_RESET_SENDS = 5;

const BodySchema = z.object({
  username: z.string().trim().min(6).max(32),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  method: z.enum(["email", "sms"]).optional(),
}).refine(v => Boolean(v.email ?? v.phone), {
  message: "Provide email or phone",
});

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}
function normalizePhone(phone: string) {
  return phone.trim();
}

export async function POST(req: Request) {
  const body = BodySchema.parse(await req.json());
  const username = body.username.trim().toLowerCase();
  const email = body.email ? normalizeEmail(body.email) : null;
  const phone = body.phone ? normalizePhone(body.phone) : null;

  const user = await db.user.findUnique({ where: { username } });
  if (!user) return NextResponse.json({ ok: true });
  if (email && user.email.toLowerCase() !== email) return NextResponse.json({ ok: true });
  if (phone && user.phone !== phone) return NextResponse.json({ ok: true });

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

  const channel = body.method ?? (phone ? "sms" : "email");
  if (channel === "sms" && phone) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM;
    if (!sid || !token || !from) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Password reset code for ${phone}: ${code}`);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "SMS delivery is not configured." }, { status: 500 });
    }
    const client = twilio(sid, token);
    await client.messages.create({
      to: phone,
      from,
      body: `Your password reset code is ${code}. It expires in 15 minutes.`,
    });
  } else if (email) {
    const key = process.env.SENDGRID_API_KEY;
    const from = process.env.SENDGRID_FROM;
    if (!key || !from) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Password reset code for ${email}: ${code}`);
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ error: "Email delivery is not configured." }, { status: 500 });
    }
    sgMail.setApiKey(key);
    await sgMail.send({
      to: email,
      from,
      subject: "Your password reset code",
      text: `Your password reset code is ${code}. It expires in 15 minutes.`,
    });
  }

  return NextResponse.json({ ok: true });
}
