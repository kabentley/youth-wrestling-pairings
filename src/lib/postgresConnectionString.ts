/** Preserve node-postgres certificate and hostname verification across driver upgrades. */
export function postgresConnectionString(url: string): string {
  const parsed = new URL(url);
  const mode = parsed.searchParams.get("sslmode");
  if (
    parsed.searchParams.get("uselibpqcompat") !== "true" &&
    (mode === "require" || mode === "prefer" || mode === "verify-ca")
  ) {
    parsed.searchParams.set("sslmode", "verify-full");
    return parsed.toString();
  }
  return url;
}
