import { describe, expect, it } from "vitest";

import {
  buildWinnerLoserScore,
  classifyDecisionTypeFromScore,
  formatResultPeriod,
  isValidResultTime,
  normalizeResultType,
  normalizeSavedResult,
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

  it("classifies decision scores for saved result types", () => {
    expect(classifyDecisionTypeFromScore("8-0")).toBe("MAJ");
    expect(classifyDecisionTypeFromScore("15-0")).toBe("TF");
    expect(classifyDecisionTypeFromScore("7-0")).toBe("DEC");
  });

  it("formats overtime periods", () => {
    expect(formatResultPeriod(1)).toBe("1");
    expect(formatResultPeriod(4)).toBe("OT");
    expect(formatResultPeriod(5)).toBe("OT2");
    expect(formatResultPeriod(6)).toBe("OT3");
  });

  it("validates result time format", () => {
    expect(isValidResultTime("1:23")).toBe(true);
    expect(isValidResultTime("9:59")).toBe(true);
    expect(isValidResultTime("10:00")).toBe(false);
    expect(isValidResultTime("2:5")).toBe(false);
  });

  it("allows a winner with no type yet", () => {
    expect(validateBoutResult({ winnerId: "w1", type: null, score: null, period: null, time: null, notes: null })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: null, score: null, period: null, time: null, notes: null },
    });
  });

  it("requires details for decision results", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "6-3" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DEC", score: "6-3", period: null, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "1-0" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DEC", score: "1-0", period: null, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "3-6" })).toEqual({
      ok: false,
      error: "Winner score must be greater than loser score.",
    });

    expect(validateBoutResult({ winnerId: "w1", type: "DEC", score: "6-3", notes: "Good scramble" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DEC", score: "6-3", period: null, time: null, notes: "Good scramble" },
    });
  });

  it("requires an 8-point margin for major decisions", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "MAJ", score: "12-4" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "MAJ", score: "12-4", period: null, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "MAJ", score: "12-5" })).toEqual({
      ok: false,
      error: "Major decisions require a win by at least 8 points.",
    });
  });

  it("allows falls with an optional period", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "FALL", period: 2 })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "FALL", score: null, period: 2, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "FALL", period: 4 })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "FALL", score: null, period: 4, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "FALL", period: null })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "FALL", score: null, period: null, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "FALL", period: 2, notes: "Second-period pin" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "FALL", score: null, period: 2, time: null, notes: "Second-period pin" },
    });
  });

  it("requires score and allows an optional period for technical falls", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "15-0", period: 3 })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "TF", score: "15-0", period: 3, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "15-0", period: 6 })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "TF", score: "15-0", period: 6, time: null, notes: null },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "14-0", period: 3 })).toEqual({
      ok: false,
      error: "Technical falls require a win by at least 15 points.",
    });

    expect(validateBoutResult({ winnerId: "w1", type: "TF", score: "15-0", period: null })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "TF", score: "15-0", period: null, time: null, notes: null },
    });
  });

  it("upgrades saved DEC results based on score margin", () => {
    expect(normalizeSavedResult({
      winnerId: "w1",
      type: "DEC",
      score: "8-0",
      period: null,
      time: null,
      notes: null,
    })).toEqual({
      winnerId: "w1",
      type: "MAJ",
      score: "8-0",
      period: null,
      time: null,
      notes: null,
    });

    expect(normalizeSavedResult({
      winnerId: "w1",
      type: "DEC",
      score: "15-0",
      period: null,
      time: null,
      notes: null,
    })).toEqual({
      winnerId: "w1",
      type: "TF",
      score: "15-0",
      period: null,
      time: null,
      notes: null,
    });
  });

  it("requires comments for DQ and forfeit", () => {
    expect(validateBoutResult({ winnerId: "w1", type: "DQ", notes: "Illegal slam" })).toEqual({
      ok: true,
      value: { winnerId: "w1", type: "DQ", score: null, period: null, time: null, notes: "Illegal slam" },
    });

    expect(validateBoutResult({ winnerId: "w1", type: "FOR", notes: "" })).toEqual({
      ok: false,
      error: "Enter a comment for forfeit results.",
    });
  });
});
