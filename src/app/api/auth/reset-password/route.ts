import { createHash } from "crypto";

import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";

const MAX_RESET_ATTEMPTS = 5;

const BodySchema = z.object({
  username: z.string().trim().min(6).max(32),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional(),
  code: z.string().trim().min(4).max(20),
  password: z.string().min(8).max(100).regex(/[^A-Za-z0-9]/, "Password must include a symbol."),
}).refine(v => Boolean(v.email || v.phone), {
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
  const code = body.code.trim();

  const user = await db.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "Invalid reset code." }, { status: 400 });
  }
  if (email && user.email.toLowerCase() !== email) {
    return NextResponse.json({ error: "Invalid reset code." }, { status: 400 });
  }
  if (phone && user.phone !== phone) {
    return NextResponse.json({ error: "Invalid reset code." }, { status: 400 });
  }

  const latest = await db.passwordResetCode.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!latest) {
    return NextResponse.json({ error: "Invalid or expired reset code." }, { status: 400 });
  }
  if (latest.attempts >= MAX_RESET_ATTEMPTS) {
    return NextResponse.json({ error: "Reset code locked. Request a new code." }, { status: 400 });
  }

  const hash = createHash("sha256").update(code).digest("hex");
  if (hash !== latest.codeHash) {
    await db.passwordResetCode.update({
      where: { id: latest.id },
      data: { attempts: { increment: 1 } },
    });
    return NextResponse.json({ error: "Invalid or expired reset code." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  await db.user.update({
    where: { id: user.id },
    data: { passwordHash, mustResetPassword: false, sessionVersion: { increment: 1 } },
  });

  await db.passwordResetCode.update({
    where: { id: latest.id },
    data: { usedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
