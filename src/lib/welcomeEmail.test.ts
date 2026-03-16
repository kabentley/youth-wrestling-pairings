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

const { buildWelcomeEmailText, describeWelcomeEmailResult } = await import("./welcomeEmail");

describe("buildWelcomeEmailText", () => {
  it("includes account credentials and sign-in link", () => {
    const text = buildWelcomeEmailText({
      username: "jdoe12",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      teamLabel: "West Chester (WC)",
    });
    expect(text).toContain("Username: jdoe12");
    expect(text).toContain("Temporary password: 123456");
    expect(text).toContain("Team: West Chester (WC)");
    expect(text).toContain("reset your password");
  });

  it("uses a non-reset note when the account will not be forced to reset", () => {
    expect(buildWelcomeEmailText({
      username: "jdoe12",
      tempPassword: "123456",
      signInUrl: "https://example.com/auth/signin",
      mustResetPassword: false,
    })).toContain("change your password from the Account page");
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
