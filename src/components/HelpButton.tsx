"use client";

import { usePathname } from "next/navigation";

/** Floating entry point to the help guide (opens `/help` in a new tab). */
export default function HelpButton() {
  const pathname = usePathname();
  if (pathname === "/help") return null;
  return (
    <a className="help-button" href="/help" aria-label="Help" target="_blank" rel="noreferrer">
      <span aria-hidden="true">?</span>
      <span className="help-button-label">Help</span>
    </a>
  );
}
