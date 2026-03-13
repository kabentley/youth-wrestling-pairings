import sgMail from "@sendgrid/mail";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

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

  return NextResponse.json({ ok: true });
}
