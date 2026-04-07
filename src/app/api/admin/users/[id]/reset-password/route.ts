import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { describePasswordResetEmailResult, sendPasswordResetEmail } from "@/lib/passwordResetEmail";
import { requireAdmin } from "@/lib/rbac";
import { getUserFullName } from "@/lib/userName";

const BodySchema = z.object({ password: z.string().min(5) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request body" },
      { status: 400 },
    );
  }
  const body = parsed.data;
  const target = await db.user.findUnique({
    where: { id },
    select: { id: true, username: true, firstName: true, lastName: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  const passwordHash = await bcrypt.hash(body.password, 10);

  await db.user.update({
    where: { id },
    data: {
      passwordHash,
      mustResetPassword: true,
      sessionVersion: { increment: 1 },
    },
  });

  let message = "Temporary password set.";
  const email = target.email.trim();
  if (!email) {
    message = "Temporary password set. User has no email address, so no password reset email was sent.";
  } else {
    try {
      const result = await sendPasswordResetEmail({
        request: req,
        email,
        username: target.username,
        tempPassword: body.password,
        userId: target.id,
        fullName: getUserFullName(target),
      });
      message = `Temporary password set. ${describePasswordResetEmailResult(result)}`;
    } catch (error) {
      console.error("Failed to deliver admin password reset email", error);
      message = "Temporary password set. Password reset email could not be sent.";
    }
  }

  return NextResponse.json({
    ok: true,
    reset: {
      id: target.id,
      username: target.username,
      name: getUserFullName(target),
    },
    message,
  });
}
