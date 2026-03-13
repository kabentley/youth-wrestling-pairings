export type MeetStatusAttributionSource = "PARENT" | "COACH" | "CHECKIN" | "SYSTEM";
export type MeetWrestlerStatusValue = "COMING" | "NOT_COMING" | "LATE" | "EARLY" | "ABSENT";

type StatusActor = {
  id: string;
  username: string;
  role: string;
};

/** Builds audit metadata for meet attendance and status changes. */
export function buildMeetStatusAttribution(
  user: StatusActor,
  source: MeetStatusAttributionSource,
  changedAt: Date = new Date(),
) {
  return {
    lastChangedById: user.id,
    lastChangedByUsername: user.username,
    lastChangedByRole: user.role,
    lastChangedSource: source,
    lastChangedAt: changedAt,
  };
}

type ExistingMeetStatusAttribution = {
  parentResponseStatus?: string | null;
  lastChangedById?: string | null;
  lastChangedByUsername?: string | null;
  lastChangedByRole?: string | null;
  lastChangedSource?: string | null;
  lastChangedAt?: Date | null;
};

function isMeetWrestlerStatusValue(value: string): value is MeetWrestlerStatusValue {
  return value === "COMING" ||
    value === "NOT_COMING" ||
    value === "LATE" ||
    value === "EARLY" ||
    value === "ABSENT";
}

/**
 * Coach edits should not replace the stored parent responder label shown in Draft.
 * Preserve prior parent attribution when it exists; otherwise clear the responder fields.
 */
export function buildCoachSafeStatusAttribution(existing?: ExistingMeetStatusAttribution | null) {
  if (existing?.lastChangedSource === "PARENT") {
    return {
      lastChangedById: existing.lastChangedById ?? null,
      lastChangedByUsername: existing.lastChangedByUsername ?? null,
      lastChangedByRole: existing.lastChangedByRole ?? null,
      lastChangedSource: existing.lastChangedSource ?? null,
      lastChangedAt: existing.lastChangedAt ?? null,
    };
  }
  return {
    lastChangedById: null,
    lastChangedByUsername: null,
    lastChangedByRole: null,
    lastChangedSource: null,
    lastChangedAt: null,
  };
}

/** Preserve the parent's last attendance response even after later coach/system updates. */
export function preserveParentResponseStatus(
  existing?: ExistingMeetStatusAttribution | null,
): MeetWrestlerStatusValue | null {
  if (!existing?.parentResponseStatus) return null;
  return isMeetWrestlerStatusValue(existing.parentResponseStatus)
    ? existing.parentResponseStatus
    : null;
}
