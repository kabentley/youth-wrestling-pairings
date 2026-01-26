"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import LeagueSection from "./sections/LeagueSection";
import UsersSection from "./sections/UsersSection";

import AppHeader from "@/components/AppHeader";

const headerLinks = [
  { href: "/", label: "Home" },
  { href: "/rosters", label: "Rosters" },
  { href: "/meets", label: "Meets", minRole: "COACH" as const },
  { href: "/parent", label: "My Wrestlers" },
  { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
];

export type AdminTabKey = "users" | "teams" | "league" | "pairings";

export default function AdminTabs({ initialTab }: { initialTab?: AdminTabKey }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultTab = initialTab ?? "users";
  const [activeTab, setActiveTab] = useState<AdminTabKey>(defaultTab);

  useEffect(() => {
    const next = (searchParams.get("tab") ?? defaultTab) as AdminTabKey;
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [searchParams, activeTab, defaultTab]);

  const handleTabClick = (tab: AdminTabKey) => {
    router.replace(`/admin?tab=${tab}`);
  };

  return (
    <>
      <AppHeader links={headerLinks} hideTeamSelector />
      <div className="admin-nav admin-tab-bar" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "users"}
          className={`admin-tab-button${activeTab === "users" ? " active" : ""}`}
          onClick={() => handleTabClick("users")}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "teams"}
          className={`admin-tab-button${activeTab === "teams" ? " active" : ""}`}
          onClick={() => handleTabClick("teams")}
        >
          Teams
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "league"}
          className={`admin-tab-button${activeTab === "league" ? " active" : ""}`}
          onClick={() => handleTabClick("league")}
        >
          League
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pairings"}
          className={`admin-tab-button${activeTab === "pairings" ? " active" : ""}`}
          onClick={() => handleTabClick("pairings")}
        >
          Pairings Settings
        </button>
      </div>
      <div role="tabpanel">
        {activeTab === "users" && <UsersSection />}
        {activeTab === "teams" && <LeagueSection view="teams" />}
        {activeTab === "league" && <LeagueSection view="league" />}
        {activeTab === "pairings" && <LeagueSection view="pairings" />}
      </div>
    </>
  );
}
