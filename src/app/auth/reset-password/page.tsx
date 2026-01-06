"use client";

import Link from "next/link";
import { useState } from "react";

export default function ResetPasswordPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"email" | "sms">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  async function submit() {
    setErr("");
    setMsg("");
    if (!username.trim()) {
      setErr("Enter your username.");
      return;
    }
    if (method === "email" && !email.trim()) {
      setErr("Enter your email.");
      return;
    }
    if (method === "sms" && !phone.trim()) {
      setErr("Enter your phone.");
      return;
    }
    if (!code.trim()) {
      setErr("Enter the reset code.");
      return;
    }
    if (password.length < 8) {
      setErr("Password must be at least 8 characters and include a symbol.");
      return;
    }
    if (!isStrongPassword(password)) {
      setErr("Password must be at least 8 characters and include a symbol.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }

    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, code, password }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setErr(json?.error ?? "Unable to reset password.");
      return;
    }

    setMsg("Password updated. You can sign in now.");
    setEmail("");
    setCode("");
    setPassword("");
    setConfirm("");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h2>Reset Password</h2>

      <div style={{ display: "grid", gap: 10 }}>
        <label style={{ fontSize: 12 }}>
          <input
            type="radio"
            name="method"
            value="email"
            checked={method === "email"}
            onChange={() => setMethod("email")}
          />{" "}
          Email
        </label>
        <label style={{ fontSize: 12 }}>
          <input
            type="radio"
            name="method"
            value="sms"
            checked={method === "sms"}
            onChange={() => setMethod("sms")}
          />{" "}
          SMS
        </label>

        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        {method === "email" ? (
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        ) : (
          <input
            type="tel"
            placeholder="Phone (E.164)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        )}
        <input
          type="text"
          placeholder="Reset code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          type={showPassword ? "text" : "password"}
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <div style={{ height: 8, borderRadius: 999, background: "#e6e9ee", overflow: "hidden", border: "1px solid #d5dbe2" }}>
          <span style={{ display: "block", height: "100%", width: `${passwordStrength(password).pct}%`, background: passwordStrength(password).color, transition: "width 150ms ease" }} />
        </div>
        <div style={{ fontSize: 12, color: "#5a6673" }}>{passwordStrength(password).label}</div>
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

        <button onClick={submit}>Reset Password</button>

        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {msg && <div style={{ color: "green" }}>{msg}</div>}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          <Link href="/auth/forgot-password">Send a new code</Link> ·{" "}
          <Link href="/auth/signin">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}

function passwordStrength(password: string) {
  const longEnough = password.length >= 8;
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (!password) return { pct: 0, color: "#e6e9ee", label: "Password strength" };
  if (!longEnough) return { pct: 40, color: "#e57373", label: "Too short" };
  if (!hasSymbol) return { pct: 75, color: "#f2b705", label: "Add a symbol" };
  return { pct: 100, color: "#2e7d32", label: "Strong" };
}

function isStrongPassword(password: string) {
  return password.length >= 8 && /[^A-Za-z0-9]/.test(password);
}
