import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  meetFindUnique: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/db", () => ({
  db: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    meet: {
      findUnique: mocks.meetFindUnique,
    },
  },
}));

describe("requireMeetParticipant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows admins even when they are not on a meet team", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "admin-1", sessionVersion: 7 } });
    mocks.userFindUnique.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      username: "admin",
      teamId: null,
      sessionVersion: 7,
    });
    mocks.meetFindUnique.mockResolvedValue({
      id: "meet-1",
      deletedAt: null,
      homeTeamId: "team-1",
      homeTeam: { headCoachId: "coach-1" },
      meetTeams: [{ teamId: "team-1" }, { teamId: "team-2" }],
    });

    const { requireMeetParticipant } = await import("./rbac");
    const result = await requireMeetParticipant("meet-1");

    expect(result.user.role).toBe("ADMIN");
    expect(result.meetTeamIds.has("team-1")).toBe(true);
    expect(result.isCoordinator).toBe(false);
  });

  it("allows coaches assigned to a team in the meet", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "coach-1", sessionVersion: 3 } });
    mocks.userFindUnique.mockResolvedValue({
      id: "coach-1",
      role: "COACH",
      username: "coach",
      teamId: "team-1",
      sessionVersion: 3,
    });
    mocks.meetFindUnique.mockResolvedValue({
      id: "meet-1",
      deletedAt: null,
      homeTeamId: "team-1",
      homeTeam: { headCoachId: "coach-1" },
      meetTeams: [{ teamId: "team-1" }, { teamId: "team-2" }],
    });

    const { requireMeetParticipant } = await import("./rbac");
    const result = await requireMeetParticipant("meet-1");

    expect(result.user.username).toBe("coach");
    expect(result.isCoordinator).toBe(true);
  });

  it("rejects coaches who are not assigned to any team in the meet", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "coach-9", sessionVersion: 1 } });
    mocks.userFindUnique.mockResolvedValue({
      id: "coach-9",
      role: "COACH",
      username: "outsider",
      teamId: "team-9",
      sessionVersion: 1,
    });
    mocks.meetFindUnique.mockResolvedValue({
      id: "meet-1",
      deletedAt: null,
      homeTeamId: "team-1",
      homeTeam: { headCoachId: "coach-1" },
      meetTeams: [{ teamId: "team-1" }, { teamId: "team-2" }],
    });

    const { requireMeetParticipant } = await import("./rbac");
    await expect(requireMeetParticipant("meet-1")).rejects.toThrow("FORBIDDEN");
  });

  it("treats deleted meets as not found unless explicitly allowed", async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: "coach-1", sessionVersion: 3 } });
    mocks.userFindUnique.mockResolvedValue({
      id: "coach-1",
      role: "COACH",
      username: "coach",
      teamId: "team-1",
      sessionVersion: 3,
    });
    mocks.meetFindUnique.mockResolvedValue({
      id: "meet-1",
      deletedAt: new Date("2026-03-19T00:00:00.000Z"),
      homeTeamId: "team-1",
      homeTeam: { headCoachId: "coach-1" },
      meetTeams: [{ teamId: "team-1" }],
    });

    const { requireMeetParticipant } = await import("./rbac");
    await expect(requireMeetParticipant("meet-1")).rejects.toThrow("NOT_FOUND");

    await expect(requireMeetParticipant("meet-1", { allowDeleted: true })).resolves.toMatchObject({
      user: { id: "coach-1" },
    });
  });
});
