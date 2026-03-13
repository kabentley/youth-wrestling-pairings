import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export async function POST() {
  await requireAdmin();
  await db.$transaction(async (tx) => {
    const teams = await tx.team.findMany({
      select: { headCoachId: true },
    });
    const headCoachIds = Array.from(new Set(
      teams
        .map((team) => team.headCoachId)
        .filter((value): value is string => Boolean(value)),
    ));

    await tx.meet.deleteMany();
    await tx.wrestler.deleteMany();

    await tx.user.deleteMany({
      where: {
        NOT: {
          OR: [
            { role: "ADMIN" },
            { role: "COACH" },
            ...(headCoachIds.length > 0 ? [{ id: { in: headCoachIds } }] : []),
          ],
        },
      },
    });
  });
  return NextResponse.json({ ok: true });
}
