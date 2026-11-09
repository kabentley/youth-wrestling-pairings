import { describe, expect, it } from "vitest";

import { postgresConnectionString } from "./postgresConnectionString";

describe("postgresConnectionString", () => {
  it.each(["require", "prefer", "verify-ca"])("preserves strict verification for %s", (mode) => {
    const result = new URL(postgresConnectionString(`postgresql://user:p%40ss@localhost/db?sslmode=${mode}&channel_binding=require`));
    expect(result.searchParams.get("sslmode")).toBe("verify-full");
    expect(result.password).toBe("p%40ss");
    expect(result.searchParams.get("channel_binding")).toBe("require");
  });

  it.each(["", "?sslmode=disable", "?sslmode=verify-full", "?sslmode=require&uselibpqcompat=true"])("preserves explicit or default settings %s", (query) => {
    const url = `postgresql://localhost/db${query}`;
    expect(postgresConnectionString(url)).toBe(url);
  });
});
