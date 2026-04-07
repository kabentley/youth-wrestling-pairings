import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  db: {
    league: {
      findFirst: vi.fn(),
    },
    notificationLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("./emailDelivery", () => ({
  getEmailDeliverySettings: vi.fn(),
  shouldDeliverEmailTo: vi.fn(),
  shouldWriteEmailLogs: vi.fn(),
}));

import { buildPasswordResetEmailContent, describePasswordResetEmailResult } from "./passwordResetEmail";

describe("buildPasswordResetEmailContent", () => {
  it("includes the username, temporary password, and sign-in link", () => {
    const content = buildPasswordResetEmailContent({
      leagueName: "ICWL",
      email: "jdoe12@example.com",
      username: "jdoe12",
      tempPassword: "TempPass123!",
      signInUrl: "https://example.com/auth/signin?username=jdoe12",
      fullName: "Jane Doe",
    });

    expect(content.subject).toContain("ICWL");
    expect(content.text).toContain("Hello Jane Doe,");
    expect(content.text).toContain("Username: jdoe12");
    expect(content.text).toContain("Temporary password: TempPass123!");
    expect(content.text).toContain("https://example.com/auth/signin?username=jdoe12");
    expect(content.text).toContain("choose a new password");
    expect(content.html).toContain("Jane Doe");
    expect(content.html).toContain("TempPass123!");
    expect(content.html).toContain("Sign In");
  });
});

describe("describePasswordResetEmailResult", () => {
  it("formats sent results", () => {
    expect(describePasswordResetEmailResult({ status: "sent", reason: null })).toBe("Password reset email sent.");
  });

  it("formats logged results", () => {
    expect(describePasswordResetEmailResult({
      status: "logged",
      reason: "App email delivery is set to log only.",
    })).toBe("Password reset email logged without sending: App email delivery is set to log only.");
  });

  it("formats skipped results", () => {
    expect(describePasswordResetEmailResult({
      status: "skipped",
      reason: "Recipient email is not on the admin whitelist.",
    })).toBe("Password reset email skipped: Recipient email is not on the admin whitelist.");
  });
});
