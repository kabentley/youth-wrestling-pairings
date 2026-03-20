"use client";

import Link from "next/link";
import { useMemo } from "react";

import { adjustTeamTextColor } from "@/lib/contrastText";
import { normalizeMeetPhase } from "@/lib/meetPhase";

export type ParentTodayMatch = {
  boutId: string;
  childId: string;
  opponentName: string;
  opponentTeam: string;
  opponentTeamColor?: string | null;
  mat: number | null;
  order: number | null;
};

export type ParentTodayMeetGroup = {
  meet: {
    id: string;
    name: string;
    date: string;
    location?: string | null;
    status?: string | null;
    homeTeamId?: string | null;
    numMats?: number | null;
  };
  matches: ParentTodayMatch[];
  children: Array<{
    childId: string;
    first: string;
    last: string;
    teamSymbol?: string | null;
    teamName: string;
    teamColor?: string | null;
    attendanceStatus?: "COMING" | "NOT_COMING" | "ABSENT" | null;
    teamCheckinCompleted?: boolean;
  }>;
};

export type ParentTodayCurrentUser = {
  id: string;
  name?: string | null;
  username: string;
  role: string;
  teamId?: string | null;
  staffMatNumber?: number | null;
};

type ParentTodayMeetCardsProps = {
  meetGroups: ParentTodayMeetGroup[];
  currentUser: ParentTodayCurrentUser | null;
  msg?: string;
  loaded?: boolean;
  title?: string;
  showEmptyState?: boolean;
  emptyMessage?: string;
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

export default function ParentTodayMeetCards({
  meetGroups,
  currentUser,
  msg = "",
  loaded = true,
  title,
  showEmptyState = true,
  emptyMessage = "No matches for your linked wrestlers in meets happening today or later.",
}: ParentTodayMeetCardsProps) {
  const upcomingGroups = useMemo(() => {
    const todayKey = localDateKey(new Date());
    return meetGroups
      .filter((group) => (
        (normalizeMeetPhase(group.meet.status) === "PUBLISHED" || normalizeMeetPhase(group.meet.status) === "READY_FOR_CHECKIN") &&
        group.meet.date.slice(0, 10) >= todayKey
      ))
      .sort((a, b) => a.meet.date.localeCompare(b.meet.date))
      .map((group) => {
        const wrestlerMatches = group.children
          .map((child) => ({
            child,
            matches: group.matches.filter((match) => match.childId === child.childId),
          }));
        return {
          ...group,
          wrestlerMatches,
        };
      })
      .filter((group) => {
        return group.wrestlerMatches.length > 0;
      });
  }, [meetGroups]);

  const volunteerMatNumber = useMemo(() => {
    if (!currentUser) return null;
    if (!["COACH", "TABLE_WORKER", "PARENT"].includes(currentUser.role)) return null;
    const staffMatNumber = currentUser.staffMatNumber;
    if (typeof staffMatNumber !== "number" || staffMatNumber < 1) return null;
    const appliesToMeet = upcomingGroups.some((group) => (
      group.meet.homeTeamId &&
      currentUser.teamId &&
      group.meet.homeTeamId === currentUser.teamId &&
      typeof group.meet.numMats === "number" &&
      staffMatNumber <= group.meet.numMats
    ));
    return appliesToMeet ? staffMatNumber : null;
  }, [currentUser, upcomingGroups]);

  const volunteerAssignmentLabel = useMemo(() => {
    if (!currentUser || volunteerMatNumber === null) return null;
    const trimmedCurrentUserName = currentUser.name?.trim();
    const displayName = trimmedCurrentUserName && trimmedCurrentUserName.length > 0
      ? trimmedCurrentUserName
      : currentUser.username;
    const action = currentUser.role === "COACH" ? "coach" : "help";
    return { displayName, action };
  }, [currentUser, volunteerMatNumber]);

  const trimmedCurrentUserName = currentUser?.name?.trim();
  const parentDisplayName = trimmedCurrentUserName && trimmedCurrentUserName.length > 0
    ? trimmedCurrentUserName
    : (currentUser?.username ?? "Parent");
  const meetCards = upcomingGroups.map((group) => {
    const meetPhase = normalizeMeetPhase(group.meet.status);
    const showVolunteerAssignment = Boolean(
      volunteerAssignmentLabel &&
      currentUser?.teamId &&
      group.meet.homeTeamId === currentUser.teamId &&
      typeof group.meet.numMats === "number" &&
      volunteerMatNumber !== null &&
      volunteerMatNumber <= group.meet.numMats,
    );
    const showCheckinMessage = meetPhase === "READY_FOR_CHECKIN";
    const allChildrenCheckedIn = showCheckinMessage && group.wrestlerMatches.length > 0 && group.wrestlerMatches.every(
      ({ child }) => child.teamCheckinCompleted === true,
    );
    return (
      <section key={group.meet.id} className="today-card">
        <div className="today-meet-header">
          <div className="today-meet-header-top">
            <h2 className="today-meet-name">{group.meet.name}</h2>
            <Link href="/parent" className="today-header-link">My Wrestlers</Link>
          </div>
          <div className="today-meta">{formatMeetDate(group.meet.date)}</div>
          <div className="today-meta">{group.meet.location ?? "Location TBD"}</div>
        </div>
        {showCheckinMessage && (
          <div className="today-checkin-note">
            {allChildrenCheckedIn
              ? "Your team has completed check-in. Coaches are dealing with rescheduling matches for scratches."
              : "Coaches are checking in wrestlers to make sure everyone is here. Please make sure you check in."}
          </div>
        )}
        {showVolunteerAssignment && volunteerAssignmentLabel && (
          <div className="today-assignment-card">
            {volunteerAssignmentLabel.displayName} is assigned to {volunteerAssignmentLabel.action} on{" "}
            <span className="today-assignment-mat">Mat {volunteerMatNumber}</span>
          </div>
        )}
        {showCheckinMessage ? (
          <div className="today-meet-label">
            {allChildrenCheckedIn ? "Check-in status" : "Attendance"} for {parentDisplayName}'s {group.wrestlerMatches.length === 1 ? "wrestler" : "wrestlers"}:
          </div>
        ) : (
          <div className="today-meet-label">
            {meetPhase === "PUBLISHED" ? "Bouts and status" : "Bouts"} for {parentDisplayName}'s {group.wrestlerMatches.length === 1 ? "wrestler" : "wrestlers"}:
          </div>
        )}
        <div className="today-wrestler-list">
          {group.wrestlerMatches.map(({ child, matches }) => {
            const attendanceStatus = child.attendanceStatus ?? null;
            const showPublishedStatus = meetPhase === "PUBLISHED" && matches.length === 0;
            const isScratchedAfterCheckin =
              child.teamCheckinCompleted === true &&
              attendanceStatus === "ABSENT";
            const checkinBadge = child.teamCheckinCompleted
              ? attendanceStatus === "COMING"
                ? { label: "Checked In", className: "checked-in" }
                : isScratchedAfterCheckin
                  ? { label: "Scratched", className: "scratched" }
                : { label: "Not Attending", className: "not-coming" }
              : attendanceStatus === "COMING"
                ? { label: "Attending", className: "coming" }
                : attendanceStatus === "ABSENT"
                  ? { label: "Scratched", className: "scratched" }
                : attendanceStatus === "NOT_COMING"
                  ? { label: "Not Coming", className: "not-coming" }
                  : { label: "No Reply", className: "no-reply" };
            return (
              <article key={`${group.meet.id}:${child.childId}`} className="today-wrestler-card">
                <div className="today-wrestler-header">
                  <div
                    className="today-wrestler-name"
                    style={{ color: adjustTeamTextColor(child.teamColor) }}
                  >
                    {child.first} {child.last}
                    {child.teamSymbol ? ` (${child.teamSymbol})` : child.teamName ? ` (${child.teamName})` : ""}
                  </div>
                  {(showCheckinMessage || showPublishedStatus) && (
                    <span className={`today-attendance-badge ${checkinBadge.className}`}>
                      {checkinBadge.label}
                    </span>
                  )}
                </div>
                {showCheckinMessage && isScratchedAfterCheckin && (
                  <div className="today-scratch-note">
                    If your wrestler is really at the gym, find a coach right away.
                  </div>
                )}
                {!showCheckinMessage && matches.length > 0 && (
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
                )}
                {showPublishedStatus && (
                  <div className="today-meta">No bout assigned for this wrestler.</div>
                )}
              </article>
            );
          })}
        </div>
      </section>
    );
  });

  if (!showEmptyState && !msg && loaded && upcomingGroups.length === 0) {
    return null;
  }

  return (
    <section className="parent-today-panel">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        .parent-today-panel {
          color: #1d232b;
          font-family: "Source Sans 3", Arial, sans-serif;
        }
        .parent-today-shell {
          display: grid;
          gap: 18px;
        }
        .today-section-title {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: 32px;
          line-height: 1;
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
        .today-checkin-note {
          border-radius: 12px;
          background: #fff8de;
          border: 1px solid #ead59a;
          padding: 10px 12px;
          font-weight: 700;
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
        .today-empty-card {
          gap: 14px;
        }
        .today-empty-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .today-empty-message {
          color: #586473;
          font-size: 17px;
          line-height: 1.4;
        }
        .today-meet-header {
          display: grid;
          gap: 6px;
        }
        .today-meet-header-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
        }
        .today-header-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 40px;
          padding: 8px 14px;
          border-radius: 999px;
          border: 1px solid #c9d7e5;
          background: #f8fbff;
          color: #1e4f7a;
          font-size: 15px;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
        }
        .today-header-link:hover {
          border-color: #1e88e5;
          color: #155a9c;
          background: #eef6ff;
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
        .today-wrestler-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .today-wrestler-name {
          font-size: 24px;
          font-weight: 800;
          line-height: 1.1;
        }
        .today-attendance-badge {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 14px;
          font-weight: 800;
          line-height: 1;
          border: 1px solid #d5dbe2;
          background: #fff;
          color: #1d232b;
        }
        .today-attendance-badge.coming {
          background: #e6f6ea;
          border-color: #b8ddc0;
        }
        .today-attendance-badge.not-coming {
          background: #eeeeee;
          border-color: #c7c7c7;
        }
        .today-attendance-badge.no-reply {
          background: #fff8de;
          border-color: #ead59a;
        }
        .today-attendance-badge.checked-in {
          background: #e6f6ea;
          border-color: #b8ddc0;
        }
        .today-attendance-badge.not-checked-in {
          background: #fff5f4;
          border-color: #f0b3ad;
        }
        .today-attendance-badge.scratched {
          background: #fff5f4;
          border-color: #f0b3ad;
        }
        .today-scratch-note {
          border-radius: 12px;
          background: #fff5f4;
          border: 1px solid #f0b3ad;
          padding: 10px 12px;
          font-weight: 700;
          color: #b42318;
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
        {title && upcomingGroups.length > 0 && <h2 className="today-section-title">{title}</h2>}
        {msg && <div className="today-message">{msg}</div>}
        {!loaded && !msg && <div>Loading...</div>}
        {loaded && !msg && upcomingGroups.length === 0 && showEmptyState && (
          <div className="today-card today-empty-card">
            <div className="today-empty-card-top">
              <div className="today-empty-message">{emptyMessage}</div>
              <Link href="/parent" className="today-header-link">My Wrestlers</Link>
            </div>
          </div>
        )}
        {meetCards}
      </div>
    </section>
  );
}
