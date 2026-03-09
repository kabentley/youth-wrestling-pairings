export const MEET_PHASES = ["ATTENDANCE", "DRAFT", "READY_FOR_CHECKIN", "PUBLISHED"] as const;
export const CHECKIN_CHECKPOINT_PREFIXES = ["Ready for Check-in ", "Check-in "] as const;

export type MeetPhase = (typeof MEET_PHASES)[number];

export const PUBLISHED_MEET_PHASE: MeetPhase = "PUBLISHED";

/** Normalizes legacy/raw status values into the current meet-phase enum. */
export function normalizeMeetPhase(status?: string | null): MeetPhase {
  if (status === "ATTENDANCE" || status === "CREATED") return "ATTENDANCE";
  return status === "READY_FOR_CHECKIN" || status === "PUBLISHED" ? status : "DRAFT";
}

/** Returns the user-facing label for a meet phase. */
export function meetPhaseLabel(status?: string | null) {
  const phase = normalizeMeetPhase(status);
  if (phase === "ATTENDANCE") return "Attendance";
  if (phase === "READY_FOR_CHECKIN") return "Check-in";
  if (phase === "PUBLISHED") return "Published";
  return "Draft";
}

/** Returns whether the phase still allows in-app editing workflows. */
export function isEditableMeetPhase(status?: string | null) {
  const phase = normalizeMeetPhase(status);
  return phase === "ATTENDANCE" || phase === "DRAFT" || phase === "READY_FOR_CHECKIN";
}

/** Enforces the finite-state-machine rules for phase transitions. */
export function canTransitionMeetPhase(fromStatus: MeetPhase, toStatus: MeetPhase) {
  if (fromStatus === toStatus) return true;
  if (fromStatus === "ATTENDANCE") return toStatus === "DRAFT";
  if (fromStatus === "DRAFT") return toStatus === "ATTENDANCE" || toStatus === "READY_FOR_CHECKIN";
  if (fromStatus === "READY_FOR_CHECKIN") return toStatus === "DRAFT" || toStatus === "PUBLISHED";
  return false;
}

/** Returns whether moving between phases should capture an automatic checkpoint. */
export function shouldCreateAutoCheckpoint(fromStatus: MeetPhase, toStatus: MeetPhase) {
  return fromStatus === "DRAFT" && toStatus === "READY_FOR_CHECKIN";
}

/** Builds the default checkpoint name used when phase changes auto-save the meet. */
export function buildAutoPhaseCheckpointName(status: MeetPhase, now: Date) {
  const stamp = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now).replace(",", "");
  if (status === "PUBLISHED") {
    return `Published ${stamp}`;
  }
  return `Check-in ${stamp}`;
}

/** Detects checkpoint names that represent ready-for-check-in snapshots. */
export function isCheckinCheckpointName(name?: string | null) {
  return typeof name === "string" && CHECKIN_CHECKPOINT_PREFIXES.some((prefix) => name.startsWith(prefix));
}
