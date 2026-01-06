import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const BodySchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(req: Request) {
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase();

  const user = await db.user.findFirst({ where: { email } });
  if (!user) return NextResponse.json({ ok: true });
  if (user.emailVerified) return NextResponse.json({ ok: true });

  const origin = req.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24);

  await db.verificationToken.deleteMany({ where: { identifier: email } });
  await db.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  const link = `${origin}/auth/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  const key = process.env.SENDGRID_API_KEY;
  const from = process.env.SENDGRID_FROM;
  if (!key || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.log(`Verify email link for ${email}: ${link}`);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Email delivery is not configured." }, { status: 500 });
  }

  const sgMail = await import("@sendgrid/mail");
  sgMail.default.setApiKey(key);
  await sgMail.default.send({
    to: email,
    from,
    subject: "Verify your email",
    text: `Verify your email address by visiting: ${link}`,
  });

  return NextResponse.json({ ok: true });
}
