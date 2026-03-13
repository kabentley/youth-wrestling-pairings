export type MeetAttendanceStatus = "COMING" | "NOT_COMING" | "LATE" | "EARLY";

export function normalizeMeetAttendanceStatus(status?: string | null): MeetAttendanceStatus {
  if (status === "ABSENT") return "NOT_COMING";
  if (status === "COMING" || status === "LATE" || status === "EARLY") return status;
  return "NOT_COMING";
}

export function isMeetAttendanceStatusAttending(status?: string | null): boolean {
  const normalized = normalizeMeetAttendanceStatus(status);
  return normalized === "COMING" || normalized === "LATE" || normalized === "EARLY";
}
