import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireAdmin();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  await db.team.update({
    where: { id: teamId },
    data: { logoData: bytes, logoType: file.type },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  await requireAdmin();
  const team = await db.team.findUnique({ where: { id: teamId }, select: { id: true } });
  if (!team) return NextResponse.json({ error: "Team not found" }, { status: 404 });

  await db.team.update({ where: { id: teamId }, data: { logoData: null, logoType: null } });
  return NextResponse.json({ ok: true });
}
