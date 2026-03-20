import { NextResponse } from "next/server";
import { z } from "zod";

import { db } from "@/lib/db";
import { buildMeetPublishedContent, buildMeetReadyForAttendanceContent } from "@/lib/notifications";
import { buildPasswordResetEmailContent } from "@/lib/passwordResetEmail";
import { requireAdmin } from "@/lib/rbac";
import { buildWelcomeEmailPreview } from "@/lib/welcomeEmail";

const PreviewEventSchema = z.enum([
  "welcome_email",
  "meet_ready_for_attendance",
  "meet_published",
  "password_reset_code",
]);

const BodySchema = z.object({
  event: PreviewEventSchema,
  teamId: z.string().trim().optional().default(""),
  meetId: z.string().trim().optional().default(""),
});

function resolveBaseUrl(request: Request) {
  try {
    return new URL(request.url).origin;
  } catch {
    return request.headers.get("origin") ?? process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  }
}

function buildTeamLabel(team: { symbol?: string | null; name?: string | null }) {
  return (team.symbol ?? team.name ?? "Team").trim() || "Team";
}

function formatMeetDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatMeetOptionLabel(meet: { name: string; date: Date; status: string }) {
  return `${meet.name} (${formatMeetDate(meet.date)}) - ${meet.status}`;
}

function formatBoutNumber(mat?: number | null, order?: number | null) {
  if (!mat || !order) return "TBD";
  return `${mat}${String(Math.max(0, order - 1)).padStart(2, "0")}`;
}

function pickPreferredMeet<T extends { status: string }>(
  meets: T[],
  preferredStatuses: string[],
) {
  for (const status of preferredStatuses) {
    const match = meets.find((meet) => meet.status === status);
    if (match) return match;
  }
  return meets[0] ?? null;
}

function buildSampleData(entries: Array<[string, string | null | undefined]>) {
  return entries
    .map(([label, value]) => ({ label, value: value?.trim() ?? "" }))
    .filter((entry) => entry.value.length > 0);
}

async function buildWelcomePreview(request: Request, teamId: string) {
  const selectedTeam = teamId
    ? await db.team.findUnique({
        where: { id: teamId },
        select: { id: true, name: true, symbol: true },
      })
    : await db.team.findFirst({
        select: { id: true, name: true, symbol: true },
        orderBy: [{ symbol: "asc" }, { name: "asc" }],
      });

  const previewWrestlers = selectedTeam
    ? await db.wrestler.findMany({
        where: { teamId: selectedTeam.id, active: true },
        select: { first: true, last: true },
        orderBy: [{ last: "asc" }, { first: "asc" }],
        take: 3,
      })
    : [];

  const preview = await buildWelcomeEmailPreview({
    request,
    email: "newuser@example.com",
    username: "newuser1",
    fullName: "Sample Parent",
    tempPassword: "TempPass123!",
    teamId: selectedTeam?.id ?? null,
    teamName: selectedTeam?.name ?? null,
    teamLabel: selectedTeam ? `${selectedTeam.name} (${selectedTeam.symbol})` : null,
    linkedWrestlerNames: previewWrestlers.map((wrestler) => `${wrestler.first} ${wrestler.last}`.trim()),
    mustResetPassword: true,
  });

  return {
    event: "welcome_email" as const,
    title: "Welcome Email",
    subject: preview.subject,
    text: preview.text,
    html: preview.html,
    selectedTeamId: selectedTeam?.id ?? "",
    selectedMeetId: "",
    sampleData: buildSampleData([
      ["League", preview.sampleData.leagueName],
      ["Full name", preview.sampleData.fullName],
      ["Email", preview.sampleData.email],
      ["Username", preview.sampleData.username],
      ["Temporary password", preview.sampleData.temporaryPassword],
      ["Team", preview.sampleData.teamLabel || "No team selected"],
      ["Coach", preview.sampleData.coachName && preview.sampleData.coachEmail
        ? `${preview.sampleData.coachName} <${preview.sampleData.coachEmail}>`
        : preview.sampleData.coachName || preview.sampleData.coachEmail || "Not assigned"],
      ["Linked wrestlers", preview.sampleData.linkedWrestlerNames.length > 0
        ? preview.sampleData.linkedWrestlerNames.join(", ")
        : "None"],
      ["Sign-in URL", preview.sampleData.signInUrl],
    ]),
  };
}

