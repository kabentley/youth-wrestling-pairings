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
    const content = buildMeetReadyForAttendanceContent({
      meetName: "Tigers-Wolves Jan 12",
      meetDate: new Date("2026-01-12T00:00:00.000Z"),
      location: "North Gym",
      attendanceDeadline: new Date("2026-01-10T22:00:00.000Z"),
      teamLabels: ["Tigers", "Wolves"],
      attendanceUrl: "http://localhost:3000/parent/attendance",
      myWrestlersUrl: "http://localhost:3000/parent",
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
    expect(content.emailText).toContain("PM\n\nReply here: http://localhost:3000/parent/attendance\n\nIf you have questions, please contact Coach Casey <coach@example.com>.");
    expect(content.emailText).not.toContain("My Wrestlers:");
    expect(content.emailText).toContain("Coach Casey <coach@example.com>");
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
      myWrestlersUrl: "http://localhost:3000/parent",
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
      myWrestlersUrl: "http://localhost:3000/parent",
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
