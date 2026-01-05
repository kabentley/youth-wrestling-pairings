"use client";

import Link from "next/link";
import { useState } from "react";

export default function SignUpPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      body: JSON.stringify({ username, email, phone, name, password }),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const error = json?.error;
      if (typeof error === "string") {
        setMsg(error);
      } else if (error && typeof error === "object") {
        const flat = Object.values(error).flat().filter(Boolean);
        setMsg(flat.length > 0 ? flat.join(" ") : "Sign-up failed.");
      } else {
        setMsg("Sign-up failed.");
      }
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
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="tel"
          placeholder="Phone (E.164)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <input
          type="text"
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type={showPassword ? "text" : "password"}
          placeholder="Confirm password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <label style={{ fontSize: 12 }}>
          <input
            type="checkbox"
            checked={showPassword}
            onChange={(e) => setShowPassword(e.target.checked)}
          />{" "}
          Show password
        </label>

        <button onClick={submit}>Create account</button>

        {msg && <div style={{ color: msg.includes("failed") ? "crimson" : "green" }}>{msg}</div>}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          Already have an account? <Link href="/auth/signin">Sign in</Link>
        </div>
      </div>
    </main>
  );
}
