"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type NotificationRow = {
  id: string;
  event: string;
  channel: "email" | "system" | string;
  status: "SKIPPED" | "LOGGED" | "SENT" | "FAILED";
  recipient: string;
  subject: string | null;
  message: string;
  provider: string | null;
  providerMessageId: string | null;
  errorMessage: string | null;
  dedupeKey: string | null;
  createdAt: string;
  deliveredAt: string | null;
  meet: {
    id: string;
    name: string;
    date: string;
  } | null;
  user: {
    id: string;
    username: string;
    name: string | null;
  } | null;
};

type MeetOption = {
  id: string;
  name: string;
  date: string;
};

const EVENT_OPTIONS = [
  { value: "", label: "All events" },
  { value: "meet_ready_for_attendance", label: "Ready for Attendance" },
  { value: "welcome_email", label: "Welcome Email" },
  { value: "password_reset_code", label: "Password Reset Code" },
] as const;

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "SENT", label: "Sent" },
  { value: "LOGGED", label: "Logged" },
  { value: "FAILED", label: "Failed" },
  { value: "SKIPPED", label: "Skipped" },
] as const;

function normalizeEmailWhitelistInput(raw: string) {
  return Array.from(new Set(
    raw
      .split(/[\s,;]+/)
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ))
    .sort((a, b) => a.localeCompare(b))
    .join("\n");
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Not delivered";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatMeetLabel(meet: MeetOption | NotificationRow["meet"]) {
  if (!meet) return "No meet";
  const date = new Date(meet.date);
  const dateLabel = Number.isNaN(date.getTime())
    ? meet.date
    : date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return `${meet.name} (${dateLabel})`;
}

function formatEventLabel(event: NotificationRow["event"]) {
  switch (event) {
    case "meet_ready_for_attendance":
      return "Ready for Attendance";
    case "welcome_email":
      return "Welcome Email";
    case "password_reset_code":
      return "Password Reset Code";
    default:
      return event;
  }
}

function formatStatusClass(status: NotificationRow["status"]) {
  switch (status) {
    case "SENT":
      return "admin-status admin-status-sent";
    case "LOGGED":
      return "admin-status admin-status-logged";
    case "FAILED":
      return "admin-status admin-status-failed";
    case "SKIPPED":
      return "admin-status admin-status-skipped";
    default:
      return "admin-status";
  }
}

