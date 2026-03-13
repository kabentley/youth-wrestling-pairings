import { describe, expect, it } from "vitest";

import { preserveParentResponseStatus } from "./meetStatusAttribution";

describe("preserveParentResponseStatus", () => {
  it("keeps the parent's last response after a coach edit", () => {
    expect(
      preserveParentResponseStatus({
        parentResponseStatus: "COMING",
        lastChangedSource: "COACH",
      }),
    ).toBe("COMING");
  });

  it("returns null when no parent response exists", () => {
    expect(
      preserveParentResponseStatus({
        parentResponseStatus: null,
        lastChangedSource: "COACH",
      }),
    ).toBeNull();
  });
});
