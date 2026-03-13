export type CoachAttendanceEditScope = "all" | "team" | null;

type Params = {
  userRole?: string | null;
  meetPhase: string;
  isCoordinator: boolean;
  isCoachOnMeetTeam: boolean;
  hasCoordinatorEditAccess?: boolean;
};

export function getCoachAttendanceEditScopeWithoutLock({
  userRole,
  meetPhase,
  isCoordinator,
  isCoachOnMeetTeam,
  hasCoordinatorEditAccess = false,
}: Params): CoachAttendanceEditScope {
  if (userRole === "ADMIN") {
    if (meetPhase === "ATTENDANCE" || meetPhase === "DRAFT") return "all";
    return null;
  }

  if (userRole !== "COACH") return null;

  if (meetPhase === "ATTENDANCE") {
    if (isCoordinator) return "all";
    return isCoachOnMeetTeam ? "team" : null;
  }

  if (meetPhase === "DRAFT") {
    if (isCoordinator) return "all";
    return isCoachOnMeetTeam && hasCoordinatorEditAccess ? "team" : null;
  }

  return null;
}
