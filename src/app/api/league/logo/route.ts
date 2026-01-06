import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  await requireAdmin();
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }
  if (file.size > MAX_LOGO_BYTES) {
    return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const existing = await db.league.findFirst({ select: { id: true } });

  if (!existing) {
    await db.league.create({
      data: { logoData: bytes, logoType: file.type },
    });
  } else {
    await db.league.update({
      where: { id: existing.id },
      data: { logoData: bytes, logoType: file.type },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await requireAdmin();
  const existing = await db.league.findFirst({ select: { id: true } });
  if (!existing) return NextResponse.json({ ok: true });

  await db.league.update({
    where: { id: existing.id },
    data: { logoData: null, logoType: null },
  });

  return NextResponse.json({ ok: true });
}
