"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import HeadCoachesSection from "./sections/HeadCoachesSection";
import LeagueSection from "./sections/LeagueSection";
import NotificationsSection from "./sections/NotificationsSection";
import UsersSection from "./sections/UsersSection";

import AppHeader from "@/components/AppHeader";

const headerLinks = [
  { href: "/", label: "Home" },
  { href: "/rosters", label: "Rosters" },
  { href: "/meets", label: "Meets", minRole: "COACH" as const },
  { href: "/parent", label: "My Wrestlers" },
  { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
];

export type AdminTabKey = "users" | "teams" | "head-coaches" | "league" | "pairings" | "notifications";

function resolveAdminTab(value: string | null | undefined, showNotifications: boolean, fallback: AdminTabKey): AdminTabKey {
  switch (value) {
    case "users":
    case "teams":
    case "head-coaches":
    case "league":
    case "pairings":
      return value;
    case "notifications":
      return showNotifications ? "notifications" : fallback;
    default:
      return fallback;
  }
}

export default function AdminTabs({
  initialTab,
  showNotifications = false,
}: {
  initialTab?: AdminTabKey;
  showNotifications?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const defaultTab = initialTab ?? "users";
  const [activeTab, setActiveTab] = useState<AdminTabKey>(defaultTab);

  useEffect(() => {
    const next = resolveAdminTab(searchParams.get("tab"), showNotifications, defaultTab);
    if (next !== activeTab) {
      setActiveTab(next);
    }
  }, [searchParams, activeTab, defaultTab, showNotifications]);

  const handleTabClick = async (tab: AdminTabKey) => {
    const pending: Promise<unknown>[] = [];
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("admin:before-tab-change", { detail: { pending } }));
    }
    if (pending.length > 0) {
      await Promise.allSettled(pending);
    }
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
          onClick={() => { void handleTabClick("users"); }}
        >
          Users
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "teams"}
          className={`admin-tab-button${activeTab === "teams" ? " active" : ""}`}
          onClick={() => { void handleTabClick("teams"); }}
        >
          Teams
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "head-coaches"}
          className={`admin-tab-button${activeTab === "head-coaches" ? " active" : ""}`}
          onClick={() => { void handleTabClick("head-coaches"); }}
        >
          Head Coaches
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "league"}
          className={`admin-tab-button${activeTab === "league" ? " active" : ""}`}
          onClick={() => { void handleTabClick("league"); }}
        >
          League
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "pairings"}
          className={`admin-tab-button${activeTab === "pairings" ? " active" : ""}`}
          onClick={() => { void handleTabClick("pairings"); }}
        >
          Pairings Settings
        </button>
        {showNotifications && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "notifications"}
            className={`admin-tab-button${activeTab === "notifications" ? " active" : ""}`}
            onClick={() => { void handleTabClick("notifications"); }}
          >
            Notifications
          </button>
        )}
      </div>
      <div role="tabpanel">
        {activeTab === "users" && <UsersSection />}
        {activeTab === "teams" && <LeagueSection view="teams" />}
        {activeTab === "head-coaches" && <HeadCoachesSection />}
        {activeTab === "league" && <LeagueSection view="league" />}
        {activeTab === "pairings" && <LeagueSection view="pairings" />}
        {showNotifications && activeTab === "notifications" && <NotificationsSection />}
      </div>
    </>
  );
}