async function resolvePreviewMeet(meetId: string, preferredStatuses: string[]) {
  if (meetId) {
    return db.meet.findUnique({
      where: { id: meetId },
      select: {
        id: true,
        name: true,
        date: true,
        location: true,
        attendanceDeadline: true,
        status: true,
        deletedAt: true,
        meetTeams: {
          select: {
            team: {
              select: {
                id: true,
                name: true,
                symbol: true,
                headCoach: {
                  select: {
                    name: true,
                    username: true,
                    email: true,
                  },
                },
                wrestlers: {
                  where: { active: true },
                  select: {
                    id: true,
                    first: true,
                    last: true,
                  },
                  orderBy: [{ last: "asc" }, { first: "asc" }],
                  take: 3,
                },
              },
            },
          },
        },
        bouts: {
          select: {
            id: true,
            redId: true,
            greenId: true,
            mat: true,
            order: true,
          },
          orderBy: [{ mat: "asc" }, { order: "asc" }, { createdAt: "asc" }],
          take: 30,
        },
      },
    });
  }

  const meets = await db.meet.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      date: true,
      location: true,
      attendanceDeadline: true,
      status: true,
      deletedAt: true,
      meetTeams: {
        select: {
          team: {
            select: {
              id: true,
              name: true,
              symbol: true,
              headCoach: {
                select: {
                  name: true,
                  username: true,
                  email: true,
                },
              },
              wrestlers: {
                where: { active: true },
                select: {
                  id: true,
                  first: true,
                  last: true,
                },
                orderBy: [{ last: "asc" }, { first: "asc" }],
                take: 3,
              },
            },
          },
        },
      },
      bouts: {
        select: {
          id: true,
          redId: true,
          greenId: true,
          mat: true,
          order: true,
        },
        orderBy: [{ mat: "asc" }, { order: "asc" }, { createdAt: "asc" }],
        take: 30,
      },
    },
    orderBy: [{ date: "desc" }, { name: "asc" }],
    take: 200,
  });
  return pickPreferredMeet(meets, preferredStatuses);
}

async function buildMeetReadyPreview(request: Request, meetId: string) {
  const baseUrl = resolveBaseUrl(request);
  const meet = await resolvePreviewMeet(meetId, ["ATTENDANCE", "READY_FOR_CHECKIN", "PUBLISHED", "DRAFT"]);

  if (!meet || meet.deletedAt) {
    const content = buildMeetReadyForAttendanceContent({
      meetName: "Sample Meet",
      meetDate: new Date("2026-03-21T00:00:00.000Z"),
      location: "1001 East Lincoln Highway, Exton, PA 19341",
      attendanceDeadline: new Date("2026-03-18T22:00:00.000Z"),
      teamLabels: ["WC", "BYC", "DOW"],
      attendanceUrl: `${baseUrl}/parent/attendance`,
      myWrestlersUrl: `${baseUrl}/parent`,
      recipientName: "Sample Parent",
      childNames: ["Alden Bentley", "Brendan Bradley"],
      headCoachName: "Sample Coach",
      headCoachEmail: "coach@example.com",
    });
    return {
      event: "meet_ready_for_attendance" as const,
      title: "Ready for Attendance Email",
      subject: content.emailSubject,
      text: content.emailText,
      html: content.emailHtml,
      selectedTeamId: "",
      selectedMeetId: "",
      sampleData: buildSampleData([
        ["Meet", "Sample Meet"],
        ["Teams", "WC, BYC, DOW"],
        ["Recipient", "Sample Parent"],
        ["Linked wrestlers", "Alden Bentley, Brendan Bradley"],
      ]),
    };
  }

  const teamLabels = meet.meetTeams.map((entry) => buildTeamLabel(entry.team));
  const allChildNames = meet.meetTeams.flatMap((entry) =>
    entry.team.wrestlers.map((wrestler) => `${wrestler.first} ${wrestler.last}`.trim())
  );
  const previewChildren = allChildNames.slice(0, 3);
  const coachTeam = meet.meetTeams.find((entry) => entry.team.headCoach) ?? meet.meetTeams[0];
  const headCoach = coachTeam.team.headCoach;
  const headCoachName = headCoach
    ? (headCoach.name?.trim() ?? headCoach.username.trim())
    : "";
  const headCoachEmail = headCoach ? headCoach.email.trim() : "";
  const content = buildMeetReadyForAttendanceContent({
    meetName: meet.name,
    meetDate: meet.date,
    location: meet.location ?? null,
    attendanceDeadline: meet.attendanceDeadline ?? null,
    teamLabels,
    attendanceUrl: `${baseUrl}/parent/attendance`,
    myWrestlersUrl: `${baseUrl}/parent`,
    recipientName: "Sample Parent",
    childNames: previewChildren.length > 0 ? previewChildren : ["Sample Wrestler"],
    headCoachName,
    headCoachEmail,
  });

  return {
    event: "meet_ready_for_attendance" as const,
    title: "Ready for Attendance Email",
    subject: content.emailSubject,
    text: content.emailText,
    html: content.emailHtml,
    selectedTeamId: "",
    selectedMeetId: meet.id,
    sampleData: buildSampleData([
      ["Meet", `${meet.name} (${formatMeetDate(meet.date)})`],
      ["Status", meet.status],
      ["Teams", teamLabels.join(", ")],
      ["Recipient", "Sample Parent"],
      ["Linked wrestlers", previewChildren.length > 0 ? previewChildren.join(", ") : "Sample Wrestler"],
      ["Attendance deadline", meet.attendanceDeadline ? meet.attendanceDeadline.toLocaleString() : "Not set"],
    ]),
  };
}

