import { describe, expect, it } from "vitest";

describe("resolveNotificationTransport", () => {
  it("maps off to off", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(resolveNotificationTransport("off")).toBe("off");
  });

  it("maps log to log", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(resolveNotificationTransport("log")).toBe("log");
  });

  it("maps whitelist to live so allowed recipients are sent", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(resolveNotificationTransport("whitelist")).toBe("live");
  });

  it("maps everyone to live", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(resolveNotificationTransport("all")).toBe("live");
  });
});

describe("buildMeetReadyForAttendanceContent", () => {
  it("builds email content with deadline and links", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetReadyForAttendanceContent } = await import("./notifications");
    const { parseMeetLocalDateTime } = await import("./meetDateTime");
    const content = buildMeetReadyForAttendanceContent({
      meetName: "Tigers-Wolves Jan 12",
      meetDate: new Date("2026-01-12T00:00:00.000Z"),
      location: "North Gym",
      attendanceDeadline: new Date("2026-01-10T22:00:00.000Z"),
      checkinStartAt: parseMeetLocalDateTime("2026-01-12T07:45"),
      checkinDurationMinutes: 30,
      teamLabels: ["Tigers", "Wolves"],
      attendanceUrl: "http://localhost:3000/parent/attendance",
      recipientName: "Pat Parent",
      childNames: ["Ava Smith", "Ben Smith"],
      headCoachName: "Coach Casey",
      headCoachEmail: "coach@example.com",
    });

    expect(content.emailSubject).toContain("Please respond with attendance");
    expect(content.emailText).toContain("Hello Pat Parent");
    expect(content.emailText).toContain("Please indicate whether your wrestlers Ava Smith and Ben Smith will attend the upcoming meet.");
    expect(content.emailText).toContain("Hello Pat Parent,\n\nPlease indicate whether your wrestlers Ava Smith and Ben Smith will attend the upcoming meet.\n\nMeet date:");
    expect(content.emailText).toContain("North Gym");
    expect(content.emailText).toContain("http://localhost:3000/parent/attendance");
    expect(content.emailText).toContain("Attendance deadline:");
    expect(content.emailText).toContain("Check-in time:");
    expect(content.emailText).toContain("PM\n\nReply here: http://localhost:3000/parent/attendance\n\nIf you have questions, please contact your coach: Coach Casey <coach@example.com>.");
    expect(content.emailText).not.toContain("My Wrestlers:");
    expect(content.emailText).toContain("Coach Casey <coach@example.com>");
    expect(content.emailHtml).toContain("Attendance Request");
    expect(content.emailHtml).toContain("Reply to Attendance");
    expect(content.emailHtml).not.toContain("My Wrestlers");
    expect(content.emailHtml).toContain("<strong>Ava Smith and Ben Smith</strong>");
    expect(content.emailHtml).toContain("<strong>Date:</strong> Monday, January 12, 2026");
    expect(content.emailHtml).toContain("<strong>Location:</strong> North Gym");
    expect(content.emailHtml).toContain("<strong>Check-in time:</strong>");
    expect(content.emailHtml).toContain("Attendance Deadline");
    expect(content.emailHtml).toContain("http://localhost:3000/parent/attendance");
  });

  it("falls back when no linked wrestlers are listed", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetReadyForAttendanceContent } = await import("./notifications");
    const content = buildMeetReadyForAttendanceContent({
      meetName: "Quad Meet",
      meetDate: new Date("2026-02-01T00:00:00.000Z"),
      location: null,
      attendanceDeadline: null,
      teamLabels: [],
      attendanceUrl: "http://localhost:3000/parent/attendance",
      recipientName: "Parent",
      childNames: [],
      headCoachName: "",
      headCoachEmail: "",
    });

    expect(content.emailText).toContain("Please indicate whether your wrestlers will attend the upcoming meet.");
    expect(content.emailText).toContain("No deadline has been set.");
  });

  it("uses singular wording when exactly one wrestler is linked", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetReadyForAttendanceContent } = await import("./notifications");
    const content = buildMeetReadyForAttendanceContent({
      meetName: "Dual Meet",
      meetDate: new Date("2026-02-01T00:00:00.000Z"),
      location: "North Gym",
      attendanceDeadline: new Date("2026-01-30T22:00:00.000Z"),
      teamLabels: ["Tigers"],
      attendanceUrl: "http://localhost:3000/parent/attendance",
      recipientName: "Parent",
      childNames: ["Ava Smith"],
      headCoachName: "Coach Casey",
      headCoachEmail: "coach@example.com",
    });

    expect(content.emailText).toContain("Please indicate whether your wrestler Ava Smith will attend the upcoming meet.");
  });
});

