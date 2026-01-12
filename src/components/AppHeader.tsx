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
    <div className="app-header">
      <div className="app-header-left">
        {mainLinks.map(link => (
          <a key={link.href} href={link.href} className="app-header-link">
            {link.label}
          </a>
        ))}
      </div>
      <div className="app-header-actions">
        {user ? (
          <>
            <div className="app-header-user-info">
              <span>
                User: {user.username}, Role: {user.role}
              </span>
              {user.team ? (
                <span className="app-header-team-chip">
                  {user.teamLogoUrl ? (
                    <img
                      src={user.teamLogoUrl}
                      alt={`${user.team.name ?? "Team"} logo`}
                      className="app-header-team-logo"
                    />
                  ) : (
                    <span
                      className="app-header-team-logo"
                      style={{ background: user.team.color ?? "#ccc" }}
                    />
                  )}
                  <span className="app-header-team-name">
                    <span>{user.team.symbol ?? ""}</span>
                    <span>{user.team.name}</span>
                  </span>
                </span>
              ) : null}
            </div>
            {myWrestlersLink ? (
              <a href={myWrestlersLink.href} className="app-header-link">
                {myWrestlersLink.label}
              </a>
            ) : null}
            {accountLink ? (
              <a href={accountLink.href} className="app-header-link">
                {accountLink.label}
              </a>
            ) : null}
            <button
              onClick={async () => {
                await signOut({ redirect: false });
                window.location.href = "/auth/signin";
              }}
              className="app-header-btn"
            >
              Sign out
            </button>
          </>
        ) : (
          <a href="/auth/signin" className="app-header-link">
            Sign in
          </a>
        )}
      </div>
    </div>
  );
}