async function buildMeetPublishedPreview(request: Request, meetId: string) {
  const baseUrl = resolveBaseUrl(request);
  const meet = await resolvePreviewMeet(meetId, ["PUBLISHED", "READY_FOR_CHECKIN", "ATTENDANCE", "DRAFT"]);

  if (!meet || meet.deletedAt) {
    const content = buildMeetPublishedContent({
      meetName: "Sample Meet",
      meetDate: new Date("2026-03-21T00:00:00.000Z"),
      location: "1001 East Lincoln Highway, Exton, PA 19341",
      todayUrl: `${baseUrl}/parent/today`,
      recipientName: "Sample Parent",
      children: [
        {
          childId: "child-1",
          fullName: "Sample Wrestler",
          teamLabel: "WC",
          matches: [
            { boutId: "bout-1", boutNumber: "101", opponentName: "Wyatt Stillwell", opponentTeam: "PB", opponentTeamColor: "#5a463f" },
          ],
        },
      ],
    });
    return {
      event: "meet_published" as const,
      title: "Published Bouts Email",
      subject: content.emailSubject,
      text: content.emailText,
      html: content.emailHtml,
      selectedTeamId: "",
      selectedMeetId: "",
      sampleData: buildSampleData([
        ["Meet", "Sample Meet"],
        ["Recipient", "Sample Parent"],
        ["Linked wrestlers", "Sample Wrestler"],
      ]),
    };
  }

  const wrestlerIds = Array.from(new Set(
    meet.bouts.flatMap((bout) => [bout.redId, bout.greenId]),
  ));
  const wrestlers = wrestlerIds.length > 0
    ? await db.wrestler.findMany({
        where: { id: { in: wrestlerIds } },
        select: {
          id: true,
          first: true,
          last: true,
          team: {
            select: {
              name: true,
              symbol: true,
              color: true,
            },
          },
        },
      })
    : [];
  const wrestlerMap = new Map(wrestlers.map((wrestler) => [wrestler.id, wrestler]));
  const childrenById = new Map<string, {
    childId: string;
    fullName: string;
    teamLabel: string;
    matches: Array<{ boutId: string; boutNumber: string; opponentName: string; opponentTeam: string; opponentTeamColor?: string | null }>;
  }>();

  for (const bout of meet.bouts) {
    const red = wrestlerMap.get(bout.redId);
    const green = wrestlerMap.get(bout.greenId);
    if (!red || !green) continue;

    const ensureChild = (wrestlerId: string) => {
      const wrestler = wrestlerMap.get(wrestlerId);
      if (!wrestler) return null;
      const existing = childrenById.get(wrestlerId);
      if (existing) return existing;
      const nextChild = {
        childId: wrestler.id,
        fullName: `${wrestler.first} ${wrestler.last}`.trim(),
        teamLabel: buildTeamLabel(wrestler.team),
        matches: [] as Array<{ boutId: string; boutNumber: string; opponentName: string; opponentTeam: string; opponentTeamColor?: string | null }>,
      };
      childrenById.set(wrestlerId, nextChild);
      return nextChild;
    };

    const redChild = ensureChild(red.id);
    const greenChild = ensureChild(green.id);
    if (redChild) {
      redChild.matches.push({
        boutId: bout.id,
        boutNumber: formatBoutNumber(bout.mat, bout.order),
        opponentName: `${green.first} ${green.last}`.trim(),
        opponentTeam: buildTeamLabel(green.team),
        opponentTeamColor: green.team.color,
      });
    }
    if (greenChild) {
      greenChild.matches.push({
        boutId: bout.id,
        boutNumber: formatBoutNumber(bout.mat, bout.order),
        opponentName: `${red.first} ${red.last}`.trim(),
        opponentTeam: buildTeamLabel(red.team),
        opponentTeamColor: red.team.color,
      });
    }
  }

  if (childrenById.size === 0) {
    let addedChildren = 0;
    for (const entry of meet.meetTeams) {
      for (const wrestler of entry.team.wrestlers) {
        const wrestlerLabel = `${wrestler.first} ${wrestler.last}`.trim();
        childrenById.set(wrestler.id, {
          childId: wrestler.id,
          fullName: wrestlerLabel,
          teamLabel: buildTeamLabel(entry.team),
          matches: [],
        });
        addedChildren += 1;
        if (addedChildren >= 3) break;
      }
      if (addedChildren >= 3) break;
    }
  }

  const children = Array.from(childrenById.values())
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .slice(0, 3);
  const content = buildMeetPublishedContent({
    meetName: meet.name,
    meetDate: meet.date,
    location: meet.location ?? null,
    todayUrl: `${baseUrl}/parent/today`,
    recipientName: "Sample Parent",
    children: children.length > 0
      ? children
      : [{
          childId: "sample-child",
          fullName: "Sample Wrestler",
          teamLabel: "Team",
          matches: [],
        }],
  });

  return {
    event: "meet_published" as const,
    title: "Published Bouts Email",
    subject: content.emailSubject,
    text: content.emailText,
    html: content.emailHtml,
    selectedTeamId: "",
    selectedMeetId: meet.id,
    sampleData: buildSampleData([
      ["Meet", `${meet.name} (${formatMeetDate(meet.date)})`],
      ["Status", meet.status],
      ["Recipient", "Sample Parent"],
      ["Linked wrestlers", children.length > 0 ? children.map((child) => child.fullName).join(", ") : "Sample Wrestler"],
      ["Today page", `${baseUrl}/parent/today`],
    ]),
  };
}

