import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { requireSession } from "@/lib/rbac";
import { getUserFullName } from "@/lib/userName";

export async function GET() {
  const { userId } = await requireSession();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      username: true,
      firstName: true,
      lastName: true,
      role: true,
      team: { select: { name: true, symbol: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({
    username: user.username,
    firstName: user.firstName ?? null,
    lastName: user.lastName ?? null,
    name: getUserFullName(user),
    role: user.role,
    team: user.team ? `${user.team.name} (${user.team.symbol})`.trim() : null,
  });
}
