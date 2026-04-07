import { describe, expect, it } from "vitest";

import {
  buildFullName,
  getUserDisplayName,
  getUserFullName,
  lastNameHasDisallowedSuffix,
  resolveStoredUserName,
  splitLegacyFullName,
} from "./userName";

describe("splitLegacyFullName", () => {
  it("splits multi-part names on the last token", () => {
    expect(splitLegacyFullName("Mary Ann Smith")).toEqual({
      firstName: "Mary Ann",
      lastName: "Smith",
    });
  });

  it("keeps single-token names in firstName", () => {
    expect(splitLegacyFullName("Prince")).toEqual({
      firstName: "Prince",
      lastName: null,
    });
  });

  it("moves known suffixes into firstName when splitting legacy names", () => {
    expect(splitLegacyFullName("Michael Glenn Sr.")).toEqual({
      firstName: "Michael Sr.",
      lastName: "Glenn",
    });
  });

  it("strips trailing punctuation from the extracted last name", () => {
    expect(splitLegacyFullName("Parker Carney, Jr.")).toEqual({
      firstName: "Parker Jr.",
      lastName: "Carney",
    });
  });
});

describe("resolveStoredUserName", () => {
  it("prefers explicit first and last name fields", () => {
    expect(resolveStoredUserName({ firstName: "Jane", lastName: "Doe", name: "Ignored Legacy" })).toEqual({
      firstName: "Jane",
      lastName: "Doe",
      fullName: "Jane Doe",
    });
  });

  it("falls back to splitting the legacy name field", () => {
    expect(resolveStoredUserName({ name: "Coach Carter" })).toEqual({
      firstName: "Coach",
      lastName: "Carter",
      fullName: "Coach Carter",
    });
  });
});

describe("user name display helpers", () => {
  it("builds a full name from split fields", () => {
    expect(buildFullName("Jane", "Doe")).toBe("Jane Doe");
    expect(getUserFullName({ firstName: "Jane", lastName: "Doe" })).toBe("Jane Doe");
  });

  it("renders suffix-style first names after the last name in full display", () => {
    expect(buildFullName("Michael Sr.", "Glenn")).toBe("Michael Glenn Sr.");
    expect(getUserFullName({ firstName: "Michael Sr.", lastName: "Glenn" })).toBe("Michael Glenn Sr.");
  });

  it("falls back to username for display", () => {
    expect(getUserDisplayName({ username: "jdoe12", firstName: null, lastName: null })).toBe("jdoe12");
  });
});

describe("lastNameHasDisallowedSuffix", () => {
  it("flags suffixes entered into the last name field", () => {
    expect(lastNameHasDisallowedSuffix("Bents Jr.")).toBe(true);
    expect(lastNameHasDisallowedSuffix("Bents III")).toBe(true);
  });

  it("allows ordinary last names", () => {
    expect(lastNameHasDisallowedSuffix("Bents")).toBe(false);
    expect(lastNameHasDisallowedSuffix("O'Rourke")).toBe(false);
  });
});
