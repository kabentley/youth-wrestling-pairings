import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";
import { z } from "zod";

const PatchSchema = z.object({
  role: z.enum(["ADMIN", "COACH", "VIEWER"]),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = PatchSchema.parse(await req.json());
  const user = await db.user.update({
    where: { id: params.id },
    data: { role: body.role },
    select: { id: true, username: true, name: true, role: true, mfaEnabled: true },
  });
  return NextResponse.json(user);
}
