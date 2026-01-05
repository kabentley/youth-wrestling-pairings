"use client";

import { signOut } from "next-auth/react";
import { useEffect, useState } from "react";

type UserRow = { id: string; username: string; email: string; phone?: string | null; name: string | null; role: "ADMIN"|"COACH"|"PARENT"; teamId: string | null };
type TeamRow = { id: string; name: string; symbol: string };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("changeme123");
  const [role, setRole] = useState<"ADMIN"|"COACH"|"PARENT">("COACH");
  const [teamId, setTeamId] = useState<string>("");
  const [msg, setMsg] = useState("");

  async function load() {
    const [uRes, tRes] = await Promise.all([fetch("/api/admin/users"), fetch("/api/teams")]);
    if (!uRes.ok) { setMsg("Not authorized."); return; }
    setUsers(await uRes.json());
    if (tRes.ok) setTeams(await tRes.json());
  }

  useEffect(() => { void load(); }, []);

  async function createUser() {
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, name, password, role, teamId: teamId || null }),
    });
    const txt = await res.text();
    if (!res.ok) { setMsg(txt); return; }
    setUsername(""); setEmail(""); setPhone(""); setName(""); setPassword("changeme123"); setRole("COACH"); setTeamId("");
    setMsg("User created.");
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

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 980 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <a href="/">Home</a>
        <a href="/teams">Teams</a>
        <a href="/meets">Meets</a>
        <button onClick={async () => { await signOut({ redirect: false }); window.location.href = "/auth/signin"; }}>Sign out</button>
      </div>

      <h2>User Management</h2>

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <h3>Create user</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <input placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input placeholder="Phone (E.164)" value={phone} onChange={e => setPhone(e.target.value)} />
          <input placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Temp password" value={password} onChange={e => setPassword(e.target.value)} />
          <select value={role} onChange={e => setRole(e.target.value as any)}>
            <option value="ADMIN">ADMIN</option>
            <option value="COACH">COACH</option>
            <option value="PARENT">PARENT</option>
          </select>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={role !== "COACH"}>
            <option value="">Select team (coach only)</option>
            {teams.map(t => (
              <option key={t.id} value={t.id}>{t.symbol}</option>
            ))}
          </select>
        </div>
        <button style={{ marginTop: 10 }} onClick={createUser}>Create</button>
        {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Username</th>
            <th>Email</th>
            <th>Phone</th>
            <th>Name</th>
            <th>Role</th>
            <th>Team</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{u.username}</td>
              <td>{u.email}</td>
              <td>{u.phone ?? ""}</td>
              <td>{u.name}</td>
              <td>
                <select value={u.role} onChange={e => setUserRole(u.id, e.target.value as any)}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="COACH">COACH</option>
                  <option value="PARENT">PARENT</option>
                </select>
              </td>
              <td>
                <select
                  value={u.teamId ?? ""}
                  onChange={(e) => setUserTeam(u.id, e.target.value || null)}
                  disabled={u.role !== "COACH"}
                >
                  <option value="">None</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.symbol}</option>
                  ))}
                </select>
              </td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => resetPassword(u.id)}>Reset Password</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