describe("buildPreferredMessages", () => {
  it("uses email when both phone and email are present", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildPreferredMessages } = await import("./notifications");
    const messages = buildPreferredMessages(
      {
        userId: "user_1",
        email: "parent@example.com",
      },
      {
        meetId: "meet_1",
        emailSubject: "Email subject",
        emailText: "Email body",
        extraPayload: {},
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.channel).toBe("email");
    expect(messages[0]?.recipient).toBe("parent@example.com");
  });

  it("returns no message when no email is present", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildPreferredMessages } = await import("./notifications");
    const messages = buildPreferredMessages(
      {
        userId: "user_1",
        email: null,
      },
      {
        meetId: "meet_1",
        emailSubject: "Email subject",
        emailText: "Email body",
        extraPayload: {},
      },
    );

    expect(messages).toHaveLength(0);
  });
});

describe("buildMeetPublishedContent", () => {
  it("builds text and html content with grouped published bouts", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetPublishedContent } = await import("./notifications");
    const content = buildMeetPublishedContent({
      meetName: "WC-CON Mar 21, 2026",
      meetDate: new Date("2026-03-21T00:00:00.000Z"),
      location: "1001 East Lincoln Highway, Exton, PA 19341",
      todayUrl: "http://localhost:3000/parent/today",
      recipientName: "Pat Parent",
      children: [
        {
          childId: "child_1",
          fullName: "Alden Bentley",
          teamLabel: "WC",
          matches: [
            {
              boutId: "bout_1",
              boutNumber: "105",
              opponentName: "Wyatt Nadler",
              opponentTeam: "PB",
            },
          ],
        },
        {
          childId: "child_2",
          fullName: "Brendan Bradley",
          teamLabel: "WC",
          matches: [],
        },
      ],
    });

    expect(content.emailSubject).toBe("Meet is ready to start: WC-CON Mar 21, 2026");
    expect(content.emailText).toContain("Hello Pat Parent,");
    expect(content.emailText).toContain("Today's bouts:");
    expect(content.emailText).toContain("Bout 105: Wyatt Nadler (PB)");
    expect(content.emailText).toContain("Brendan Bradley (WC)");
    expect(content.emailText).toContain("No bout assigned yet.");
    expect(content.emailText).toContain("http://localhost:3000/parent/today");
    expect(content.emailHtml).toContain("Open Today Page");
    expect(content.emailHtml).toContain("Today's bouts:");
    expect(content.emailHtml).toContain("Alden Bentley");
    expect(content.emailHtml).toContain("Wyatt Nadler");
    expect(content.emailHtml).toContain("No bout assigned yet.");
  });
});

describe("dedupeMeetRecipients", () => {
  it("merges duplicate parent recipients into one delivery target", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { dedupeMeetRecipients } = await import("./notifications");
    const recipients = dedupeMeetRecipients([
      {
        userId: "parent_1",
        teamId: "team_1",
        teamLabel: "Tigers",
        displayName: "Pat Parent",
        email: "parent@example.com",
        childNames: ["Ben Smith"],
        headCoachName: "Coach Casey",
        headCoachEmail: "coach@example.com",
      },
      {
        userId: "parent_1",
        teamId: "team_1",
        teamLabel: "Tigers",
        displayName: "Pat Parent",
        email: "parent@example.com",
        childNames: ["Ava Smith", "Ben Smith"],
        headCoachName: "Coach Casey",
        headCoachEmail: "coach@example.com",
      },
    ]);

    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.childNames).toEqual(["Ava Smith", "Ben Smith"]);
    expect(recipients[0]?.headCoachName).toBe("Coach Casey");
  });
});
