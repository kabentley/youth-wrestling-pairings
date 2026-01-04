import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { z } from "zod";
import speakeasy from "speakeasy";

const BodySchema = z.object({ code: z.string().min(4) });

export async function POST(req: Request) {
  await requireSession();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = BodySchema.parse(await req.json());

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (!user.mfaTempSecret) {
    return NextResponse.json({ error: "No MFA setup in progress. Click Set up MFA first." }, { status: 400 });
  }

  const ok = speakeasy.totp.verify({
    secret: user.mfaTempSecret,
    encoding: "base32",
    token: body.code.replace(/\s+/g, ""),
    window: 1,
  });

  if (!ok) return NextResponse.json({ error: "Invalid code" }, { status: 400 });

  await db.user.update({
    where: { id: userId },
    data: {
      mfaEnabled: true,
      mfaSecret: user.mfaTempSecret,
      mfaTempSecret: null,
    },
  });

  return NextResponse.json({ ok: true });
}
