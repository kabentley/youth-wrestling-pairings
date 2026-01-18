"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { HELP_PAGES } from "@/lib/helpContent";

const renderParagraph = (paragraph: string) => {
  const parts = paragraph.split(/(\([^)]*\))/g).filter(Boolean);
  return parts.map((part, index) =>
    part.startsWith("(") && part.endsWith(")") ? (
      <strong key={`${part}-${index}`}>{part}</strong>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
};

export default function HelpPage() {
  const [activePageId, setActivePageId] = useState(HELP_PAGES[0]?.id ?? "");
  const activePage = useMemo(
    () => HELP_PAGES.find((page) => page.id === activePageId) ?? HELP_PAGES[0],
    [activePageId],
  );

  return (
    <main className="help-page">
      <style>{`
        .help-page {
          min-height: 100vh;
          padding: 34px 22px 60px;
          background: radial-gradient(circle at top right, #f2f6fb 0%, #eef1f4 55%, #e6edf5 100%);
          color: #1d232b;
        }
        .help-shell {
          width: min(1100px, 100%);
          margin: 0 auto;
        }
        .help-hero {
          margin-bottom: 20px;
        }
        .help-hero h1 {
          margin: 0;
          font-size: clamp(32px, 3.6vw, 44px);
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        .help-hero p {
          margin: 10px 0 0;
          color: #516072;
          font-size: 19px;
          line-height: 1.6;
        }
        .help-tab-bar {
          margin-top: 22px;
          display: flex;
          justify-content: flex-start;
          gap: 4px;
          padding: 0 8px;
          background: #f1f3f7;
          border: 1px solid #d0d5df;
          border-bottom: none;
          border-radius: 16px 16px 0 0;
          box-shadow: inset 0 -1px 0 rgba(13, 23, 66, 0.08);
        }
        .help-tab-button {
          flex: none;
          padding: 10px 18px;
          font-size: 16px;
          font-weight: 600;
          color: #5f6772;
          background: transparent;
          border: 1px solid transparent;
          border-bottom: 1px solid transparent;
          border-radius: 12px 12px 0 0;
          cursor: pointer;
          transition: background 0.2s, color 0.2s, border-color 0.2s;
          text-align: left;
        }
        .help-tab-button + .help-tab-button {
          margin-left: 4px;
        }
        .help-tab-button:hover:not(.active) {
          background: #e5e9f0;
          color: #1e3a82;
        }
        .help-tab-button.active {
          background: #fff;
          color: #1e2a4b;
          border-color: #d0d5df;
          border-bottom-color: #fff;
          box-shadow: inset 0 -1px 0 rgba(15, 23, 42, 0.08);
        }
        .help-tab-button:focus-visible {
          outline: 2px solid #1e88e5;
          outline-offset: -2px;
        }
        .help-tab-body {
          margin-top: -1px;
          padding-top: 0;
          border: 1px solid #d0d5df;
          border-top: none;
          border-radius: 0 0 16px 16px;
          background: #fff;
        }
        .help-section {
          background: transparent;
          border: none;
          border-radius: 0;
          padding: 18px 20px 22px;
          margin-bottom: 16px;
          box-shadow: none;
        }
        .help-section h3 {
          margin: 0 0 4px;
          font-size: 24px;
        }
        .help-section .help-path {
          font-size: 13px;
          color: #5a6673;
          font-weight: 600;
          letter-spacing: 0.6px;
          text-transform: uppercase;
          margin-bottom: 10px;
        }
        .help-columns {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }
        .help-card {
          border: 1px solid #e3e7ee;
          border-radius: 12px;
          padding: 12px 14px;
          background: #f7f9fc;
        }
        .help-card h4 {
          margin: 0 0 6px;
          font-size: 18px;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: #243247;
        }
        .help-card p {
          margin: 0 0 10px;
          color: #2d3642;
          font-size: 17px;
          line-height: 1.65;
        }
        .help-card p:last-child {
          margin-bottom: 0;
        }
        @media (max-width: 900px) {
          .help-hero {
            margin-bottom: 16px;
          }
        }
      `}</style>
      <div className="help-shell">
        <div className="help-hero">
          <div>
            <h1>Help Center</h1>
            <p>
              These guides explain how to use this program to run Madison style meets for a youth wrestling league.
            </p>
          </div>
        </div>

        <div className="help-tab-bar">
          {HELP_PAGES.map((page) => (
            <button
              key={page.id}
              type="button"
              className={`help-tab-button${page.id === activePage?.id ? " active" : ""}`}
              onClick={() => setActivePageId(page.id)}
            >
              {page.title}
            </button>
          ))}
        </div>

        {activePage ? (
          <div className="help-tab-body">
            <section id={activePage.id} className="help-section">
              <h3>{activePage.title}</h3>
              <div className="help-columns">
                {activePage.sections.map((section) => (
                  <div key={section.title} className="help-card">
                    <h4>{section.title}</h4>
                    {section.paragraphs.map((paragraph) => (
                      <p key={paragraph}>{renderParagraph(paragraph)}</p>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}
