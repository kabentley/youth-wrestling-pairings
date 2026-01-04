import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

export async function POST(req: Request) {
  await requireSession();
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;

  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (user.mfaEnabled) return NextResponse.json({ error: "MFA already enabled" }, { status: 400 });

  const secret = speakeasy.generateSecret({
    name: `Wrestling Scheduler (${user.email ?? "user"})`,
    length: 20,
  });

  // Store temp secret until verified
  await db.user.update({
    where: { id: userId },
    data: { mfaTempSecret: secret.base32 },
  });

  const otpauthUrl = secret.otpauth_url!;
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

  return NextResponse.json({ qrDataUrl });
}
