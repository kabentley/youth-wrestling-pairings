"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";

type UserRow = { id: string; email: string | null; name: string | null; role: "ADMIN"|"COACH"|"VIEWER"; mfaEnabled: boolean };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("changeme123");
  const [role, setRole] = useState<"ADMIN"|"COACH"|"VIEWER">("COACH");
  const [msg, setMsg] = useState("");

  async function load() {
    const res = await fetch("/api/admin/users");
    if (!res.ok) { setMsg("Not authorized."); return; }
    setUsers(await res.json());
  }

  useEffect(() => { load(); }, []);

  async function createUser() {
    setMsg("");
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    const txt = await res.text();
    if (!res.ok) { setMsg(txt); return; }
    setEmail(""); setName(""); setPassword("changeme123"); setRole("COACH");
    setMsg("User created.");
    load();
  }

  async function setUserRole(id: string, newRole: UserRow["role"]) {
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function resetMfa(id: string) {
    await fetch(`/api/admin/users/${id}/reset-mfa`, { method: "POST" });
    load();
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
        <a href="/auth/mfa">My MFA</a>
        <button onClick={() => signOut({ callbackUrl: "/auth/signin" })}>Sign out</button>
      </div>

      <h2>User Management</h2>

      <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginBottom: 16 }}>
        <h3>Create user</h3>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}>
          <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
          <input placeholder="Name (optional)" value={name} onChange={e => setName(e.target.value)} />
          <input placeholder="Temp password" value={password} onChange={e => setPassword(e.target.value)} />
          <select value={role} onChange={e => setRole(e.target.value as any)}>
            <option value="ADMIN">ADMIN</option>
            <option value="COACH">COACH</option>
            <option value="VIEWER">VIEWER</option>
          </select>
        </div>
        <button style={{ marginTop: 10 }} onClick={createUser}>Create</button>
        {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
      </div>

      <table cellPadding={8} style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #ddd" }}>
            <th>Email</th>
            <th>Name</th>
            <th>Role</th>
            <th>MFA</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} style={{ borderTop: "1px solid #eee" }}>
              <td>{u.email}</td>
              <td>{u.name}</td>
              <td>
                <select value={u.role} onChange={e => setUserRole(u.id, e.target.value as any)}>
                  <option value="ADMIN">ADMIN</option>
                  <option value="COACH">COACH</option>
                  <option value="VIEWER">VIEWER</option>
                </select>
              </td>
              <td>{u.mfaEnabled ? "Enabled" : "Off"}</td>
              <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => resetMfa(u.id)}>Reset MFA</button>
                <button onClick={() => resetPassword(u.id)}>Reset Password</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
