"use client";

import { use, useEffect, useState } from "react";

type MeetDetail = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  homeTeam?: string | null;
};

export default function ParentMeetDetail({ params }: { params: Promise<{ meetId: string }> }) {
  const [meet, setMeet] = useState<MeetDetail | null>(null);
  const [msg, setMsg] = useState("");
  const { meetId } = use(params);

  async function load() {
    setMsg("");
    const res = await fetch(`/api/parent/meets/${meetId}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setMsg(json?.error ?? "Unable to load meet.");
      return;
    }
    setMeet(await res.json());
  }

  useEffect(() => { void load(); }, [meetId]);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
        <a href="/">Home</a>
        <a href="/parent">My Wrestlers</a>
      </div>

      <h2>Meet Details</h2>
      {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      {!msg && !meet && <div>Loading...</div>}
      {meet && (
        <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
          <div><b>Name:</b> {meet.name}</div>
          <div><b>Date:</b> {new Date(meet.date).toISOString().slice(0, 10)}</div>
          <div><b>Location:</b> {meet.location ?? "TBD"}</div>
          {meet.homeTeam && <div><b>Home Team:</b> {meet.homeTeam}</div>}
        </div>
      )}
    </main>
  );
}