function buildPasswordResetPreview() {
  const content = buildPasswordResetEmailContent({
    code: "483921",
    expiresInMinutes: 15,
  });

  return {
    event: "password_reset_code" as const,
    title: "Password Reset Code Email",
    subject: content.subject,
    text: content.text,
    html: content.html,
    selectedTeamId: "",
    selectedMeetId: "",
    sampleData: buildSampleData([
      ["Recipient", "newuser@example.com"],
      ["Reset code", "483921"],
      ["Expires in", "15 minutes"],
    ]),
  };
}

export async function GET() {
  await requireAdmin();

  const [teams, meets] = await Promise.all([
    db.team.findMany({
      select: {
        id: true,
        name: true,
        symbol: true,
      },
      orderBy: [{ symbol: "asc" }, { name: "asc" }],
      take: 200,
    }),
    db.meet.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        date: true,
        status: true,
      },
      orderBy: [{ date: "desc" }, { name: "asc" }],
      take: 200,
    }),
  ]);

  return NextResponse.json({
    teams: teams.map((team) => ({
      id: team.id,
      label: `${team.name} (${team.symbol})`,
    })),
    meets: meets.map((meet) => ({
      id: meet.id,
      label: formatMeetOptionLabel(meet),
      status: meet.status,
    })),
  });
}

export async function POST(req: Request) {
  await requireAdmin();

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preview payload." }, { status: 400 });
  }

  const { event, meetId, teamId } = parsed.data;

  const preview = event === "welcome_email"
    ? await buildWelcomePreview(req, teamId)
    : event === "meet_ready_for_attendance"
      ? await buildMeetReadyPreview(req, meetId)
      : event === "meet_published"
        ? await buildMeetPublishedPreview(req, meetId)
        : buildPasswordResetPreview();

  return NextResponse.json(preview);
}
