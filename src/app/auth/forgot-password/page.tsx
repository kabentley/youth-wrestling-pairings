"use client";

import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<"email" | "sms">("email");
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

    const res = await fetch("/api/auth/send-reset-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, phone, method }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setErr(json?.error ?? "Unable to send reset code.");
      return;
    }

    setMsg("If that email exists, a reset code was sent.");
    setEmail("");
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 520 }}>
      <h2>Send Password Reset Code</h2>
      <p style={{ fontSize: 12, opacity: 0.7 }}>
        Enter your email address and we will send a reset code.
      </p>

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

        <button onClick={submit}>Send Code</button>

        {err && <div style={{ color: "crimson" }}>{err}</div>}
        {msg && <div style={{ color: "green" }}>{msg}</div>}

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          <Link href="/auth/reset-password">I have a code</Link> ·{" "}
          <Link href="/auth/signin">Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
