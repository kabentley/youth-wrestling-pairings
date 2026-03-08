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
  return "";
}

function childStatusKey(meetId: string, wrestlerId: string) {
  return `${meetId}:${wrestlerId}`;
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

const ATTENDANCE_OPTIONS: Exclude<ParentAttendanceStatus, null>[] = ["COMING", "NOT_COMING"];

export default function ParentAttendancePage() {
  const [meets, setMeets] = useState<AttendanceMeet[]>([]);
  const [draftStatuses, setDraftStatuses] = useState<Record<string, ParentAttendanceStatus>>({});
  const [editingMeets, setEditingMeets] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [msgStatus, setMsgStatus] = useState<"success" | "error" | null>(null);
  const [savingMeetId, setSavingMeetId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setMsg("");
      setMsgStatus(null);
      const res = await fetch("/api/parent/attendance");
      const json = await res.json().catch(() => null);
      if (cancelled) return;
      if (!res.ok) {
        setMeets([]);
        setDraftStatuses({});
        setEditingMeets({});
        setMsg(json?.error ?? "Unable to load attendance page.");
        setMsgStatus("error");
        setLoaded(true);
        return;
      }

      const loadedMeets = Array.isArray(json?.meets) ? json.meets : [];
      setMeets(loadedMeets);
      setDraftStatuses(
        Object.fromEntries(
          loadedMeets.flatMap((meet: AttendanceMeet) =>
            meet.children.map((child) => [childStatusKey(meet.id, child.id), child.attendanceStatus]),
          ),
        ),
      );
      setEditingMeets(
        Object.fromEntries(
          loadedMeets.map((meet: AttendanceMeet) => [
            meet.id,
            meet.children.every((child) => child.attendanceStatus === null),
          ]),
        ),
      );
      setLoaded(true);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submitAttendance(meet: AttendanceMeet) {
    const updates = meet.children
      .map((child) => ({
        wrestlerId: child.id,
        savedStatus: child.attendanceStatus,
        nextStatus: draftStatuses[childStatusKey(meet.id, child.id)] ?? null,
      }))
      .filter((entry) => entry.savedStatus !== entry.nextStatus)
      .map(({ wrestlerId, nextStatus }) => ({
        wrestlerId,
        status: nextStatus,
      }));

    if (updates.length === 0) return;

    setSavingMeetId(meet.id);
    setMsg("");
    setMsgStatus(null);
    try {
      const res = await fetch(`/api/parent/meets/${meet.id}/attendance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? "Unable to update attendance.");
      }
      setMeets((current) => current.map((entry) => (
        entry.id !== meet.id
          ? entry
          : {
              ...entry,
              children: entry.children.map((child) => ({
                ...child,
                attendanceStatus: draftStatuses[childStatusKey(entry.id, child.id)] ?? null,
              })),
            }
      )));
      setEditingMeets((current) => ({ ...current, [meet.id]: false }));
      setMsg("");
      setMsgStatus(null);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to update attendance.");
      setMsgStatus("error");
    } finally {
      setSavingMeetId(null);
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
        .page-message {
          font-weight: 700;
          border-radius: 12px;
          padding: 12px 14px;
          border: 1px solid #d9e1e8;
          background: #fff;
        }
        .page-message.error {
          color: #b42318;
          border-color: #f0b3ad;
          background: #fff5f4;
        }
        .page-message.success {
          color: #166534;
          border-color: #b8ddc0;
          background: #e6f6ea;
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
        .meet-action-row {
          display: flex;
          justify-content: flex-start;
        }
        .attendance-status-note.success {
          background: #e6f6ea;
          border-color: #b8ddc0;
        }
        .attendance-status-note.info {
          background: #eaf3ff;
          border-color: #bfd7f6;
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
        .child-name-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          flex-wrap: wrap;
        }
        .attendance-badge {
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
        .attendance-badge.coming {
          background: #e6f6ea;
          border-color: #b8ddc0;
        }
        .attendance-badge.not-coming {
          background: #eeeeee;
          border-color: #c7c7c7;
        }
        .child-status-row {
          display: grid;
          gap: 4px;
          color: #586473;
          font-size: 16px;
        }
        .child-status-strong {
          color: #1d232b;
          font-weight: 700;
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
        .submit-row {
          display: flex;
          justify-content: flex-end;
          margin-top: 14px;
        }
        .submit-button {
          min-height: 52px;
          border-radius: 14px;
          padding: 12px 18px;
          font-size: 18px;
          font-weight: 800;
          cursor: pointer;
          border: 1px solid #1b6fd1;
          background: #1e88e5;
          color: #fff;
        }
        .submit-button:disabled {
          cursor: default;
          opacity: 0.55;
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
        {msg && <div className={`page-message ${msgStatus ?? "error"}`}>{msg}</div>}

        {!loaded && <div>Loading...</div>}
        {loaded && meets.length === 0 && !msg && (
          <div className="attendance-card">No Attendance or Draft meets are currently available.</div>
        )}

        {meets.length > 0 && (
          <section className="meet-grid">
            {meets.map((meet) => {
              const repliedCount = meet.children.filter((child) => child.attendanceStatus !== null).length;
              const changedCount = meet.children.filter(
                (child) => (draftStatuses[childStatusKey(meet.id, child.id)] ?? null) !== child.attendanceStatus,
              ).length;
              const hasSavedReply = repliedCount > 0;
              const isEditing = meet.canEditAttendance && (!hasSavedReply || editingMeets[meet.id]);
              const hasUnsavedChanges = changedCount > 0;
              const hasIncompleteDraft = meet.children.some(
                (child) => (draftStatuses[childStatusKey(meet.id, child.id)] ?? null) === null,
              );
              const canAutoSave = isEditing && hasUnsavedChanges && !hasIncompleteDraft && savingMeetId === null;

              return (
                <article
                  key={meet.id}
                  className="attendance-card"
                  onBlurCapture={(event) => {
                    if (!canAutoSave) return;
                    const nextFocused = event.relatedTarget;
                    if (nextFocused instanceof Node && event.currentTarget.contains(nextFocused)) {
                      return;
                    }
                    void submitAttendance(meet);
                  }}
                >
                  <div className="meet-header">
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
                    ) : meet.canEditAttendance && meet.children.length > 0 && isEditing ? (
                      <>
                        {repliedCount === 0 && (
                          <div className="attendance-status-note">
                            Please indicate whether your wrestler{meet.children.length === 1 ? "" : "s"} will attend. If we don't hear from you we will assume they are not coming.
                          </div>
                        )}
                        <div className="meet-action-row">
                          <button
                            type="button"
                            className="submit-button"
                            disabled={savingMeetId !== null || !hasUnsavedChanges || hasIncompleteDraft}
                            onClick={() => void submitAttendance(meet)}
                          >
                            {savingMeetId === meet.id
                              ? "Submitting..."
                              : hasSavedReply
                                ? `Change Response${meet.children.length === 1 ? "" : "s"}`
                                : "Submit Responses"}
                          </button>
                        </div>
                      </>
                    ) : meet.canEditAttendance && meet.children.length > 0 && !isEditing ? (
                      <>
                        {repliedCount === meet.children.length ? (
                          <div className="attendance-status-note success">
                            Thank you, you can change your response{meet.children.length === 1 ? "" : "s"} until the deadline.
                          </div>
                        ) : (
                          <div className="attendance-status-note">
                            Response submitted for {repliedCount} of {meet.children.length} wrestlers. You can finish or update your response{meet.children.length === 1 ? "" : "s"} below.
                          </div>
                        )}
                        <div className="meet-action-row">
                          <button
                            type="button"
                            className="submit-button"
                            onClick={() => {
                              setDraftStatuses((current) => ({
                                ...current,
                                ...Object.fromEntries(
                                  meet.children.map((child) => [childStatusKey(meet.id, child.id), child.attendanceStatus]),
                                ),
                              }));
                              setEditingMeets((current) => ({ ...current, [meet.id]: true }));
                            }}
                            disabled={savingMeetId !== null}
                          >
                            Change Response{meet.children.length === 1 ? "" : "s"}
                          </button>
                        </div>
                      </>
                    ) : !meet.canEditAttendance ? (
                      <div className="attendance-status-note">
                        Attendance entry is closed for this meet. Current selections are shown below.
                      </div>
                    ) : (
                      null
                    )}
                  </div>

                  <div className="children-grid">
                    {meet.children.length === 0 ? (
                      <div>No linked wrestlers from your account are in this meet.</div>
                    ) : (
                      meet.children.map((child) => {
                        const draftStatus = draftStatuses[childStatusKey(meet.id, child.id)] ?? null;
                        const savedBadgeClass = child.attendanceStatus === "COMING" ? "coming" : "not-coming";
                        return (
                          <article key={`${meet.id}:${child.id}`} className="child-card">
                            <div className="child-status-row">
                              <div className="child-name-row">
                                <div className="child-name">{child.first} {child.last}</div>
                                {child.attendanceStatus !== null && (
                                  <span className={`attendance-badge ${savedBadgeClass}`}>
                                    {attendanceLabel(child.attendanceStatus)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isEditing ? (
                              <div className="options">
                                {ATTENDANCE_OPTIONS.map((status) => {
                                  const active = draftStatus === status;
                                  return (
                                    <button
                                      key={status}
                                      type="button"
                                      className="option-button"
                                      style={optionStyle(active, status)}
                                      onClick={() => setDraftStatuses((current) => ({
                                        ...current,
                                        [childStatusKey(meet.id, child.id)]: status,
                                      }))}
                                      disabled={!meet.canEditAttendance || savingMeetId !== null}
                                    >
                                      {attendanceLabel(status)}
                                    </button>
                                  );
                                })}
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    )}
                  </div>

                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
