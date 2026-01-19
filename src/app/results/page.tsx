"use client";

import { useEffect, useState } from "react";

import AppHeader from "@/components/AppHeader";

type Team = { id: string; name: string; symbol: string; color: string };
type Meet = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  status?: "DRAFT" | "PUBLISHED";
  meetTeams: { team: Team }[];
};

export default function ResultsLandingPage() {
  const [meets, setMeets] = useState<Meet[]>([]);
  const [msg, setMsg] = useState("");
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/results", label: "Enter Results", roles: ["TABLE_WORKER", "COACH", "ADMIN"] as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/account", label: "Account" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  useEffect(() => {
    let active = true;
    async function load() {
      setMsg("");
      const [meRes, meetsRes] = await Promise.all([
        fetch("/api/me"),
        fetch("/api/meets"),
      ]);
      if (!active) return;
      const meJson = meRes.ok ? await meRes.json().catch(() => ({})) : {};
      const role = String(meJson?.role ?? "");
      const allowed = role === "TABLE_WORKER" || role === "COACH" || role === "ADMIN";
      if (!allowed) {
        setMsg("You are not authorized to enter results.");
        setMeets([]);
        return;
      }
      if (!meetsRes.ok) {
        setMsg("Unable to load meets.");
        setMeets([]);
      } else {
        const json = await meetsRes.json().catch(() => []);
        let list = Array.isArray(json) ? json : [];
        if (role === "COACH" || role === "TABLE_WORKER") {
          const teamId = String(meJson?.teamId ?? "");
          if (teamId) {
            list = list.filter((meet: Meet) =>
              meet.meetTeams.some(mt => mt.team.id === teamId),
            );
          } else {
            list = [];
          }
        }
        list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setMeets(list);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  return (
    <main className="results">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        :root {
          --bg: #eef1f4;
          --card: #ffffff;
          --ink: #1d232b;
          --muted: #5a6673;
          --accent: #1e88e5;
          --line: #d5dbe2;
        }
        .results {
          font-family: "Source Sans 3", Arial, sans-serif;
          color: var(--ink);
          background: var(--bg);
          min-height: 100vh;
          padding: 28px 22px 40px;
        }
        .grid {
          display: grid;
          gap: 16px;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        }
        .card {
          background: var(--card);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 16px;
          display: grid;
          gap: 10px;
        }
        .card-title {
          font-weight: 700;
          font-size: 18px;
          margin: 0;
        }
        .meta {
          color: var(--muted);
          font-size: 13px;
        }
        .teams {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .team-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid var(--line);
          border-radius: 999px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 600;
        }
        .team-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          display: inline-block;
        }
        .btn {
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 8px 12px;
          font-weight: 700;
          background: #ffffff;
          cursor: pointer;
          text-decoration: none;
          color: var(--ink);
          display: inline-flex;
          align-items: center;
          justify-content: center;
        }
        .btn:hover {
          border-color: var(--accent);
          color: var(--accent);
        }
      `}</style>
      <AppHeader links={headerLinks} />

      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="grid">
        {meets.map(meet => (
          <div key={meet.id} className="card">
            <h2 className="card-title">{meet.name || "Untitled meet"}</h2>
            <div className="meta">
              {new Date(meet.date).toLocaleDateString()} {meet.location ? `- ${meet.location}` : ""}
            </div>
            <div className="teams">
              {meet.meetTeams.map(mt => (
                <span key={mt.team.id} className="team-pill">
                  <span className="team-dot" style={{ background: mt.team.color }} />
                  {mt.team.symbol || mt.team.name}
                </span>
              ))}
            </div>
            <a className="btn" href={`/results/${meet.id}`}>Enter Results</a>
          </div>
        ))}
        {meets.length === 0 && (
          <div className="card">
            <h2 className="card-title">No meets yet</h2>
            <div className="meta">When meets are scheduled, they will appear here.</div>
          </div>
        )}
      </div>
    </main>
  );
}