export default function NotificationsSection() {
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [meetOptions, setMeetOptions] = useState<MeetOption[]>([]);
  const [emailDeliveryMode, setEmailDeliveryMode] = useState<"off" | "log" | "all" | "whitelist">("off");
  const [emailWhitelist, setEmailWhitelist] = useState("");
  const [showEveryoneConfirmModal, setShowEveryoneConfirmModal] = useState(false);
  const [savedEmailDeliveryMode, setSavedEmailDeliveryMode] = useState<"off" | "log" | "all" | "whitelist">("off");
  const [savedEmailWhitelist, setSavedEmailWhitelist] = useState("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [meetFilter, setMeetFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [msg, setMsg] = useState("");
  const [msgTone, setMsgTone] = useState<"success" | "error">("error");
  const [settingsMsg, setSettingsMsg] = useState("");
  const [settingsMsgTone, setSettingsMsgTone] = useState<"success" | "error">("success");
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);

  async function loadEmailDeliverySettings() {
    const res = await fetch("/api/admin/email-delivery");
    if (!res.ok) {
      throw new Error("Unable to load email delivery settings.");
    }
    const data = await res.json();
    const nextMode = data.emailDeliveryMode === "all"
      ? "all"
      : data.emailDeliveryMode === "log"
        ? "log"
        : data.emailDeliveryMode === "whitelist"
          ? "whitelist"
          : "off";
    const nextWhitelist = normalizeEmailWhitelistInput(data.emailWhitelist ?? "");
    setEmailDeliveryMode(nextMode);
    setEmailWhitelist(nextWhitelist);
    setSavedEmailDeliveryMode(nextMode);
    setSavedEmailWhitelist(nextWhitelist);
  }

  const saveEmailDeliverySettings = useCallback(async (
    nextMode: "off" | "log" | "all" | "whitelist",
    nextWhitelist: string,
  ) => {
    setIsSavingSettings(true);
    setSettingsMsg("");
    try {
      const normalizedWhitelist = normalizeEmailWhitelistInput(nextWhitelist);
      const res = await fetch("/api/admin/email-delivery", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailDeliveryMode: nextMode,
          emailWhitelist: normalizedWhitelist,
        }),
      });
      if (!res.ok) {
        throw new Error("Unable to save email delivery settings.");
      }
      setEmailDeliveryMode(nextMode);
      setEmailWhitelist(normalizedWhitelist);
      setSavedEmailDeliveryMode(nextMode);
      setSavedEmailWhitelist(normalizedWhitelist);
      setSettingsMsg("Email delivery settings saved.");
      setSettingsMsgTone("success");
    } catch (error) {
      setSettingsMsg(error instanceof Error ? error.message : "Unable to save email delivery settings.");
      setSettingsMsgTone("error");
    } finally {
      setIsSavingSettings(false);
    }
  }, []);

  async function load(overrides?: {
    page?: number;
    pageSize?: number;
    query?: string;
    meetFilter?: string;
    eventFilter?: string;
    statusFilter?: string;
  }) {
    setIsLoading(true);
    setMsg("");
    setMsgTone("error");
    try {
      const params = new URLSearchParams({
        q: (overrides?.query ?? debouncedQuery).trim(),
        meetId: (overrides?.meetFilter ?? meetFilter).trim(),
        event: (overrides?.eventFilter ?? eventFilter).trim(),
        status: (overrides?.statusFilter ?? statusFilter).trim(),
        page: String(overrides?.page ?? page),
        pageSize: String(overrides?.pageSize ?? pageSize),
      });
      const res = await fetch(`/api/admin/notifications?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMsg(typeof data?.error === "string" ? data.error : "Unable to load notifications.");
        setRows([]);
        return;
      }
      const data = await res.json();
      setRows(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total ?? 0));
      setMeetOptions(Array.isArray(data.meetOptions) ? data.meetOptions : []);
    } catch {
      setMsg("Unable to load notifications.");
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function clearLogs() {
    const confirmed = window.confirm(
      "Clear all notification logs? This removes the full notification history, including one-time meet notification dispatch records.",
    );
    if (!confirmed) {
      return;
    }
    setIsClearingLogs(true);
    setMsg("");
    setMsgTone("error");
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "Unable to clear notifications.");
      }
      setRows([]);
      setMeetOptions([]);
      setTotal(0);
      setPage(1);
      setMsg(`Cleared ${Number(data?.deleted ?? 0)} notification logs.`);
      setMsgTone("success");
      await load({ page: 1 });
    } catch (error) {
      setMsg(error instanceof Error ? error.message : "Unable to clear notifications.");
      setMsgTone("error");
    } finally {
      setIsClearingLogs(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    void load();
  }, [page, pageSize, meetFilter, eventFilter, statusFilter, debouncedQuery]);

  useEffect(() => {
    void loadEmailDeliverySettings().catch((error) => {
      setMsg(error instanceof Error ? error.message : "Unable to load email delivery settings.");
      setMsgTone("error");
    });
  }, []);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const normalizedWhitelist = useMemo(() => normalizeEmailWhitelistInput(emailWhitelist), [emailWhitelist]);
  const settingsDirty =
    normalizedWhitelist !== savedEmailWhitelist ||
    emailDeliveryMode !== savedEmailDeliveryMode;
  const canSaveSettings = settingsDirty || settingsMsgTone === "error";

  return (
    <>
      <div className="admin-header admin-users-header">
        <h1 className="admin-title">Notifications</h1>
      </div>

      <div
        className="admin-card admin-users-controls"
      >
        <div className="admin-form-grid">
          <div className="admin-field">
            <label className="admin-label" htmlFor="notification-email-delivery-mode">
              App Email Delivery
            </label>
            <select
              id="notification-email-delivery-mode"
              value={emailDeliveryMode}
              onChange={(event) => {
                const nextMode = event.target.value === "all"
                  ? "all"
                  : event.target.value === "log"
                    ? "log"
                  : event.target.value === "whitelist"
                    ? "whitelist"
                    : "off";
                if (nextMode === "all" && emailDeliveryMode !== "all") {
                  setShowEveryoneConfirmModal(true);
                  return;
                }
                setEmailDeliveryMode(nextMode);
                setSettingsMsg("");
              }}
              disabled={isSavingSettings}
            >
              <option value="off">None</option>
              <option value="log">Log</option>
              <option value="whitelist">Whitelist</option>
              <option value="all">Everyone</option>
            </select>
            <div className="admin-muted" style={{ marginTop: 6 }}>
              None disables app email delivery entirely. Log records every app email in the Notifications log without calling SendGrid. Whitelist sends only to the exact email addresses listed below.
            </div>
          </div>
          <div className="admin-field" style={{ gridColumn: "1 / -1" }}>
            <label className="admin-label" htmlFor="notification-email-whitelist">
              Email Whitelist
            </label>
            <textarea
              id="notification-email-whitelist"
              value={emailWhitelist}
              onChange={(event) => {
                setEmailWhitelist(event.target.value);
                setSettingsMsg("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  const field = event.currentTarget;
                  const selectionStart = field.selectionStart;
                  const selectionEnd = field.selectionEnd;
                  const nextValue =
                    `${field.value.slice(0, selectionStart)}\n${field.value.slice(selectionEnd)}`;
                  setEmailWhitelist(nextValue);
                  setSettingsMsg("");
                  window.requestAnimationFrame(() => {
                    field.setSelectionRange(selectionStart + 1, selectionStart + 1);
                  });
                }
              }}
              placeholder={"one@example.com\nanother@example.com"}
              rows={5}
              spellCheck={false}
              disabled={isSavingSettings}
              style={{ width: "100%", resize: "vertical" }}
            />
            <div className="admin-muted" style={{ marginTop: 6 }}>
              Emails pasted with commas, spaces, tabs, or semicolons are automatically split into separate lines.
            </div>
          </div>
          <div className="admin-field" style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              type="button"
              className="admin-btn"
              onClick={() => {
                if (!canSaveSettings || isSavingSettings) {
                  return;
                }
                void saveEmailDeliverySettings(emailDeliveryMode, emailWhitelist);
              }}
              disabled={!canSaveSettings || isSavingSettings}
              style={{ minHeight: 44, padding: "10px 18px", fontSize: 15 }}
            >
              {isSavingSettings ? "Saving..." : "Save"}
            </button>
            <span style={{ color: settingsMsgTone === "error" ? "#b00020" : "#256029", minHeight: 20 }}>
              {settingsMsg}
            </span>
          </div>
        </div>
      </div>

      <div className="admin-card admin-users-controls">
        <form
          className="admin-search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            void load({ page: 1, query });
          }}
        >
          <div className="admin-search-filters">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search recipient, meet, user, subject, or message"
            />
            <select
              value={meetFilter}
              onChange={(event) => {
                setMeetFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All meets</option>
              {meetOptions.map((meet) => (
                <option key={meet.id} value={meet.id}>
                  {formatMeetLabel(meet)}
                </option>
              ))}
            </select>
            <select
              value={eventFilter}
              onChange={(event) => {
                setEventFilter(event.target.value);
                setPage(1);
              }}
            >
              {EVENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={String(pageSize)}
              onChange={(event) => {
                const next = Number(event.target.value) || 25;
                setPageSize(next);
                setPage(1);
              }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size} per page
                </option>
              ))}
            </select>
            <button className="admin-btn admin-search-submit" type="submit">
              Refresh
            </button>
            <button
              className="admin-btn admin-btn-danger admin-search-submit"
              type="button"
              onClick={() => {
                void clearLogs();
              }}
              disabled={isLoading || isClearingLogs}
            >
              {isClearingLogs ? "Clearing..." : "Clear Logs"}
            </button>
          </div>
          <div className="admin-search-summary admin-muted">
            {isLoading ? "Loading..." : `${total} notification logs`}
          </div>
        </form>
        {msg && (
          <div
            className={msgTone === "error" ? "admin-error" : "admin-muted"}
            style={msgTone === "success" ? { color: "#256029" } : undefined}
          >
            {msg}
          </div>
        )}
        <div className="admin-pager">
          <button
            className="admin-btn admin-btn-ghost"
            type="button"
            disabled={page <= 1 || isLoading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Previous
          </button>
          <span className="admin-muted">Page {page} of {totalPages}</span>
          <button
            className="admin-btn admin-btn-ghost"
            type="button"
            disabled={page >= totalPages || isLoading}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="admin-table admin-notifications-table">
        <table>
          <thead>
            <tr>
              <th>Created</th>
              <th>Event</th>
              <th>Meet</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Recipient</th>
              <th>User</th>
              <th>Provider</th>
              <th>Message</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={9} className="admin-users-table-message">Loading...</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="admin-users-table-message">No notifications found.</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id}>
                <td data-label="Created">
                  <div>{formatTimestamp(row.createdAt)}</div>
                  <div className="admin-muted">
                    {row.deliveredAt ? `Delivered ${formatTimestamp(row.deliveredAt)}` : "Not delivered"}
                  </div>
                </td>
                <td data-label="Event">{formatEventLabel(row.event)}</td>
                <td data-label="Meet">
                  <div>{formatMeetLabel(row.meet)}</div>
                  {row.dedupeKey && <div className="admin-muted admin-code">{row.dedupeKey}</div>}
                </td>
                <td data-label="Channel">{row.channel}</td>
                <td data-label="Status">
                  <span className={formatStatusClass(row.status)}>{row.status}</span>
                </td>
                <td data-label="Recipient" className="admin-code">{row.recipient}</td>
                <td data-label="User">
                  {row.user ? (
                    <>
                      <div>{row.user.name?.trim() ? row.user.name.trim() : row.user.username}</div>
                      <div className="admin-muted">@{row.user.username}</div>
                    </>
                  ) : (
                    <span className="admin-muted">No linked user</span>
                  )}
                </td>
                <td data-label="Provider">
                  <div>{row.provider ?? "n/a"}</div>
                  {row.providerMessageId && <div className="admin-muted admin-code">{row.providerMessageId}</div>}
                  {row.errorMessage && <div className="admin-error">{row.errorMessage}</div>}
                </td>
                <td data-label="Message" className="admin-notification-message-cell">
                  {row.subject && <div><strong>{row.subject}</strong></div>}
                  <div className="admin-notification-message" title={row.message}>{row.message}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEveryoneConfirmModal && (
        <div
          className="admin-modal-backdrop"
          role="presentation"
          onClick={() => {
            if (!isSavingSettings) {
              setShowEveryoneConfirmModal(false);
            }
          }}
        >
          <div
            className="admin-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="notifications-everyone-confirm-title"
            onClick={(event) => event.stopPropagation()}
            style={{ width: "min(760px, 100%)", padding: 28 }}
          >
            <h3 id="notifications-everyone-confirm-title" style={{ marginTop: 0, fontSize: "1.5rem", lineHeight: 1.25 }}>
              Enable Real Email Delivery?
            </h3>
            <p className="admin-muted" style={{ marginTop: 0, fontSize: "1.05rem", lineHeight: 1.6 }}>
              Setting App Email Delivery to <strong>Everyone</strong> will begin sending real emails to users for welcome emails, password reset codes, and meet notifications.
            </p>
            <p className="admin-muted" style={{ marginTop: 0, fontSize: "1.05rem", lineHeight: 1.6 }}>
              Continue only if you intend to email all eligible recipients.
            </p>
            <p className="admin-muted" style={{ marginTop: 0, fontSize: "1.05rem", lineHeight: 1.6 }}>
              For testing, use <strong>Whitelist</strong> to send only to approved addresses or <strong>Log</strong> to record emails without sending them.
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-btn admin-btn-ghost"
                onClick={() => setShowEveryoneConfirmModal(false)}
                disabled={isSavingSettings}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-btn"
                onClick={() => {
                  setShowEveryoneConfirmModal(false);
                  void saveEmailDeliverySettings("all", emailWhitelist);
                }}
                disabled={isSavingSettings}
              >
                {isSavingSettings ? "Saving..." : "Enable Everyone"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
