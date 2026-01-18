"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type Role = "PARENT" | "COACH" | "ADMIN" | "TABLE_WORKER";
/** Single navigation item displayed in the header. */
type LinkItem = { href: string; label: string; minRole?: Role; roles?: readonly Role[] };
/** Props for the global app header. */
type Props = { links: LinkItem[]; hideTeamSelector?: boolean };

const roleOrder: Record<Role, number> = { PARENT: 0, TABLE_WORKER: 0, COACH: 1, ADMIN: 2 };
const coachNavLink: LinkItem = { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" };

/**
 * Top navigation bar shown on most pages.
 *
 * Responsibilities:
 * - Loads the current user summary via `/api/me` for role-aware navigation.
 * - Shows a team switcher for admins (used to impersonate/act as a team).
 * - Provides sign-out via NextAuth.
 */
export default function AppHeader({ links, hideTeamSelector }: Props) {
  const [user, setUser] = useState<{
    username: string;
    role: Role;
    teamId?: string | null;
    team?: { name?: string | null; symbol?: string | null; color?: string | null } | null;
    teamLogoUrl?: string | null;
  } | null>(null);
  const [teamOptions, setTeamOptions] = useState<{ id: string; name: string; symbol?: string | null; color?: string | null }[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [updatingTeam, setUpdatingTeam] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const res = await fetch("/api/me");
      const json = res.ok ? await res.json() : null;
      if (!active || !json?.username || !json?.role) return;
        setUser({
          username: json.username,
          role: json.role,
          teamId: json.teamId ?? null,
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

  useEffect(() => {
    if (user?.role !== "ADMIN") {
      setTeamOptions([]);
      return;
    }
    let active = true;
    setLoadingTeams(true);
    fetch("/api/teams")
      .then(res => res.ok ? res.json() : [])
      .then(data => {
        if (!active) return;
        const list = Array.isArray(data) ? data : [];
        setTeamOptions(list.map((team: any) => ({
          id: team.id,
          name: team.name,
          symbol: team.symbol,
          color: team.color,
        })));
      })
      .catch(() => {
        // ignore
      })
      .finally(() => {
        if (active) setLoadingTeams(false);
      });
    return () => { active = false; };
  }, [user?.role]);

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
            {user.role === "ADMIN" && teamOptions.length > 0 && !hideTeamSelector && (
              <select
                className="app-header-select"
                value={user.teamId ?? ""}
                onChange={(e) => {
                  const nextTeamId = e.target.value;
                  if (!nextTeamId) return;
                  setUpdatingTeam(true);
                  fetch("/api/account", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ teamId: nextTeamId }),
                  })
                    .then(res => {
                      if (!res.ok) throw new Error("Failed");
                      return res.json();
                    })
                    .then(() => {
                      const nextTeam = teamOptions.find(option => option.id === nextTeamId);
                      setUser(prev => prev ? {
                        ...prev,
                        teamId: nextTeamId,
                        team: nextTeam ?? prev.team,
                      } : prev);
                      window.location.reload();
                    })
                    .catch(() => {
                      // ignore
                    })
                    .finally(() => {
                      setUpdatingTeam(false);
                    });
                }}
                disabled={loadingTeams || updatingTeam}
              >
                <option value="">Change team</option>
                {teamOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.symbol ? `${option.symbol} – ${option.name}` : option.name}
                  </option>
                ))}
              </select>
            )}
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
