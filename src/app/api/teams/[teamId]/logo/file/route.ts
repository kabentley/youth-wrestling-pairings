import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const team = await db.team.findUnique({
    where: { id: params.teamId },
    select: { logoData: true, logoType: true },
  });
  if (!team?.logoData || !team.logoType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(team.logoData, {
    headers: {
      "Content-Type": team.logoType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
