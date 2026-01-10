import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export async function GET() {
  const teams = await db.team.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, symbol: true },
  });
  return NextResponse.json(teams);
}
