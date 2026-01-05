import { describe, expect, it } from "vitest";

import { planRosterUpsert, toISODateOnly } from "./importRoster";

describe("planRosterUpsert", () => {
  it("matches duplicates by name + birthdate only (ignores weight) and overwrites other columns", () => {
    const teamId = "T1";
    const existing = [
      { id: "W1", first: "Ben", last: "Bentley", birthdate: new Date("2015-03-11") },
    ];

    const incoming = [
      // same name+birthdate, different weight/skill/exp => UPDATE
      { first: "Ben", last: "Bentley", weight: 60, birthdate: "2015-03-11", experienceYears: 2, skill: 5 },
    ];

    const plan = planRosterUpsert({ teamId, existing, incoming });
    expect(plan.toCreate).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0]).toEqual({ id: "W1", weight: 60, experienceYears: 2, skill: 5 });
  });

  it("creates when no match exists", () => {
    const teamId = "T1";
    const existing: any[] = [];
    const incoming = [
      { first: "Sam", last: "Smith", weight: 55, birthdate: "2014-11-02", experienceYears: 0, skill: 2 },
    ];

    const plan = planRosterUpsert({ teamId, existing, incoming });
    expect(plan.toUpdate).toHaveLength(0);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.toCreate[0].teamId).toBe(teamId);
    expect(plan.toCreate[0].first).toBe("Sam");
    expect(plan.toCreate[0].last).toBe("Smith");
    expect(toISODateOnly(plan.toCreate[0].birthdate)).toBe("2014-11-02");
  });

  it("dedupes duplicate rows inside the same CSV by name+birthdate", () => {
    const teamId = "T1";
    const existing: any[] = [];
    const incoming = [
      { first: "Ben", last: "Bentley", weight: 52, birthdate: "2015-03-11", experienceYears: 1, skill: 3 },
      { first: " Ben ", last: "BENTLEY", weight: 53, birthdate: "2015-03-11", experienceYears: 2, skill: 4 },
    ];

    const plan = planRosterUpsert({ teamId, existing, incoming });
    expect(plan.toCreate).toHaveLength(1);
    // first row wins (deterministic)
    expect(plan.toCreate[0].weight).toBe(52);
    expect(plan.toCreate[0].experienceYears).toBe(1);
    expect(plan.toCreate[0].skill).toBe(3);
  });

  it("clamps skill to 0..5 and floors experienceYears", () => {
    const teamId = "T1";
    const existing: any[] = [];
    const incoming = [
      { first: "A", last: "B", weight: 50, birthdate: "2015-01-01", experienceYears: 2.9, skill: 9 },
      { first: "C", last: "D", weight: 52, birthdate: "2015-01-02", experienceYears: -1, skill: -3 },
    ];

    const plan = planRosterUpsert({ teamId, existing, incoming });
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.toCreate[0].experienceYears).toBe(2);
    expect(plan.toCreate[0].skill).toBe(5);
    expect(plan.toCreate[1].experienceYears).toBe(0);
    expect(plan.toCreate[1].skill).toBe(0);
  });
});
