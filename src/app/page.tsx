import { redirect } from "next/navigation";
import { getServerSession } from "next-auth/next";

import AppHeader from "@/components/AppHeader";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session) {
    redirect("/auth/signin");
  }
  const league = await db.league.findFirst({ select: { name: true, logoData: true, website: true } });
  const userId = (session.user as any)?.id ?? null;
  const userWithTeam =
    userId && typeof userId === "string"
      ? await db.user.findUnique({
          where: { id: userId },
          select: { team: { select: { symbol: true, name: true, website: true } } },
        })
      : null;
  const teamInfo = userWithTeam?.team ?? null;
  const leagueName = league?.name?.trim() ?? "Wrestling Scheduler";
  const leagueLogoSrc = league?.logoData ? "/api/league/logo/file" : null;
  const leagueWebsite = league?.website?.trim() ?? null;
  const leagueNewsUrl = leagueWebsite ? leagueWebsite.replace(/\/$/, "") : null;
  const teamLabel = teamInfo?.symbol ? `${teamInfo.symbol} ${teamInfo.name}` : teamInfo?.name ?? "";
  const teamWebsiteUrl = teamInfo?.website ? teamInfo.website.replace(/\/$/, "") : null;
  const headerLinks = [
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/account", label: "Account" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  return (
    <main className="home">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --brand: #0d3b66;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .home {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .mast {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border-bottom: 1px solid var(--line);
          padding-bottom: 14px;
          margin-bottom: 18px;
        }
        .nav {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          align-items: center;
        }
        .nav a {
          color: var(--ink);
          text-decoration: none;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: 6px;
        }
        .nav-btn {
          color: var(--ink);
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 8px 10px;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.5px;
          cursor: pointer;
        }
        .nav-btn:hover {
          background: #f7f9fb;
        }
        .nav a:hover {
          border-color: var(--line);
          background: #f7f9fb;
        }
        .panel h3 {
          margin: 0 0 8px;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          font-size: 18px;
        }
        .panel p {
          margin: 0;
          color: var(--muted);
          font-size: 14px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 12px;
          margin-top: 18px;
        }
        .hero-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: minmax(0, 1fr);
          margin-bottom: 16px;
        }
        .hero-card,
        .side-panel {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--card);
          padding: 18px;
        }
        .hero-card h2,
        .side-panel h3 {
          margin: 0 0 12px;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .btn.secondary {
          background: transparent;
          border: 1px solid var(--line);
          border-radius: 6px;
          padding: 6px 10px;
          text-transform: uppercase;
          font-weight: 600;
          color: var(--ink);
        }
        .btn.secondary:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
        .news-frame {
          margin-top: 12px;
          border-radius: 8px;
          overflow: hidden;
          min-height: 220px;
          border: 1px solid var(--line);
          background: #fff;
        }
        .news-frame iframe {
          width: 100%;
          height: 320px;
          border: none;
        }
        .card {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          background: var(--card);
        }
        .card h4 {
          margin: 0 0 6px;
          font-family: "Oswald", Arial, sans-serif;
          font-size: 16px;
          text-transform: uppercase;
        }
        .card p {
          margin: 0;
          color: var(--muted);
          font-size: 13px;
        }
        .status {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 999px;
          border: 1px solid var(--line);
          font-size: 12px;
          color: var(--muted);
        }
        .status strong {
          color: var(--ink);
        }
        @media (max-width: 940px) {
          .hero-card,
          .side-panel {
            width: 100%;
          }
        }
      `}</style>

      <header className="mast">
        <AppHeader
          links={headerLinks}
          leagueLogoSrc={leagueLogoSrc}
          leagueName={leagueName}
        />
      </header>

      <section className="hero-grid">
        <div className="hero-card">
          <h2>League News</h2>
          {leagueNewsUrl ? (
            <div className="news-frame">
              <iframe title="League news" src={leagueNewsUrl} />
            </div>
          ) : (
            <p className="muted">No league news available yet.</p>
          )}
        </div>
        <div className="side-panel">
          <div className="panel-head">
            <h3>Team News</h3>
            {teamWebsiteUrl ? (
              <a
                className="btn secondary"
                href={teamWebsiteUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Visit site
              </a>
            ) : (
              <span className="btn secondary" aria-disabled="true" style={{ cursor: "default" }}>
                No website yet
              </span>
            )}
          </div>
            <p>
              {teamWebsiteUrl
                ? `Latest updates for ${teamLabel}.`
                : `Updates for ${teamLabel || "your team"} will appear here once a website is published.`}
            </p>
          <div className="news-frame">
            {teamWebsiteUrl ? (
              <iframe title="Team news" src={teamWebsiteUrl} />
            ) : (
              <div className="muted" style={{ padding: 20 }}>
                No team news iframe available.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
