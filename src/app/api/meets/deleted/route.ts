import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireRole } from "@/lib/rbac";

export async function GET() {
  const { user } = await requireRole("COACH");
  const where =
    user.role === "ADMIN"
      ? { deletedAt: { not: null } }
      : user.teamId
        ? {
            deletedAt: { not: null },
            meetTeams: { some: { teamId: user.teamId } },
          }
        : { id: "__none__" };

  const meets = await db.meet.findMany({
    where,
    orderBy: { deletedAt: "desc" },
    include: {
      meetTeams: { include: { team: true } },
      deletedBy: { select: { username: true } },
    },
  });

  return NextResponse.json(meets);
}
