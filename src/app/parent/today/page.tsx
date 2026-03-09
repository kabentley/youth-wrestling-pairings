"use client";

import { useEffect, useState } from "react";

import ParentTodayMeetCards, {
  type ParentTodayCurrentUser,
  type ParentTodayMeetGroup,
} from "@/components/parent/ParentTodayMeetCards";

export default function ParentTodayPage() {
  const [meetGroups, setMeetGroups] = useState<ParentTodayMeetGroup[]>([]);
  const [currentUser, setCurrentUser] = useState<ParentTodayCurrentUser | null>(null);
  const [msg, setMsg] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    async function load() {
      setMsg("");
      const res = await fetch("/api/parent/matches");
      const json = await res.json().catch(() => null);
      if (!active) return;
      if (!res.ok) {
        setMeetGroups([]);
        setCurrentUser(null);
        setMsg(json?.error ?? "Unable to load matches.");
        setLoaded(true);
        return;
      }
      setCurrentUser(json?.currentUser ?? null);
      setMeetGroups(Array.isArray(json?.meets) ? json.meets : []);
      setLoaded(true);
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="parent-today">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Oswald:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap");
        .parent-today {
          min-height: 100vh;
          background:
            radial-gradient(circle at top right, rgba(30, 136, 229, 0.1), transparent 30%),
            linear-gradient(180deg, #eef3f7 0%, #f8fafc 100%);
          color: #1d232b;
          font-family: "Source Sans 3", Arial, sans-serif;
          padding: 24px 18px 40px;
        }
      `}</style>
      <ParentTodayMeetCards
        meetGroups={meetGroups}
        currentUser={currentUser}
        msg={msg}
        loaded={loaded}
      />
    </main>
  );
}
