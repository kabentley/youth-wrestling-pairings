import { describe, expect, it } from "vitest";

import { extractLastNameCandidates, lastNameSimilarity } from "./surnameMatching";

describe("extractLastNameCandidates", () => {
  it("uses only the true last name for normal two-part names", () => {
    expect(extractLastNameCandidates("Barry Anderson")).toEqual(["anderson"]);
  });

  it("keeps suffixes out of surname matching", () => {
    expect(extractLastNameCandidates("Barry Anderson Jr.")).toEqual(["anderson"]);
  });

  it("supports recognized multi-word surnames", () => {
    expect(extractLastNameCandidates("Maria De La Cruz")).toEqual(["cruz", "delacruz"]);
  });
});

describe("lastNameSimilarity", () => {
  it("does not let Barry Anderson match Ryan through a first+last token", () => {
    const candidates = extractLastNameCandidates("Barry Anderson");
    const bestScore = candidates.reduce((best, candidate) => {
      const next = lastNameSimilarity(candidate, "ryan");
      return next > best ? next : best;
    }, 0);
    expect(bestScore).toBeLessThan(0.88);
  });

  it("still matches the real surname exactly", () => {
    const candidates = extractLastNameCandidates("Barry Anderson");
    const bestScore = candidates.reduce((best, candidate) => {
      const next = lastNameSimilarity(candidate, "anderson");
      return next > best ? next : best;
    }, 0);
    expect(bestScore).toBe(1);
  });
});
