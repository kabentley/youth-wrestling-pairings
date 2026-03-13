import { describe, expect, it } from "vitest";

describe("resolveNotificationTransport", () => {
  it("defaults to log in non-production", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(resolveNotificationTransport({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("log");
  });

  it("defaults to live in production", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(resolveNotificationTransport({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("live");
  });

  it("accepts an explicit env override", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { resolveNotificationTransport } = await import("./notifications");
    expect(
      resolveNotificationTransport({
        NODE_ENV: "production",
        NOTIFICATIONS_TRANSPORT: "off",
      } as NodeJS.ProcessEnv),
    ).toBe("off");
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
    });

    expect(content.emailSubject).toContain("Attendance open");
    expect(content.emailText).toContain("Hi Pat Parent");
    expect(content.emailText).toContain("North Gym");
    expect(content.emailText).toContain("Ava Smith and Ben Smith");
    expect(content.emailText).toContain("http://localhost:3000/parent/attendance");
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
    });

    expect(content.emailText).toContain("Link your wrestlers");
    expect(content.emailText).toContain("No deadline has been set.");
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
      },
      {
        userId: "parent_1",
        teamId: "team_1",
        teamLabel: "Tigers",
        displayName: "Pat Parent",
        email: "parent@example.com",
        childNames: ["Ava Smith", "Ben Smith"],
      },
    ]);

    expect(recipients).toHaveLength(1);
    expect(recipients[0]?.childNames).toEqual(["Ava Smith", "Ben Smith"]);
  });
});

describe("buildMeetReadyForCheckinContent", () => {
  it("builds check-in content with parent routes", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetReadyForCheckinContent } = await import("./notifications");
    const content = buildMeetReadyForCheckinContent({
      meetName: "Tigers-Wolves Jan 12",
      meetDate: new Date("2026-01-12T00:00:00.000Z"),
      location: "North Gym",
      todayUrl: "http://localhost:3000/parent/today",
      myWrestlersUrl: "http://localhost:3000/parent",
      recipientName: "Pat Parent",
      childNames: ["Ava Smith", "Ben Smith"],
    });

    expect(content.emailSubject).toContain("ready for check-in");
    expect(content.emailText).toContain("Coming wrestlers: Ava Smith and Ben Smith.");
    expect(content.emailText).toContain("http://localhost:3000/parent/today");
  });

  it("falls back when no child names are provided", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetReadyForCheckinContent } = await import("./notifications");
    const content = buildMeetReadyForCheckinContent({
      meetName: "Quad Meet",
      meetDate: new Date("2026-02-01T00:00:00.000Z"),
      location: null,
      todayUrl: "http://localhost:3000/parent/today",
      myWrestlersUrl: "http://localhost:3000/parent",
      recipientName: "Parent",
      childNames: [],
    });

    expect(content.emailText).toContain("Your linked wrestler is marked as coming.");
    expect(content.emailText).toContain("Location: To be announced.");
  });
});

describe("buildMeetPublishedContent", () => {
  it("builds published content with parent links", async () => {
    process.env.DATABASE_URL = "file:./dev.db";
    const { buildMeetPublishedContent } = await import("./notifications");
    const content = buildMeetPublishedContent({
      meetName: "Tigers-Wolves Jan 12",
      meetDate: new Date("2026-01-12T00:00:00.000Z"),
      myWrestlersUrl: "http://localhost:3000/parent",
      todayUrl: "http://localhost:3000/parent/today",
      recipientName: "Pat Parent",
      childNames: ["Ava Smith"],
    });

    expect(content.emailSubject).toContain("has been published");
    expect(content.emailText).toContain("Bout numbers and opponents are now available");
    expect(content.emailText).toContain("http://localhost:3000/parent");
  });
});
