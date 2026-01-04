"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";

export default function MfaPage() {
  const { data: session, status } = useSession();
  const [qr, setQr] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [msg, setMsg] = useState<string>("");

  async function setup() {
    setMsg("");
    const res = await fetch("/api/mfa/setup", { method: "POST" });
    if (!res.ok) {
      setMsg("Setup failed.");
      return;
    }
    const json = await res.json();
    setQr(json.qrDataUrl);
    setMsg("Scan the QR code with Google Authenticator/Authy, then enter the 6-digit code to verify.");
  }

  async function verify() {
    setMsg("");
    const res = await fetch("/api/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error ?? "Verification failed.");
      return;
    }
    setMsg("MFA enabled. You will be required to enter a code at sign-in.");
    setQr("");
    setCode("");
  }

  async function disable() {
    setMsg("");
    const res = await fetch("/api/mfa/disable", { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setMsg(json?.error ?? "Disable failed.");
      return;
    }
    setMsg("MFA disabled.");
  }

  useEffect(() => {
    // nothing
  }, []);

  if (status === "loading") return <main style={{ padding: 24, fontFamily: "system-ui" }}>Loading...</main>;
  if (!session) return <main style={{ padding: 24, fontFamily: "system-ui" }}>Not signed in.</main>;

  const mfaEnabled = (session.user as any)?.mfaEnabled;

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h2>Multi‑Factor Authentication (MFA)</h2>

      <div style={{ marginBottom: 12, opacity: 0.85 }}>
        Signed in as <b>{session.user?.email}</b>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        {!mfaEnabled && <button onClick={setup}>Set up MFA</button>}
        {!mfaEnabled && <button onClick={() => { setQr(""); setMsg(""); }}>Clear</button>}
        {mfaEnabled && <button onClick={disable}>Disable MFA</button>}
        <button onClick={() => signOut({ callbackUrl: "/auth/signin" })}>Sign out</button>
      </div>

      {msg && <div style={{ marginBottom: 12 }}>{msg}</div>}

      {!mfaEnabled && qr && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <div style={{ marginBottom: 10 }}><b>Step 1:</b> Scan this QR code</div>
          <img src={qr} alt="MFA QR Code" style={{ width: 240, height: 240, border: "1px solid #eee" }} />
          <div style={{ marginTop: 12 }}><b>Step 2:</b> Enter the 6-digit code</div>
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            <button onClick={verify}>Verify</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            If you lose your authenticator device, you may need an admin to reset MFA.
          </div>
        </div>
      )}

      {mfaEnabled && (
        <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12 }}>
          <b>MFA is currently enabled</b>.
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            You will be prompted for a 6-digit code during sign-in.
          </div>
        </div>
      )}

      <p style={{ marginTop: 16 }}>
        <a href="/teams">Back to app</a>
      </p>
    </main>
  );
}
