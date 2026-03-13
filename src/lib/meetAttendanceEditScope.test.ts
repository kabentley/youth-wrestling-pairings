import { describe, expect, it } from "vitest";

import { getCoachAttendanceEditScopeWithoutLock } from "./meetAttendanceEditScope";

describe("getCoachAttendanceEditScopeWithoutLock", () => {
  it("treats admins like the meet coordinator in attendance", () => {
    expect(
      getCoachAttendanceEditScopeWithoutLock({
        userRole: "ADMIN",
        meetPhase: "ATTENDANCE",
        isCoordinator: false,
        isCoachOnMeetTeam: false,
      }),
    ).toBe("all");
  });

  it("treats admins like the meet coordinator in draft attendance work", () => {
    expect(
      getCoachAttendanceEditScopeWithoutLock({
        userRole: "ADMIN",
        meetPhase: "DRAFT",
        isCoordinator: false,
        isCoachOnMeetTeam: false,
      }),
    ).toBe("all");
  });

  it("lets any meet coach edit their own team during attendance without a lock", () => {
    expect(
      getCoachAttendanceEditScopeWithoutLock({
        userRole: "COACH",
        meetPhase: "ATTENDANCE",
        isCoordinator: false,
        isCoachOnMeetTeam: true,
      }),
    ).toBe("team");
  });

  it("lets the coordinator edit all teams during draft without a lock", () => {
    expect(
      getCoachAttendanceEditScopeWithoutLock({
        userRole: "COACH",
        meetPhase: "DRAFT",
        isCoordinator: true,
        isCoachOnMeetTeam: true,
      }),
    ).toBe("all");
  });

  it("lets a granted coach edit their own team during draft without a lock", () => {
    expect(
      getCoachAttendanceEditScopeWithoutLock({
        userRole: "COACH",
        meetPhase: "DRAFT",
        isCoordinator: false,
        isCoachOnMeetTeam: true,
        hasCoordinatorEditAccess: true,
      }),
    ).toBe("team");
  });

  it("keeps ungranted coaches read-only during draft", () => {
    expect(
      getCoachAttendanceEditScopeWithoutLock({
        userRole: "COACH",
        meetPhase: "DRAFT",
        isCoordinator: false,
        isCoachOnMeetTeam: true,
        hasCoordinatorEditAccess: false,
      }),
    ).toBeNull();
  });
});
