import { getServerSession } from "next-auth/next";

import HelpClient from "./HelpClient";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { HELP_PAGES, type HelpPage as HelpPageEntry } from "@/lib/helpContent";

async function getVisibleHelpPages(): Promise<HelpPageEntry[]> {
  const session = await getServerSession(authOptions);
  const user = session?.user;
  const role = user?.role ?? "PARENT";

  if (role === "ADMIN") {
    return HELP_PAGES;
  }

  if (role === "COACH") {
    let isHeadCoach = false;
    if (user?.id) {
      const coach = await db.user.findUnique({
        where: { id: user.id },
        select: {
          headCoachTeam: { select: { id: true } },
        },
      });
      isHeadCoach = Boolean(coach?.headCoachTeam);
    }

    return HELP_PAGES.filter((page) =>
      page.audience === "coaches" || (isHeadCoach && page.audience === "meet-coordinators"),
    );
  }

  return HELP_PAGES.filter((page) => page.audience === "parents");
}

export default async function HelpPage() {
  const pages = await getVisibleHelpPages();
  return <HelpClient pages={pages} />;
}
