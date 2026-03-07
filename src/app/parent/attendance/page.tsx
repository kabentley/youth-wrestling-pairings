"use client";

import { useEffect, useState } from "react";

type ParentAttendanceStatus = "COMING" | "NOT_COMING" | null;

type AttendanceMeet = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  homeTeam?: string | null;
  headCoachName?: string | null;
  attendanceDeadline?: string | null;
  status?: string | null;
  canEditAttendance: boolean;
  children: Array<{
    id: string;
    first: string;
    last: string;
    attendanceStatus: ParentAttendanceStatus;
  }>;
};

function formatMeetDate(dateStr: string) {
  const iso = dateStr.slice(0, 10);
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  return new Intl.DateTimeFormat("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatDeadline(dateStr?: string | null) {
  if (!dateStr) return "Not set";
  return new Date(dateStr).toLocaleString("en-US", {
    weekday: "long",
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function attendanceLabel(status: ParentAttendanceStatus) {
  if (status === "COMING") return "Coming";
  if (status === "NOT_COMING") return "Not Coming";
  return "No Reply";
}

function optionStyle(active: boolean, status: ParentAttendanceStatus) {
  const palette = status === "COMING"
    ? { background: "#e6f6ea", border: "#b8ddc0" }
    : status === "NOT_COMING"
      ? { background: "#dddddd", border: "#bdbdbd" }
      : { background: "#fff8de", border: "#ead59a" };
  return {
    border: `1px solid ${active ? palette.border : "#d5dbe2"}`,
    background: active ? palette.background : "#ffffff",
    color: "#1d232b",
  } as const;
}

const ATTENDANCE_OPTIONS: ParentAttendanceStatus[] = ["COMING", "NOT_COMING"];

export default function ParentAttendancePage() {
  const [meets, setMeets] = useState<AttendanceMeet[]>([]);
  const [msg, setMsg] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setMsg("");
      const res = await fetch("/api/parent/attendance");
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setMeets([]);
        setMsg(json?.error ?? "Unable to load attendance page.");
        setLoaded(true);
        return;
      }
      setMeets(Array.isArray(json?.meets) ? json.meets : []);
      setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateAttendance(meetId: string, wrestlerId: string, nextStatus: ParentAttendanceStatus) {
    const key = `${meetId}:${wrestlerId}:${nextStatus ?? "NO_REPLY"}`;
    setSavingKey(key);
    setMsg("");
    try {
      const res = await fetch(`/api/parent/meets/${meetId}/attendance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wrestlerId, status: nextStatus }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? "Unable to update attendance.");
      }
      setMeets((current) => current.map((meet) => (
        meet.id !== meetId
          ? meet
          : {
              ...meet,
              children: meet.children.map((child) => (
                child.id === wrestlerId ? { ...child, attendanceStatus: nextStatus } : child
              )),
            }
      )));
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to update attendance.");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <main className="attendance-page">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        .attendance-page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top right, rgba(30, 136, 229, 0.12), transparent 32%),
            linear-gradient(180deg, #eef3f7 0%, #f8fafc 100%);
          color: #1d232b;
          font-family: "Source Sans 3", Arial, sans-serif;
          padding: 22px 16px 40px;
        }
        .attendance-shell {
          max-width: 760px;
          margin: 0 auto;
          display: grid;
          gap: 18px;
        }
        .attendance-card {
          background: #ffffff;
          border: 1px solid #d9e1e8;
          border-radius: 18px;
          box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          padding: 18px;
        }
        .attendance-title {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          font-size: clamp(28px, 5vw, 40px);
          line-height: 1;
        }
        .attendance-intro {
          color: #586473;
          font-size: 18px;
        }
        .page-error {
          color: #b42318;
          font-weight: 700;
        }
        .meet-grid {
          display: grid;
          gap: 18px;
        }
        .meet-header {
          display: grid;
          gap: 8px;
          margin-bottom: 14px;
        }
        .meet-name {
          margin: 0;
          font-family: "Oswald", Arial, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          font-size: clamp(24px, 4.4vw, 34px);
          line-height: 1;
        }
        .meet-meta {
          color: #586473;
          font-size: 17px;
        }
        .attendance-status-note {
          border-radius: 12px;
          background: #fff8de;
          border: 1px solid #ead59a;
          padding: 10px 12px;
          font-weight: 600;
        }
        .children-grid {
          display: grid;
          gap: 14px;
        }
        .child-card {
          border: 1px solid #d9e1e8;
          border-radius: 16px;
          padding: 16px;
          background: #fbfdff;
          display: grid;
          gap: 12px;
        }
        .child-name {
          font-size: 24px;
          font-weight: 800;
          line-height: 1.1;
        }
        .options {
          display: grid;
          gap: 10px;
        }
        .option-button {
          width: 100%;
          min-height: 52px;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 18px;
          font-weight: 800;
          cursor: pointer;
          transition: background 120ms ease, border-color 120ms ease;
        }
        .option-button:disabled {
          cursor: default;
          opacity: 0.65;
        }
        @media (min-width: 640px) {
          .attendance-page {
            padding: 28px 22px 48px;
          }
          .attendance-card {
            padding: 22px;
          }
          .options {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
          .option-button {
            min-height: 58px;
          }
        }
      `}</style>
      <div className="attendance-shell">
        {msg && <div className="page-error">{msg}</div>}

        {!loaded && <div>Loading...</div>}
        {loaded && meets.length === 0 && !msg && (
          <div className="attendance-card">No Attendance or Draft meets are currently available.</div>
        )}

        {meets.length > 0 && (
          <section className="meet-grid">
            {meets.map((meet) => (
              <article key={meet.id} className="attendance-card">
                <div className="meet-header">
                  {meet.status === "ATTENDANCE" && (
                    <div className="meet-meta" style={{ fontWeight: 700, color: "#1d232b", fontSize: 19 }}>
                      Please indicate whether your wrestlers will attend:
                    </div>
                  )}
                  <h2 className="meet-name">{meet.name}</h2>
                  <div className="meet-meta">{formatMeetDate(meet.date)}</div>
                  <div className="meet-meta">{meet.location ?? "Location TBD"}</div>
                  {meet.homeTeam && <div className="meet-meta"><strong>Host:</strong> {meet.homeTeam}</div>}
                  {meet.status === "ATTENDANCE" && (
                    <div className="meet-meta">
                      <strong>Attendance deadline:</strong> {formatDeadline(meet.attendanceDeadline)}
                    </div>
                  )}
                  {meet.status === "DRAFT" ? (
                    <div className="attendance-status-note">
                      Coaches are currently scheduling matches for this meet. If you need to change your status, contact {meet.headCoachName ?? "your head coach"}.
                    </div>
                  ) : !meet.canEditAttendance ? (
                    <div className="attendance-status-note">
                      Attendance entry is closed for this meet. Current selections are shown below.
                    </div>
                  ) : null}
                </div>

                <div className="children-grid">
                  {meet.children.length === 0 ? (
                    <div>No linked wrestlers from your account are in this meet.</div>
                  ) : (
                    meet.children.map((child) => (
                      <article key={`${meet.id}:${child.id}`} className="child-card">
                        <div>
                          <div className="child-name">{child.first} {child.last}</div>
                        </div>
                        <div className="options">
                          {ATTENDANCE_OPTIONS.map((status) => {
                            const key = `${meet.id}:${child.id}:${status ?? "NO_REPLY"}`;
                            const active = child.attendanceStatus === status;
                            return (
                              <button
                                key={status ?? "NO_REPLY"}
                                type="button"
                                className="option-button"
                                style={optionStyle(active, status)}
                                onClick={() => void updateAttendance(meet.id, child.id, status)}
                                disabled={!meet.canEditAttendance || savingKey !== null}
                              >
                                {savingKey === key ? "Saving..." : attendanceLabel(status)}
                              </button>
                            );
                          })}
                        </div>
                      </article>
                    ))
                  )}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
