"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Role = "PARENT" | "COACH" | "ADMIN";
type LinkItem = { href: string; label: string; minRole?: Role };

const roleOrder: Record<Role, number> = { PARENT: 0, COACH: 1, ADMIN: 2 };

export default function AppHeader({ links }: { links: LinkItem[] }) {
  const [user, setUser] = useState<{ username: string; role: Role; team?: string | null; teamLogoUrl?: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/me")
      .then(res => (res.ok ? res.json() : null))
      .then(json => {
        if (!active || !json?.username || !json?.role) return;
        setUser({
          username: json.username,
          role: json.role,
          team: json.team ?? null,
          teamLogoUrl: json.teamLogoUrl ?? null,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  if (!user) return null;

  const visibleLinks = links.filter(link => {
    if (!link.minRole) return true;
    return roleOrder[user.role] >= roleOrder[link.minRole];
  });

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
        {visibleLinks.map(link => (
          <a key={link.href} href={link.href} style={{ fontWeight: 600, textDecoration: "none", color: "var(--ink, #1d232b)" }}>
            {link.label}
          </a>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13, fontWeight: 600 }}>
          <span>User: {user.username}, Role: {user.role}{user.team ? `, Team: ${user.team}` : ""}</span>
          {user.teamLogoUrl ? (
            <img
              src={user.teamLogoUrl}
              alt="Team logo"
              style={{ width: 18, height: 18, objectFit: "contain" }}
            />
          ) : null}
        </div>
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
      </div>
    </div>
  );
}
