import { describe, expect, it } from "vitest";

import { restConflictSeverityLabel, shouldShowRestConflict } from "./restConflictSeverity";

describe("restConflictSeverityLabel", () => {
  it("classifies severe and major conflicts", () => {
    expect(restConflictSeverityLabel(1)).toBe("Severe");
    expect(restConflictSeverityLabel(4)).toBe("Major");
  });

  it("classifies larger gaps as minor", () => {
    expect(restConflictSeverityLabel(5)).toBe("Minor");
  });
});

describe("shouldShowRestConflict", () => {
  it("hides minor conflicts from the checklist", () => {
    expect(shouldShowRestConflict(5)).toBe(false);
  });

  it("keeps severe and major conflicts visible", () => {
    expect(shouldShowRestConflict(1)).toBe(true);
    expect(shouldShowRestConflict(4)).toBe(true);
  });
});
