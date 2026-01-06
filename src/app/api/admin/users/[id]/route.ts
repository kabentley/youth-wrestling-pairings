import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const PatchSchema = z.object({
  role: z.enum(["ADMIN", "COACH", "PARENT"]).optional(),
  teamId: z.string().nullable().optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();
  const body = PatchSchema.parse(await req.json());
  const existing = await db.user.findUnique({
    where: { id },
    select: { role: true, teamId: true },
  });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: { role?: "ADMIN" | "COACH" | "PARENT"; teamId?: string | null; email?: string; phone?: string | null } = {};
  const finalRole = body.role ?? existing.role;
  const finalTeamId = body.teamId !== undefined ? body.teamId : existing.teamId;
  if (body.email) {
    data.email = body.email.trim().toLowerCase();
  }
  if (body.phone) {
    data.phone = body.phone.trim();
  }
  if (body.role) {
    data.role = body.role;
    if (body.role === "ADMIN") data.teamId = null;
  }
  if (body.teamId !== undefined) {
    if (finalRole === "ADMIN" && body.teamId) {
      return NextResponse.json({ error: "Admins cannot be assigned a team" }, { status: 400 });
    }
    data.teamId = body.teamId;
  }
  if ((finalRole === "COACH" || finalRole === "PARENT") && !finalTeamId) {
    return NextResponse.json({ error: `${finalRole === "COACH" ? "Coaches" : "Parents"} must be assigned a team` }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id },
    data,
    select: { id: true, username: true, email: true, phone: true, name: true, role: true, teamId: true },
  });
  return NextResponse.json(user);
}
