import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";

const PatchSchema = z.object({
  role: z.enum(["ADMIN", "COACH", "PARENT"]).optional(),
  teamId: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = PatchSchema.parse(await req.json());
  const existing = await db.user.findUnique({
    where: { id: params.id },
    select: { role: true, teamId: true },
  });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: { role?: "ADMIN" | "COACH" | "PARENT"; teamId?: string | null } = {};
  const finalRole = body.role ?? existing.role;
  const finalTeamId = body.teamId !== undefined ? body.teamId : existing.teamId;
  if (body.role) {
    data.role = body.role;
    if (body.role !== "COACH") data.teamId = null;
  }
  if (body.teamId !== undefined) {
    if (finalRole !== "COACH" && body.teamId) {
      return NextResponse.json({ error: "Only coaches can be assigned a team" }, { status: 400 });
    }
    data.teamId = body.teamId;
  }
  if (finalRole === "COACH" && !finalTeamId) {
    return NextResponse.json({ error: "Coaches must be assigned a team" }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id: params.id },
    data,
    select: { id: true, username: true, name: true, role: true, teamId: true, mfaEnabled: true },
  });
  return NextResponse.json(user);
}
