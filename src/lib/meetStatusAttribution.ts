export type MeetStatusAttributionSource = "PARENT" | "COACH" | "CHECKIN" | "SYSTEM";

type StatusActor = {
  id: string;
  username: string;
  role: string;
};

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
