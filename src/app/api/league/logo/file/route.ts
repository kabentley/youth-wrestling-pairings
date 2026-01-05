import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const league = await db.league.findFirst({
    select: { logoData: true, logoType: true },
  });
  if (!league?.logoData || !league.logoType) {
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(league.logoData, {
    headers: {
      "Content-Type": league.logoType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
