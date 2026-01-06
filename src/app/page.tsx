import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const league = await db.league.findFirst({ select: { name: true, logoData: true } });
  const teamName = session && (session.user as any)?.role === "COACH" && (session.user as any)?.teamId
    ? (await db.team.findUnique({ where: { id: (session.user as any).teamId }, select: { symbol: true, name: true } }))
    : null;
  const trimmedLeagueName = league?.name?.trim();
  const leagueName = trimmedLeagueName ?? "Wrestling Scheduler";
  const hasLeagueLogo = Boolean(league?.logoData);

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
        .brand {
          display: flex;
          align-items: center;
          gap: 14px;
        }
        .logo {
          width: 56px;
          height: 56px;
          object-fit: contain;
        }
        .title {
          font-family: "Oswald", Arial, sans-serif;
          font-size: clamp(26px, 3vw, 38px);
          letter-spacing: 0.5px;
          margin: 0;
          text-transform: uppercase;
        }
        .tagline {
          color: var(--muted);
          font-size: 13px;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 1.6px;
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
        .hero {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
          gap: 18px;
          align-items: stretch;
        }
        .hero-card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 18px;
          box-shadow: 0 10px 24px rgba(0,0,0,0.08);
        }
        .hero-title {
          font-family: "Oswald", Arial, sans-serif;
          font-size: clamp(30px, 4.2vw, 52px);
          margin: 0 0 8px;
          text-transform: uppercase;
          line-height: 1.05;
        }
        .hero-sub {
          color: var(--muted);
          font-size: 16px;
          line-height: 1.5;
          margin: 0 0 14px;
        }
        .cta-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .btn {
          display: inline-block;
          text-decoration: none;
          color: #ffffff;
          background: var(--accent);
          padding: 10px 14px;
          border-radius: 4px;
          font-weight: 700;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          font-size: 13px;
        }
        .btn.secondary {
          background: transparent;
          color: var(--ink);
          border: 1px solid var(--line);
        }
        .side {
          display: grid;
          gap: 12px;
        }
        .panel {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 14px;
          background: var(--card);
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
        @media (max-width: 900px) {
          .hero {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <header className="mast">
        <div className="brand">
          {hasLeagueLogo ? (
            <img className="logo" src="/api/league/logo/file" alt="League logo" />
          ) : null}
          <div>
            <h1 className="title">{leagueName}</h1>
            <div className="tagline">Wrestling scheduling and pairing control</div>
          </div>
        </div>
        <nav className="nav">
          <Link href="/teams">Teams</Link>
          <Link href="/meets">Meets</Link>
          <Link href="/parent">My Wrestlers</Link>
          {(session?.user as any)?.role === "ADMIN" ? <Link href="/admin">Admin</Link> : null}
          {session ? (
            <form action="/api/auth/signout" method="post">
              <input type="hidden" name="callbackUrl" value="/auth/signin" />
              <button className="nav-btn" type="submit">Sign out</button>
            </form>
          ) : (
            <>
              <Link href="/auth/signin">Sign in</Link>
              <Link href="/auth/signup">Create account</Link>
            </>
          )}
        </nav>
      </header>

      <section className="hero">
        <div className="hero-card">
          <div className="status"><strong>LEAGUE NEWS</strong> Latest updates</div>
          <h2 className="hero-title">League News</h2>
          <p className="hero-sub">
            Post announcements, schedule updates, and meet reminders here.
            Keep coaches, parents, and athletes aligned at a glance.
          </p>
          {session ? (
            <div className="cta-row">
              <Link className="btn" href="/meets">View Meets</Link>
              <Link className="btn secondary" href="/teams">Teams</Link>
            </div>
          ) : null}
        </div>

        <div className="side">
          <div className="panel">
            <h3>Pairings engine</h3>
            <p>Smart candidate lists, first-year rules, and same-team fallbacks when needed.</p>
          </div>
          <div className="panel">
            <h3>Mat control</h3>
            <p>Drag, reorder, and highlight conflicts in real time with a clean board view.</p>
          </div>
          {session ? (
            <div className="panel">
              <h3>Signed in</h3>
              <p>Account: <strong>{session.user?.username}</strong></p>
              <p>
                Role: <strong>{(session.user as any)?.role ?? "User"}</strong>
                {(session.user as any)?.role === "COACH" ? (
                  <> — Team: <strong>{teamName ? `${teamName.name ?? "Unassigned"} (${teamName.symbol ?? "?"})` : "Unassigned"}</strong></>
                ) : null}
              </p>
            </div>
          ) : (
            <div className="panel">
              <h3>Start here</h3>
              <p>Create a league profile, then add teams and wrestlers.</p>
            </div>
          )}
        </div>
      </section>

      <section className="grid">
        <div className="card">
          <h4>Meet HQ</h4>
          <p>Generate pairings, set constraints, and run match boards in one place.</p>
        </div>
        <div className="card">
          <h4>Parents view</h4>
          <p>Parents can see their child match lists and results without extra steps.</p>
        </div>
        <div className="card">
          <h4>Print and wall</h4>
          <p>Wall chart and print layouts are ready for the gym in seconds.</p>
        </div>
      </section>
    </main>
  );
}
