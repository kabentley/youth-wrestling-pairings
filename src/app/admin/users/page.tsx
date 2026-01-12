"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import AppHeader from "@/components/AppHeader";

type UserRow = { id: string; username: string; email: string; phone?: string | null; name: string | null; role: "ADMIN"|"COACH"|"PARENT"|"TABLE_WORKER"; teamId: string | null; lastLoginAt?: string | null };
type TeamRow = { id: string; name: string; symbol: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [query, setQuery] = useState("");
  const [teamFilter, setTeamFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [adminCount, setAdminCount] = useState(0);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"ADMIN"|"COACH"|"PARENT"|"TABLE_WORKER">("COACH");
  const [teamId, setTeamId] = useState<string>("");
  const [msg, setMsg] = useState("");

  async function load(overrides?: { page?: number; query?: string; pageSize?: number; teamFilter?: string }) {
    const params = new URLSearchParams({
      q: (overrides?.query ?? query).trim(),
      teamId: (overrides?.teamFilter ?? teamFilter).trim(),
      page: String(overrides?.page ?? page),
      pageSize: String(overrides?.pageSize ?? pageSize),
    });
    const [uRes, tRes] = await Promise.all([fetch(`/api/admin/users?${params}`), fetch("/api/teams")]);
    if (!uRes.ok) { setMsg("Not authorized."); return; }
    const data = await uRes.json();
    setUsers(data.items ?? []);
    setTotal(Number(data.total ?? 0));
    setAdminCount(Number(data.adminCount ?? 0));
    if (tRes.ok) setTeams(await tRes.json());
  }

  useEffect(() => { void load(); }, [page, pageSize, teamFilter]);

  async function createUser() {
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, name, role, teamId: teamId || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(formatError(data?.error) ?? "Unable to create user.");
      return;
    }
    setUsername(""); setEmail(""); setPhone(""); setName(""); setRole("COACH"); setTeamId("");
    setMsg(formatError(data?.error) ?? "User created. Temporary password sent by email.");
    await load();
  }

  async function setUserRole(id: string, newRole: UserRow["role"]) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    await load();
  }

  async function setUserTeam(id: string, newTeamId: string | null) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: newTeamId }),
    });
    await load();
  }

  async function resetPassword(id: string) {
    const newPass = prompt("Enter new password:");
    if (!newPass) return;
    await fetch(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPass }),
    });
    setMsg("Password reset.");
  }

  async function deleteUser(id: string, label: string) {
    setMsg("");
    const ok = confirm(`Remove ${label}? This deletes the account and active sessions.`);
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(formatError(data?.error) ?? "Unable to delete user.");
      return;
    }
    setMsg("User removed.");
    await load();
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    if (page !== 1) {
      setPage(1);
    }
    void load({ page: 1, query, teamFilter });
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(total, page * pageSize);
  function formatLastLogin(value?: string | null) {
    if (!value) return "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Unknown";
    return date.toLocaleString();
  }
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  return (
    <main className="admin">
      <style>{adminStyles}</style>
      <div className="admin-shell">
        <AppHeader links={headerLinks} />
        <div className="admin-header">
          <h1 className="admin-title">User Management</h1>
        </div>
        <div className="admin-nav">
          <span className="admin-link admin-link-active" aria-current="page">Users</span>
          <a className="admin-link" href="/admin/league">League & Teams</a>
        </div>

        <div className="admin-card">
          <form className="admin-search" onSubmit={onSearchSubmit}>
            <input
              placeholder="Search username, email, or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="admin-btn" type="submit">Search</button>
            <select
              value={teamFilter}
              onChange={(e) => { setPage(1); setTeamFilter(e.target.value); }}
            >
              <option value="">All teams</option>
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.symbol})</option>
              ))}
            </select>
            <select
              value={pageSize}
              onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
            <div className="admin-muted">
              {total === 0 ? "No users" : `Showing ${showingFrom}-${showingTo} of ${total}`}
            </div>
          </form>
          <div className="admin-pager">
            <button
              className="admin-btn admin-btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="admin-muted">Page {page} of {totalPages}</span>
            <button
              className="admin-btn admin-btn-ghost"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>

        <div className="admin-card">
          <h3>Create New User</h3>
          <div className="admin-grid">
            <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
            <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
            <input placeholder="Phone (optional)" value={phone} onChange={e => setPhone(e.target.value)} />
            <input placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} />
          <select value={role} onChange={e => setRole(e.target.value as any)}>
            <option value="ADMIN">ADMIN</option>
            <option value="COACH">COACH</option>
            <option value="PARENT">PARENT</option>
            <option value="TABLE_WORKER">TABLE_WORKER</option>
          </select>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={role === "ADMIN"}>
            <option value="">Select team (coach/parent/table worker)</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.symbol}</option>
            ))}
          </select>
          </div>
          <button className="admin-btn" style={{ marginTop: 10 }} onClick={createUser}>Create</button>
          {msg && <div className="admin-info">{msg}</div>}
        </div>

        <div className="admin-table">
          <table cellPadding={8}>
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Name</th>
                <th>Role</th>
                <th>Team</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>{u.phone ?? ""}</td>
                  <td>{u.name}</td>
                  <td>
                    <select value={u.role} onChange={e => setUserRole(u.id, e.target.value as any)}>
                      <option value="ADMIN">ADMIN</option>
                      <option value="COACH">COACH</option>
                      <option value="PARENT">PARENT</option>
                      <option value="TABLE_WORKER">TABLE_WORKER</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={u.teamId ?? ""}
                      onChange={(e) => setUserTeam(u.id, e.target.value || null)}
                      disabled={u.role === "ADMIN"}
                    >
                      <option value="">None</option>
                      {teams.map(t => (
                        <option key={t.id} value={t.id}>{t.symbol}</option>
                      ))}
                    </select>
                  </td>
                  <td>{formatLastLogin(u.lastLoginAt)}</td>
                  <td className="admin-actions">
                    <button className="admin-btn admin-btn-ghost" onClick={() => resetPassword(u.id)}>Reset Password</button>
                    <button
                      className="admin-btn admin-btn-danger"
                      onClick={() => deleteUser(u.id, u.username)}
                      disabled={u.role === "ADMIN" && adminCount <= 1}
                      title={u.role === "ADMIN" && adminCount <= 1 ? "Cannot delete the last admin" : undefined}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={8}>No users found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function formatError(error: unknown) {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (typeof error !== "object") return String(error);

  const parts: string[] = [];
  for (const [key, value] of Object.entries(error)) {
    if (Array.isArray(value)) {
      parts.push(`${key}: ${value.join(", ")}`);
    } else if (value) {
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.length ? parts.join(" | ") : "Invalid input.";
}

const adminStyles = `
  @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@400;600;700&family=Source+Sans+3:wght@400;600;700&display=swap");
  :root {
    --bg: #eef1f4;
    --card: #ffffff;
    --ink: #1d232b;
    --muted: #5a6673;
    --accent: #1e88e5;
    --line: #d5dbe2;
    --danger: #c62828;
  }
  .admin {
    min-height: 100vh;
    background: var(--bg);
    color: var(--ink);
    font-family: "Source Sans 3", Arial, sans-serif;
    padding: 28px 18px 40px;
  }
  .admin-shell {
    max-width: 1100px;
    margin: 0 auto;
  }
  .admin-title {
    font-family: "Oswald", Arial, sans-serif;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    margin: 0;
  }
  .admin-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }
  .admin-nav {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .admin-card {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 18px;
    margin-bottom: 18px;
  }
  .admin-card h3 {
    margin-top: 0;
  }
  .admin-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }
  .admin input,
  .admin select {
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 8px 10px;
    font-size: 14px;
  }
  .admin-btn {
    border: 0;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    padding: 8px 12px;
    border-radius: 4px;
    cursor: pointer;
  }
  .admin-btn-ghost {
    background: #f2f5f8;
    color: var(--ink);
    border: 1px solid var(--line);
  }
  .admin-btn-danger {
    background: var(--danger);
  }
  .admin-link {
    color: var(--accent);
    text-decoration: none;
    font-weight: 600;
  }
  .admin-link-active {
    color: var(--ink);
    background: #f2f5f8;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 10px;
  }
  .admin-nav {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 12px;
  }
  .admin-info {
    margin-top: 8px;
    color: var(--muted);
  }
  .admin-table {
    border: 1px solid var(--line);
    border-radius: 8px;
    overflow: hidden;
    background: #fff;
  }
  .admin table {
    width: 100%;
    border-collapse: collapse;
  }
  .admin thead {
    background: #f7f9fb;
    text-align: left;
  }
  .admin th,
  .admin td {
    padding: 10px 8px;
    border-bottom: 1px solid var(--line);
    vertical-align: middle;
  }
  .admin tbody tr:last-child td {
    border-bottom: 0;
  }
  .admin-actions {
    display: flex;
    gap: 8px;
    flex-wrap: nowrap;
  }
  .admin-actions button {
    white-space: nowrap;
  }
  .admin-search {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(220px, 1fr) auto auto 1fr;
    align-items: center;
  }
  .admin-pager {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
  }
  @media (max-width: 900px) {
    .admin-header {
      align-items: flex-start;
    }
    .admin-search {
      grid-template-columns: 1fr;
    }
  }
`;
