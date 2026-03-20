"use client";

import { use, useEffect, useState } from "react";

import AppHeader from "@/components/AppHeader";

type MeetDetail = {
  id: string;
  name: string;
  date: string;
  location?: string | null;
  homeTeam?: string | null;
  checkinStartAt?: string | null;
  checkinDurationMinutes?: number | null;
};

function formatCheckinWindow(startStr?: string | null, durationMinutes?: number | null) {
  if (!startStr) return null;
  const start = new Date(startStr);
  if (Number.isNaN(start.getTime())) return null;
  const normalizedDuration = typeof durationMinutes === "number" && durationMinutes > 0 ? durationMinutes : 30;
  const end = new Date(start.getTime() + normalizedDuration * 60 * 1000);
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${formatter.format(start)} to ${formatter.format(end)}`;
}

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
  const headerLinks = [
    { href: "/", label: "Home" },
    { href: "/rosters", label: "Rosters" },
    { href: "/meets", label: "Meets", minRole: "COACH" as const },
    { href: "/parent", label: "My Wrestlers" },
    { href: "/parent/today", label: "Today", roles: ["PARENT"] as const },
    { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
    { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
  ];

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <AppHeader links={headerLinks} />

      <h2>Meet Details</h2>
      {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      {!msg && !meet && <div>Loading...</div>}
      {meet && (
        <div style={{ display: "grid", gap: 6, maxWidth: 720 }}>
          <div><b>Name:</b> {meet.name}</div>
          <div><b>Date:</b> {new Date(meet.date).toISOString().slice(0, 10)}</div>
          <div><b>Location:</b> {meet.location ?? "TBD"}</div>
          {formatCheckinWindow(meet.checkinStartAt, meet.checkinDurationMinutes) && (
            <div><b>Checkin time:</b> {formatCheckinWindow(meet.checkinStartAt, meet.checkinDurationMinutes)}</div>
          )}
          {meet.homeTeam && <div><b>Home Team:</b> {meet.homeTeam}</div>}
        </div>
      )}
    </main>
  );
}
