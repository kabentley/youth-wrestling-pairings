"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

import { formatTeamName } from "@/lib/formatTeamName";

type Role = "PARENT" | "COACH" | "ADMIN" | "TABLE_WORKER";
/** Single navigation item displayed in the header. */
type LinkItem = { href: string; label: string; minRole?: Role; roles?: readonly Role[] };
/** Props for the global app header. */
type Props = {
  links: LinkItem[];
  hideTeamSelector?: boolean;
  leagueLogoSrc?: string | null;
  leagueName?: string;
  hideLeagueBrand?: boolean;
  disableCoachShortcut?: boolean;
};

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
export default function AppHeader({
  links,
  hideTeamSelector,
  leagueLogoSrc,
  leagueName,
  hideLeagueBrand = false,
  disableCoachShortcut = false,
}: Props) {
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
        const sorted = [...list].sort((a: any, b: any) => {
          const aSymbol = String(a?.symbol ?? "").toLowerCase();
          const bSymbol = String(b?.symbol ?? "").toLowerCase();
          if (aSymbol && bSymbol) {
            const symbolCompare = aSymbol.localeCompare(bSymbol);
            if (symbolCompare !== 0) return symbolCompare;
          } else if (aSymbol || bSymbol) {
            return aSymbol ? -1 : 1;
          }
          const aName = String(a?.name ?? "").toLowerCase();
          const bName = String(b?.name ?? "").toLowerCase();
          return aName.localeCompare(bName);
        });
        setTeamOptions(sorted.map((team: any) => ({
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

  const allLinks = disableCoachShortcut
    ? links
    : links.some((link) => link.href === coachNavLink.href)
      ? links
      : [...links, coachNavLink];

  const [leagueInfo, setLeagueInfo] = useState<{ name: string | null; hasLogo: boolean }>({
    name: null,
    hasLogo: false,
  });

  useEffect(() => {
    let active = true;
    fetch("/api/league")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setLeagueInfo({ name: data.name ?? null, hasLogo: Boolean(data.hasLogo) });
      })
      .catch(() => {
        // ignore
      });
    return () => {
      active = false;
    };
  }, []);

  const brandName = leagueName ?? leagueInfo.name ?? undefined;
  const brandLogoSrc = leagueLogoSrc ?? (leagueInfo.hasLogo ? "/api/league/logo/file" : null);
  const showBrand = hideLeagueBrand ? false : Boolean(brandLogoSrc ?? brandName);

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
  const mainLinks = (
    accountLink
      ? visibleLinks.filter(link => link.href !== "/account" && link.href !== "/parent")
      : visibleLinks.filter(link => link.href !== "/parent")
  ).filter(link => link.href !== "/");

  return (
    <div className="app-header">
      <style>{`
        .app-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          border-bottom: 1px solid #d5dbe2;
          padding-bottom: 12px;
        }
        .app-header-left {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .app-header-link {
          color: #1d232b;
          text-decoration: none;
          font-size: 14px;
          font-weight: 600;
          border: 1px solid transparent;
          padding: 6px 10px;
          border-radius: 6px;
        }
        .app-header-link:hover {
          border-color: #d5dbe2;
          background: #f7f9fb;
        }
        .app-header-brand {
          display: flex;
          align-items: center;
          gap: 6px;
          padding-right: 8px;
          margin-right: 6px;
          border-right: 1px solid #d5dbe2;
          text-decoration: none;
          cursor: pointer;
        }
        .app-header-brand-logo,
        .app-header-brand-placeholder {
          width: 40px;
          height: 40px;
          border-radius: 8px;
          object-fit: contain;
          background: #fff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 700;
          color: #5a6673;
          border: 1px solid #d5dbe2;
        }
        .app-header-brand-name {
          font-size: 15px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          color: #1d232b;
        }
        .app-header-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .app-header-btn {
          border: 1px solid #d5dbe2;
          background: transparent;
          color: #1d232b;
          padding: 6px 12px;
          border-radius: 6px;
          font-weight: 600;
          cursor: pointer;
        }
        .app-header-team-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 6px;
          border: 1px solid #d5dbe2;
          border-radius: 999px;
          font-size: 12px;
        }
        .app-header-team-logo {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          object-fit: cover;
        }
        .app-header-team-name span:first-child {
          margin-right: 4px;
        }
        .app-header-select {
          border-radius: 6px;
          border: 1px solid #d5dbe2;
          padding: 4px 8px;
          font-size: 12px;
        }
        @media (max-width: 1600px) {
          .app-header {
            gap: 8px;
            padding-bottom: 8px;
          }
          .app-header-left {
            gap: 8px;
            flex-wrap: wrap;
          }
          .app-header-link {
            font-size: 12px;
            padding: 4px 8px;
          }
          .app-header-brand {
            gap: 4px;
            padding-right: 6px;
            margin-right: 4px;
          }
          .app-header-brand-logo,
          .app-header-brand-placeholder {
            width: 32px;
            height: 32px;
          }
          .app-header-brand-name {
            font-size: 12px;
            letter-spacing: 0.3px;
          }
          .app-header-actions {
            gap: 6px;
            flex-wrap: wrap;
          }
          .app-header-btn {
            padding: 4px 10px;
            font-size: 12px;
          }
          .app-header-team-chip {
            font-size: 11px;
          }
          .app-header-team-logo {
            width: 18px;
            height: 18px;
          }
          .app-header-select {
            font-size: 11px;
            padding: 4px 6px;
          }
        }
      `}</style>
      <div className="app-header-left">
        {showBrand && (
          <a href="/" className="app-header-brand">
            {brandLogoSrc ? (
              <img src={brandLogoSrc} alt={`${brandName ?? "League"} logo`} className="app-header-brand-logo" />
            ) : (
              <span className="app-header-brand-placeholder" aria-hidden="true">
                {brandName ? brandName[0] : "L"}
              </span>
            )}
            {brandName && <span className="app-header-brand-name">{brandName}</span>}
          </a>
        )}
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
                    {formatTeamName(user.team)}
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
                    {formatTeamName(option)}
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
