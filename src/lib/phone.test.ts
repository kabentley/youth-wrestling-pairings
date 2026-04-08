import { describe, expect, it } from "vitest";

import {
  getPhoneValidationError,
  isValidPhoneNumber,
  normalizePhoneNumber,
  PHONE_VALIDATION_MESSAGE,
  standardizePhoneNumber,
} from "./phone";

describe("normalizePhoneNumber", () => {
  it("normalizes US phone numbers with punctuation to +1 format", () => {
    expect(normalizePhoneNumber("(555) 123-4567")).toBe("+15551234567");
  });

  it("normalizes plain 10-digit numbers to +1 format", () => {
    expect(normalizePhoneNumber("5551234567")).toBe("+15551234567");
  });

  it("normalizes 11-digit numbers starting with 1 to +1 format", () => {
    expect(normalizePhoneNumber("13027377866")).toBe("+13027377866");
  });

  it("preserves non-10-digit input so callers can reject it", () => {
    expect(normalizePhoneNumber("+44 20 7123 4567")).toBe("+44 20 7123 4567");
  });

  it("does not treat long unprefixed numbers as valid international input", () => {
    expect(normalizePhoneNumber("13027377866344")).toBe("13027377866344");
  });
});

describe("isValidPhoneNumber", () => {
  it("accepts blank values", () => {
    expect(isValidPhoneNumber("")).toBe(true);
  });

  it("accepts formatted phone numbers", () => {
    expect(isValidPhoneNumber("(555) 123-4567")).toBe(true);
  });

  it("rejects extensions", () => {
    expect(getPhoneValidationError("(555) 123-4567 x89")).toBe(PHONE_VALIDATION_MESSAGE);
  });

  it("rejects values that do not resolve to a valid stored number", () => {
    expect(isValidPhoneNumber("1234")).toBe(false);
  });

  it("rejects long unprefixed numbers", () => {
    expect(isValidPhoneNumber("13027377866344")).toBe(false);
  });

  it("rejects 11-digit numbers even when they start with 1", () => {
    expect(isValidPhoneNumber("23027377866")).toBe(false);
  });

  it("accepts 11-digit numbers when they start with 1", () => {
    expect(isValidPhoneNumber("13027377866")).toBe(true);
  });
});

describe("standardizePhoneNumber", () => {
  it("returns normalized output for valid numbers", () => {
    expect(standardizePhoneNumber("555.123.4567")).toBe("+15551234567");
  });

  it("preserves invalid values for caller-side error handling", () => {
    expect(standardizePhoneNumber("1234")).toBe("1234");
  });
});
