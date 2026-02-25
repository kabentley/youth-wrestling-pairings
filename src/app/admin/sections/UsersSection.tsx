"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { formatTeamName } from "@/lib/formatTeamName";

type UserRow = {
  id: string;
  username: string;
  email: string;
  phone?: string | null;
  name: string | null;
  role: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
  teamId: string | null;
  lastLoginAt?: string | null;
};
type TeamRow = { id: string; name: string; symbol: string };

export default function UsersSection() {
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
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("COACH");
  const [teamId, setTeamId] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function load(overrides?: { page?: number; query?: string; pageSize?: number; teamFilter?: string }) {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        q: (overrides?.query ?? query).trim(),
        teamId: (overrides?.teamFilter ?? teamFilter).trim(),
        page: String(overrides?.page ?? page),
        pageSize: String(overrides?.pageSize ?? pageSize),
      });
      const [uRes, tRes] = await Promise.all([
        fetch(`/api/admin/users?${params}`),
        fetch("/api/teams"),
      ]);
      if (!uRes.ok) {
        setMsg("Not authorized.");
        return;
      }
      const data = await uRes.json();
      setUsers(data.items ?? []);
      setTotal(Number(data.total ?? 0));
      setAdminCount(Number(data.adminCount ?? 0));
      if (tRes.ok) setTeams(await tRes.json());
    } catch {
      setMsg("Unable to load users.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [page, pageSize, teamFilter]);

  function generatePassword() {
    const digits = "0123456789";
    let out = "";
    for (let i = 0; i < 6; i += 1) {
      out += digits[Math.floor(Math.random() * digits.length)];
    }
    setPassword(out);
  }

  async function createUser() {
    setMsg("");
    if (!password.trim()) {
      setMsg("Enter a password.");
      return;
    }
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, name, role, teamId: teamId || null, password: password || null }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(formatError(data?.error) ?? "Unable to create user.");
      return;
    }
    setUsername("");
    setEmail("");
    setPhone("");
    setName("");
    setPassword("");
    setRole("COACH");
    setTeamId("");
    setMsg(formatError(data?.error) ?? "User created. Password reset required at first sign-in.");
    await load();
  }

  async function setUserRole(id: string, newRole: UserRow["role"]) {
    setMsg("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(formatError(data?.error) ?? "Unable to update role.");
      await load();
      return;
    }
    setMsg("User updated.");
    await load();
  }

  async function setUserTeam(id: string, newTeamId: string | null) {
    setMsg("");
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamId: newTeamId }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setMsg(formatError(data?.error) ?? "Unable to update team.");
      await load();
      return;
    }
    setMsg("User updated.");
    await load();
  }

  async function resetPassword(id: string) {
    setMsg("");
    const newPass = prompt("Enter new password:");
    if (!newPass) return;
    const res = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPass }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const errorMsg = formatError(data?.error) ?? "Unable to reset password.";
      alert(`Password not reset. ${errorMsg}`);
      setMsg(errorMsg);
      return;
    }
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
  const canCreateUser = Boolean(
    username.trim() &&
    email.trim() &&
    password.trim() &&
    (role === "ADMIN" || teamId.trim())
  );

  const showingFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showingTo = Math.min(total, page * pageSize);

  return (
    <>
      <div className="admin-header">
        <h1 className="admin-title">User Management</h1>
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
            onChange={(e) => {
              setPage(1);
              setTeamFilter(e.target.value);
            }}
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTeamName(t)}
              </option>
            ))}
          </select>
          <select
            value={pageSize}
            onChange={(e) => {
              setPage(1);
              setPageSize(Number(e.target.value));
            }}
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <div className="admin-muted">
            {isLoading ? "Loading..." : (total === 0 ? "No users" : `Showing ${showingFrom}-${showingTo} of ${total}`)}
          </div>
        </form>
        <div className="admin-pager">
          <button
            className="admin-btn admin-btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="admin-muted">Page {page} of {totalPages}</span>
          <button
            className="admin-btn admin-btn-ghost"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <div className="admin-card admin-create-user">
        <h3>Create New User</h3>
        <div className="admin-grid">
          <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input placeholder="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="admin-password-row">
            <input
              placeholder="Password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button className="admin-btn admin-btn-ghost" type="button" onClick={generatePassword}>
              Generate
            </button>
          </div>
          <select value={role} onChange={(e) => setRole(e.target.value as UserRow["role"])}>
            <option value="ADMIN">ADMIN</option>
            <option value="COACH">COACH</option>
            <option value="PARENT">PARENT</option>
            <option value="TABLE_WORKER">TABLE_WORKER</option>
          </select>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">Select team</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {formatTeamName(t)}
              </option>
            ))}
          </select>
        </div>
        <button
          className="admin-btn"
          style={{ marginTop: 10, opacity: canCreateUser ? 1 : 0.5 }}
          onClick={createUser}
          disabled={!canCreateUser}
        >
          Create
        </button>
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
            {isLoading ? (
              <tr>
                <td colSpan={8}>Loading...</td>
              </tr>
            ) : (
              <>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.username}</td>
                    <td>{u.email}</td>
                    <td>{u.phone ?? ""}</td>
                    <td>{u.name}</td>
                    <td>
                      <select
                        value={u.role}
                        onChange={(e) => setUserRole(u.id, e.target.value as UserRow["role"])}
                        disabled={u.role === "ADMIN" && adminCount <= 1}
                        title={u.role === "ADMIN" && adminCount <= 1 ? "Cannot remove the last admin" : undefined}
                      >
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
                      >
                        <option value="">None</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>
                            {formatTeamName(t)}
                          </option>
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
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function formatLastLogin(value?: string | null) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
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
