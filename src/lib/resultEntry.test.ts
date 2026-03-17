import { describe, expect, it } from "vitest";

import {
  buildWinnerLoserScore,
  isValidResultTime,
  normalizeResultType,
  parseWinnerLoserScore,
  validateBoutResult,
} from "./resultEntry";

describe("resultEntry", () => {
  it("normalizes result type aliases", () => {
    expect(normalizeResultType("pin")).toBe("FALL");
    expect(normalizeResultType("major")).toBe("MAJ");
    expect(normalizeResultType(" tf ")).toBe("TF");
    expect(normalizeResultType("unknown")).toBeNull();
  });

  it("parses and rebuilds winner-loser scores", () => {
    expect(parseWinnerLoserScore("14-7")).toEqual({ winnerScore: 14, loserScore: 7 });
    expect(buildWinnerLoserScore("14", "7")).toBe("14-7");
    expect(buildWinnerLoserScore("14", "")).toBeNull();
  });

  it("validates result time format", () => {
    expect(isValidResultTime("1:23")).toBe(true);
    expect(isValidResultTime("9:59")).toBe(true);
    expect(isValidResultTime("10:00")).toBe(false);
    expect(isValidResultTime("2:5")).toBe(false);
  });

  it("allows a winner with no type yet", () => {
    expect(validateBoutResult({ winnerId: "w1", type: null, score: null, time: null, notes: null })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: null, score: null, time: null, notes: null },
    });
  });

  it("requires details for decision results", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "6-3" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DEC", score: "6-3", time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "1-0" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DEC", score: "1-0", time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "3-6" })).toEqual({
      ok: false,
      error: "Winner score must be greater than loser score.",
    });
  });

  it("requires a 10-point margin for major decisions", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "MAJ", score: "12-2" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "MAJ", score: "12-2", time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "MAJ", score: "12-3" })).toEqual({
      ok: false,
      error: "Major decisions require a win by at least 10 points.",
    });
  });

  it("requires time for falls", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "FALL", time: "2:14" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "FALL", score: null, time: "2:14", notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "FALL", time: "10:00" })).toEqual({
      ok: false,
      error: "Enter a time in x:xx format under 10 minutes.",
    });
  });

  it("requires score and time for technical falls", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "15-7", time: "4:32" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "TF", score: "15-7", time: "4:32", notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "14-0", time: "4:32" })).toEqual({
      ok: false,
      error: "Technical falls require a win by at least 15 points.",
    });

    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "15-7", time: null })).toEqual({
      ok: false,
      error: "Enter a time in x:xx format under 10 minutes.",
    });
  });

  it("requires comments for DQ and forfeit", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "DQ", notes: "Illegal slam" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DQ", score: null, time: null, notes: "Illegal slam" },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "FOR", notes: "" })).toEqual({
      ok: false,
      error: "Enter a comment for forfeit results.",
    });
  });
});
