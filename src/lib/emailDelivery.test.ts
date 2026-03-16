import { describe, expect, it, vi } from "vitest";

vi.mock("./db", () => ({
  db: {
    league: {
      findFirst: vi.fn(),
    },
  },
}));

const { parseEmailWhitelist, serializeEmailWhitelist } = await import("./emailDelivery");

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
