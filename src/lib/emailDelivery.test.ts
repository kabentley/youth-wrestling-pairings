import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  db: {
    league: {
      findFirst: vi.fn(),
    },
  },
}));

const { parseEmailWhitelist, serializeEmailWhitelist, shouldWriteEmailLog } = await import("./emailDelivery");

describe("parseEmailWhitelist", () => {
  it("normalizes, deduplicates, and splits mixed separators", () => {
    expect(parseEmailWhitelist(" Test@Example.com ;two@example.com\nthree@example.com, test@example.com "))
      .toEqual(["test@example.com", "three@example.com", "two@example.com"]);
  });
});

describe("serializeEmailWhitelist", () => {
  it("stores one normalized email per line", () => {
    expect(serializeEmailWhitelist([" Test@Example.com ", "two@example.com", "test@example.com"]))
      .toBe("test@example.com\ntwo@example.com");
  });
});

describe("shouldWriteEmailLog", () => {
  it("suppresses non-failed email logs in everyone mode", () => {
    expect(shouldWriteEmailLog("all", "SENT")).toBe(false);
    expect(shouldWriteEmailLog("all", "LOGGED")).toBe(false);
    expect(shouldWriteEmailLog("all", "SKIPPED")).toBe(false);
  });

  it("keeps failed email logs in everyone mode", () => {
    expect(shouldWriteEmailLog("all", "FAILED")).toBe(true);
  });

  it("logs all outcomes outside everyone mode", () => {
    expect(shouldWriteEmailLog("log", "SENT")).toBe(true);
    expect(shouldWriteEmailLog("whitelist", "SKIPPED")).toBe(true);
    expect(shouldWriteEmailLog("off", "FAILED")).toBe(true);
  });
});
