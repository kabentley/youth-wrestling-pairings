"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Role = "PARENT" | "COACH" | "ADMIN" | "TABLE_WORKER";
type LinkItem = { href: string; label: string; minRole?: Role; roles?: readonly Role[] };

const roleOrder: Record<Role, number> = { PARENT: 0, TABLE_WORKER: 0, COACH: 1, ADMIN: 2 };
const coachNavLink: LinkItem = { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" };

export default function AppHeader({ links }: { links: LinkItem[] }) {
  const [user, setUser] = useState<{
    username: string;
    role: Role;
    team?: { name?: string | null; symbol?: string | null; color?: string | null } | null;
    teamLogoUrl?: string | null;
  } | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch("/api/me");
      const json = res.ok ? await res.json() : null;
      if (!active || !json?.username || !json?.role) return;
        setUser({
          username: json.username,
          role: json.role,
          team: json.team ?? null,
          teamLogoUrl: json.teamLogoUrl ?? null,
        });
    }
    void load();
    function handleRefresh() {
      void load();
    }
    window.addEventListener("user:refresh", handleRefresh);
    return () => {
      active = false;
      window.removeEventListener("user:refresh", handleRefresh);
    };
  }, []);

  const allLinks = links.some((link) => link.href === coachNavLink.href)
    ? links
    : [...links, coachNavLink];

  const visibleLinks = user
    ? allLinks.filter(link => {
        if (link.roles && !link.roles.includes(user.role)) return false;
        if (!link.minRole) return true;
        return roleOrder[user.role] >= roleOrder[link.minRole];
      })
    : allLinks.filter(
        link =>
          !link.minRole &&
          !link.roles &&
          link.href !== "/rosters" &&
          link.href !== "/account" &&
          link.href !== "/parent",
      );
  const accountLink = user ? visibleLinks.find(link => link.href === "/account") : null;
  const myWrestlersLink = user ? visibleLinks.find(link => link.href === "/parent") : null;
  const mainLinks = accountLink
    ? visibleLinks.filter(link => link.href !== "/account" && link.href !== "/parent")
    : visibleLinks.filter(link => link.href !== "/parent");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        gap: 12,
        flexWrap: "wrap",
        borderBottom: "1px solid var(--line, #d5dbe2)",
        paddingBottom: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginRight: "auto" }}>
        {mainLinks.map(link => (
          <a key={link.href} href={link.href} style={{ fontWeight: 600, textDecoration: "none", color: "var(--ink, #1d232b)" }}>
            {link.label}
          </a>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {user ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, fontWeight: 600 }}>
              <span>User: {user.username}, Role: {user.role}</span>
              {user.team ? (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px",
                    border: "1px solid var(--line, #d5dbe2)",
                    borderRadius: 8,
                  }}
                >
                  {user.teamLogoUrl ? (
                    <img
                      src={user.teamLogoUrl}
                      alt={`${user.team.name ?? "Team"} logo`}
                      style={{ width: 22, height: 22, objectFit: "contain", borderRadius: 4 }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        background: user.team.color ?? "#ccc",
                        display: "inline-block",
                      }}
                    />
                  )}
                  <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
                    <span style={{ fontWeight: 700, fontSize: 12 }}>{user.team.symbol ?? ""}</span>
                    <span style={{ fontWeight: 600, fontSize: 12 }}>{user.team.name}</span>
                  </span>
                </span>
              ) : null}
            </div>
            {myWrestlersLink ? (
              <a
                href={myWrestlersLink.href}
                style={{
                  fontWeight: 600,
                  textDecoration: "none",
                  color: "var(--ink, #1d232b)",
                  border: "1px solid var(--line, #d5dbe2)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 14,
                  letterSpacing: "0.5px",
                }}
              >
                {myWrestlersLink.label}
              </a>
            ) : null}
            {accountLink ? (
              <a
                href={accountLink.href}
                style={{
                  fontWeight: 600,
                  textDecoration: "none",
                  color: "var(--ink, #1d232b)",
                  border: "1px solid var(--line, #d5dbe2)",
                  borderRadius: 6,
                  padding: "8px 10px",
                  fontSize: 14,
                  letterSpacing: "0.5px",
                }}
              >
                {accountLink.label}
              </a>
            ) : null}
            <button
              onClick={async () => {
                await signOut({ redirect: false });
                window.location.href = "/auth/signin";
              }}
              style={{
                color: "var(--ink, #1d232b)",
                background: "transparent",
                border: "1px solid var(--line, #d5dbe2)",
                borderRadius: 6,
                padding: "8px 10px",
                fontWeight: 600,
                fontSize: 14,
                letterSpacing: "0.5px",
                cursor: "pointer",
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <a
            href="/auth/signin"
            style={{
              fontWeight: 600,
              textDecoration: "none",
              color: "var(--ink, #1d232b)",
              border: "1px solid var(--line, #d5dbe2)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 14,
              letterSpacing: "0.5px",
            }}
          >
            Sign in
          </a>
        )}
      </div>
    </div>
  );
}
