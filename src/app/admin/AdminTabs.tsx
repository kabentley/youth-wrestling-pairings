"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import AppHeader from "@/components/AppHeader";
import LeagueSection from "./sections/LeagueSection";
import UsersSection from "./sections/UsersSection";

const headerLinks = [
  { href: "/", label: "Home" },
  { href: "/rosters", label: "Rosters" },
  { href: "/meets", label: "Meets", minRole: "COACH" as const },
  { href: "/parent", label: "My Wrestlers" },
  { href: "/coach/my-team", label: "Team Settings", minRole: "COACH" as const },
  { href: "/admin", label: "Admin", minRole: "ADMIN" as const },
];

export type AdminTabKey = "users" | "league";

export default function AdminTabs({ initialTab }: { initialTab?: TabKey }) {
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

  const handleTabClick = (tab: TabKey) => {
    router.replace(`/admin?tab=${tab}`);
  };

  return (
    <>
      <AppHeader links={headerLinks} />
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
          aria-selected={activeTab === "league"}
          className={`admin-tab-button${activeTab === "league" ? " active" : ""}`}
          onClick={() => handleTabClick("league")}
        >
          League &amp; Teams
        </button>
      </div>
      <div role="tabpanel">
        {activeTab === "league" ? <LeagueSection /> : <UsersSection />}
      </div>
    </>
  );
}
