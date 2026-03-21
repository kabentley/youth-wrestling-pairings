import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  db: {
    league: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./emailDelivery", () => ({
  shouldDeliverEmailTo: vi.fn(),
}));

const { buildDefaultWelcomeEmailBodyTemplate, buildWelcomeEmailHtml, buildWelcomeEmailSubject, buildWelcomeEmailText, describeWelcomeEmailResult } = await import("./welcomeEmail");

describe("buildWelcomeEmailText", () => {
  it("includes account credentials and sign-in link", () => {
    const text = buildWelcomeEmailText({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      fullName: "Jane Doe",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      myWrestlersUrl: "https://example.com/parent",
      coachName: "Pat Coach",
      coachEmail: "coach@example.com",
      teamLabel: "West Chester (WC)",
    });
    expect(text).toContain("Welcome Jane Doe! Your account has been created.");
    expect(text).toContain("Username: jdoe12");
    expect(text).toContain("Temporary password: 123456");
    expect(text).toContain("please contact your coach: Pat Coach <coach@example.com>");
    expect(text).toContain("reset your password");
  });

  it("includes the coach contact sentence when coach info is available", () => {
    const text = buildWelcomeEmailText({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      fullName: "Jane Doe",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      myWrestlersUrl: "https://example.com/parent",
      coachName: "Pat Coach",
      coachEmail: "coach@example.com",
    });
    expect(text).toContain("If you have questions about this app, please contact your coach: Pat Coach <coach@example.com>");
  });

  it("lists linked wrestlers and points to the My Wrestlers page when present", () => {
    const text = buildWelcomeEmailText({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      fullName: "Jane Doe",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      myWrestlersUrl: "https://example.com/parent",
      linkedWrestlerNames: ["Ava Doe", "Mia Doe"],
    });
    expect(text).toContain("This account has been linked to the following wrestlers:");
    expect(text).toContain("- Ava Doe");
    expect(text).toContain("- Mia Doe");
    expect(text).not.toContain("correct any errors");
    expect(text).not.toContain("https://example.com/parent");
  });

  it("uses a non-reset note when the account will not be forced to reset", () => {
    expect(buildWelcomeEmailText({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      fullName: "Jane Doe",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      myWrestlersUrl: "https://example.com/parent",
      mustResetPassword: false,
    })).toContain("change your password from the Account page");
  });

  it("does not echo a password for self-signup accounts", () => {
    const text = buildWelcomeEmailText({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      fullName: "Jane Doe",
      signInUrl: "https://example.com/auth/signin",
      myWrestlersUrl: "https://example.com/parent",
      mustResetPassword: false,
    });
    expect(text).toContain("Username: jdoe12");
    expect(text).not.toContain("Temporary password:");
    expect(text).toContain("Use the password you set during sign-up.");
  });

});

describe("buildWelcomeEmailHtml", () => {
  it("builds html with sign-in and my wrestlers actions", () => {
    const html = buildWelcomeEmailHtml({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      fullName: "Jane Doe",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      myWrestlersUrl: "https://example.com/parent",
      coachName: "Pat Coach",
      coachEmail: "coach@example.com",
      linkedWrestlerNames: ["Ava Doe", "Mia Doe"],
      teamLabel: "West Chester (WC)",
      leagueLogoUrl: "https://example.com/api/league/logo/file",
      teamLogoUrl: "https://example.com/api/public/teams/team_1/logo",
    });
    expect(html).toContain("Sign In");
    expect(html).not.toContain("My Wrestlers</a>");
    expect(html).toContain("Ava Doe");
    expect(html).toContain("Mia Doe");
    expect(html).toContain("Pat Coach");
    expect(html).toContain("https://example.com/auth/signin");
    expect(html).toContain("Welcome to the ICWL meet scheduling app");
    expect(html).toContain("https://example.com/api/league/logo/file");
    expect(html).toContain("https://example.com/api/public/teams/team_1/logo");
    expect(html).toContain("<strong>Jane Doe</strong>");
  });
});

describe("buildDefaultWelcomeEmailBodyTemplate", () => {
  it("includes the supported placeholders", () => {
    const template = buildDefaultWelcomeEmailBodyTemplate();
    expect(template).toContain("{greetingLine}");
    expect(template).toContain("{usernameLine}");
    expect(template).toContain("{temporaryPasswordLine}");
    expect(template).toContain("{passwordInstructions}");
    expect(template).toContain("{linkedWrestlersBlock}");
    expect(template).toContain("{coachContactLine}");
  });
});

describe("buildWelcomeEmailSubject", () => {
  it("uses the fixed subject format when a team is present", () => {
    expect(buildWelcomeEmailSubject({
      leagueName: "ICWL",
      teamName: "West Chester",
    })).toBe("Welcome to the ICWL meet scheduling app for West Chester.");
  });

  it("omits the team phrase when no team is present", () => {
    expect(buildWelcomeEmailSubject({
      leagueName: "ICWL",
      teamName: "",
    })).toBe("Welcome to the ICWL meet scheduling app.");
  });
});

describe("describeWelcomeEmailResult", () => {
  it("formats sent results", () => {
    expect(describeWelcomeEmailResult({ status: "sent", reason: null })).toBe("Welcome email sent.");
  });

  it("formats skipped results with the reason", () => {
    expect(describeWelcomeEmailResult({
      status: "skipped",
      reason: "Recipient email is not on the admin whitelist.",
    })).toBe("Welcome email skipped: Recipient email is not on the admin whitelist.");
  });
});
