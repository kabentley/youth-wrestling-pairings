"use client";

import { useEffect, useMemo, useState } from "react";

import { adjustTeamTextColor } from "@/lib/contrastText";
import { normalizeMeetPhase } from "@/lib/meetPhase";

type Match = {
  boutId: string;
  childId: string;
  opponentName: string;
  opponentTeam: string;
  opponentTeamColor?: string | null;
  mat: number | null;
  order: number | null;
};

type MeetGroup = {
  meet: {
    id: string;
    name: string;
    date: string;
    location?: string | null;
    status?: string | null;
    homeTeamId?: string | null;
    numMats?: number | null;
  };
  matches: Match[];
  children: Array<{
    childId: string;
    first: string;
    last: string;
    teamSymbol?: string | null;
    teamName: string;
    teamColor?: string | null;
  }>;
};

type CurrentUser = {
  id: string;
  name?: string | null;
  username: string;
  role: string;
  teamId?: string | null;
  staffMatNumber?: number | null;
};

function formatMeetDate(dateStr: string) {
  const iso = dateStr.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function boutNumber(mat?: number | null, order?: number | null) {
  if (!mat || !order) return "TBD";
  return `${mat}${String(Math.max(0, order - 1)).padStart(2, "0")}`;
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ParentTodayPage() {
  const [meetGroups, setMeetGroups] = useState<MeetGroup[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setMsg("");
      const res = await fetch("/api/parent/matches");
      const json = await res.json().catch(() => null);
      if (!active) return;
      if (!res.ok) {
        setMeetGroups([]);
        setCurrentUser(null);
        setMsg(json?.error ?? "Unable to load matches.");
        setLoaded(true);
        return;
      }
      setCurrentUser(json?.currentUser ?? null);
      setMeetGroups(Array.isArray(json?.meets) ? json.meets : []);
      setLoaded(true);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const upcomingGroups = useMemo(() => {
    const todayKey = localDateKey(new Date());
    return meetGroups
      .filter((group) => (
        normalizeMeetPhase(group.meet.status) === "PUBLISHED" &&
        group.meet.date.slice(0, 10) >= todayKey
      ))
      .sort((a, b) => a.meet.date.localeCompare(b.meet.date))
      .map((group) => {
        const wrestlerMatches = group.children
          .map((child) => ({
            child,
            matches: group.matches.filter((match) => match.childId === child.childId),
          }))
          .filter((entry) => entry.matches.length > 0);
        return {
          ...group,
          wrestlerMatches,
        };
      })
      .filter((group) => group.wrestlerMatches.some((entry) => entry.matches.length > 0));
  }, [meetGroups]);

  const volunteerMatNumber = useMemo(() => {
    if (!currentUser) return null;
    if (!["COACH", "TABLE_WORKER", "PARENT"].includes(currentUser.role)) return null;
    if (typeof currentUser.staffMatNumber !== "number" || currentUser.staffMatNumber < 1) return null;
    const appliesToMeet = upcomingGroups.some((group) => (
      group.meet.homeTeamId &&
      currentUser.teamId &&
      group.meet.homeTeamId === currentUser.teamId &&
      typeof group.meet.numMats === "number" &&
      currentUser.staffMatNumber <= group.meet.numMats
    ));
    return appliesToMeet ? currentUser.staffMatNumber : null;
  }, [currentUser, upcomingGroups]);

  const volunteerAssignmentLabel = useMemo(() => {
    if (!currentUser || volunteerMatNumber === null) return null;
    const displayName = currentUser.name?.trim() || currentUser.username;
    const action = currentUser.role === "COACH" ? "coach" : "help";
    return { displayName, action };
  }, [currentUser, volunteerMatNumber]);

  return (
    <main className="parent-today">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        .parent-today {
          min-height: 100vh;
          background:
            radial-gradient(circle at top right, rgba(30, 136, 229, 0.1), transparent 30%),
            linear-gradient(180deg, #eef3f7 0%, #f8fafc 100%);
          color: #1d232b;
          font-family: "Source Sans 3", Arial, sans-serif;
          padding: 24px 18px 40px;
        }
        .parent-today-shell {
          display: grid;
          gap: 18px;
        }
        .today-message {
          color: #b42318;
          font-weight: 700;
        }
        .today-assignment-card {
          background: linear-gradient(180deg, #eef7ff 0%, #f8fbff 100%);
          border: 1px solid #bfd6ee;
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.06);
          padding: 16px 18px;
          font-size: 18px;
          font-weight: 600;
          color: #14324d;
        }
        .today-assignment-mat {
          font-weight: 800;
        }
        .today-card {
          background: #ffffff;
          border: 1px solid #d9e1e8;
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          padding: 18px;
          display: grid;
          gap: 16px;
        }
        .today-meet-header {
          display: grid;
          gap: 6px;
        }
        .today-meet-label {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #586473;
        }
        .today-meet-name {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 28px;
          line-height: 1;
        }
        .today-meta {
          color: #586473;
          font-size: 17px;
        }
        .today-wrestler-list {
          display: grid;
          gap: 12px;
        }
        .today-wrestler-card {
          border: 1px solid #d9e1e8;
          border-radius: 14px;
          background: #fbfdff;
          padding: 14px;
          display: grid;
          gap: 10px;
        }
        .today-wrestler-name {
          font-size: 24px;
          font-weight: 800;
          line-height: 1.1;
        }
        .today-bouts {
          display: grid;
          gap: 8px;
        }
        .today-bouts-card {
          background: #ffffff;
          border: 1px solid #dfe5eb;
          border-radius: 12px;
          overflow: hidden;
        }
        .today-bout-row {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: nowrap;
          padding: 10px;
        }
        .today-bout-row + .today-bout-row {
          border-top: 1px solid #dfe5eb;
        }
        .today-bout-number {
          font-weight: 800;
          min-width: 64px;
          white-space: nowrap;
        }
        .today-bout-opponent {
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .today-bout-opponent-name {
          font-weight: 700;
        }
        @media (max-width: 640px) {
          .today-bout-row {
            gap: 6px;
            padding: 9px 8px;
          }
          .today-bout-number {
            min-width: 58px;
            font-size: 15px;
          }
          .today-bout-opponent {
            font-size: 15px;
          }
        }
      `}</style>
      <div className="parent-today-shell">
        {volunteerAssignmentLabel && (
          <div className="today-assignment-card">
            {volunteerAssignmentLabel.displayName} is assigned to {volunteerAssignmentLabel.action} on{" "}
            <span className="today-assignment-mat">Mat {volunteerMatNumber}</span>
          </div>
        )}
        {msg && <div className="today-message">{msg}</div>}
        {!loaded && !msg && <div>Loading...</div>}
        {loaded && !msg && upcomingGroups.length === 0 && (
          <div className="today-card">No published matches for your linked wrestlers in meets happening today or later.</div>
        )}

        {upcomingGroups.map((group) => (
          <section key={group.meet.id} className="today-card">
            <div className="today-meet-header">
              <div className="today-meet-label">
                Bouts for {(currentUser?.name?.trim() || currentUser?.username || "Parent")}'s{" "}
                {group.wrestlerMatches.length === 1 ? "wrestler" : "wrestlers"}:
              </div>
              <h2 className="today-meet-name">{group.meet.name}</h2>
              <div className="today-meta">{formatMeetDate(group.meet.date)}</div>
              <div className="today-meta">{group.meet.location ?? "Location TBD"}</div>
            </div>
            <div className="today-wrestler-list">
              {group.wrestlerMatches.map(({ child, matches }) => (
                <article key={`${group.meet.id}:${child.childId}`} className="today-wrestler-card">
                  <div
                    className="today-wrestler-name"
                    style={{ color: adjustTeamTextColor(child.teamColor) }}
                  >
                    {child.first} {child.last}
                    {child.teamSymbol ? ` (${child.teamSymbol})` : child.teamName ? ` (${child.teamName})` : ""}
                  </div>
                  <div className="today-bouts">
                    <div className="today-bouts-card">
                      {matches.map((match) => (
                        <div key={match.boutId} className="today-bout-row">
                          <div className="today-bout-number">Bout {boutNumber(match.mat, match.order)}</div>
                          <div className="today-bout-opponent">
                            <span
                              className="today-bout-opponent-name"
                              style={{ color: adjustTeamTextColor(match.opponentTeamColor) }}
                            >
                              {match.opponentName}
                            </span>
                            {match.opponentTeam ? ` (${match.opponentTeam})` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
