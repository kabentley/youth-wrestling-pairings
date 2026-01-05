"use client";

import { useState } from "react";
import Link from "next/link";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");

  async function submit() {
    setMsg("");
    if (password !== confirm) {
      setMsg("Passwords do not match.");
      return;
    }

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, name, password }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(json?.error ?? "Sign-up failed.");
      return;
    }

    setMsg("Account created. You can sign in now.");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h2>Create account</h2>

      <div style={{ display: "grid", gap: 10 }}>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <button onClick={submit}>Create account</button>

        {msg && <div style={{ color: msg.includes("failed") ? "crimson" : "green" }}>{msg}</div>}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Already have an account? <Link href="/auth/signin">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
