import { describe, expect, it } from "vitest";

import { isMeetAttendanceStatusAttending, normalizeMeetAttendanceStatus } from "./meetAttendanceStatus";

describe("normalizeMeetAttendanceStatus", () => {
  it("maps missing and absent statuses to not coming", () => {
    expect(normalizeMeetAttendanceStatus(undefined)).toBe("NOT_COMING");
    expect(normalizeMeetAttendanceStatus(null)).toBe("NOT_COMING");
    expect(normalizeMeetAttendanceStatus("ABSENT")).toBe("NOT_COMING");
  });

  it("keeps attending statuses intact", () => {
    expect(normalizeMeetAttendanceStatus("COMING")).toBe("COMING");
    expect(normalizeMeetAttendanceStatus("LATE")).toBe("LATE");
    expect(normalizeMeetAttendanceStatus("EARLY")).toBe("EARLY");
  });
});

describe("isMeetAttendanceStatusAttending", () => {
  it("treats no-reply wrestlers as not attending", () => {
    expect(isMeetAttendanceStatusAttending(undefined)).toBe(false);
    expect(isMeetAttendanceStatusAttending(null)).toBe(false);
  });

  it("treats explicit coming statuses as attending", () => {
    expect(isMeetAttendanceStatusAttending("COMING")).toBe(true);
    expect(isMeetAttendanceStatusAttending("LATE")).toBe(true);
    expect(isMeetAttendanceStatusAttending("EARLY")).toBe(true);
  });
});
