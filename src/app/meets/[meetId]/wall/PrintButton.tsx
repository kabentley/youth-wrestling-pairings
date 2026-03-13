"use client";

import type { RefObject } from "react";

type PrintButtonProps = {
  meetId?: string;
  targetRef?: RefObject<HTMLElement>;
  styles?: string;
  title?: string;
  printOrientation?: "portrait" | "landscape";
};

export default function PrintButton({ meetId, targetRef, styles, title, printOrientation }: PrintButtonProps) {
  const buildPrintDocument = (content: string) => {
    const isBlackAndWhite = document.documentElement.classList.contains("black-and-white");
    const htmlClasses = ["print-document"];
    if (isBlackAndWhite) htmlClasses.push("black-and-white");
    const htmlClass = ` class="${htmlClasses.join(" ")}"`;
    const orientationStyles = printOrientation === "landscape"
      ? `
      @page {
        size: 11in 8.5in !important;
      }
      @media print {
        html,
        body {
          width: 11in !important;
          min-width: 11in !important;
          height: 8.5in !important;
          min-height: 8.5in !important;
        }
      }
      `
      : "";
    return `<!DOCTYPE html>
<html${htmlClass}>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Wall Chart</title>
    <style>
      ${styles ?? ""}
      ${orientationStyles}
      html {
        -webkit-text-size-adjust: 100%;
        text-size-adjust: 100%;
      }
      body {
        margin: 0;
        padding: 16px;
        background: #ffffff;
      }
      .print-fallback-bar {
        display: none;
      }
      @media screen {
        .print-fallback-bar {
          position: sticky;
          top: 0;
          z-index: 1000;
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 8px 0 12px;
          background: #ffffff;
        }
        .print-fallback-bar button {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #ffffff;
          color: #0f172a;
          font: inherit;
          padding: 8px 12px;
        }
      }
      @media print {
        html,
        body {
          margin: 0 !important;
          padding: 0 !important;
          width: 100% !important;
          background: #ffffff !important;
          -webkit-text-size-adjust: 100% !important;
          text-size-adjust: 100% !important;
        }
        .print-fallback-bar {
          display: none !important;
        }
      }
    </style>
  </head>
  <body>
    <div class="print-fallback-bar">
      <button type="button" onclick="window.print()">Print</button>
      <button type="button" onclick="window.close()">Close</button>
    </div>
    ${content}
    <script>
      window.addEventListener("load", function () {
        window.setTimeout(function () {
          try {
            window.focus();
            window.print();
          } catch (_) {}
        }, 300);
      });
      window.addEventListener("afterprint", function () {
        try {
          window.close();
        } catch (_) {}
      });
    </script>
  </body>
</html>`;
  };

  const handlePrint = () => {
    if (meetId) {
      fetch(`/api/meets/${meetId}/print`, { method: "POST" }).catch(() => {});
    }
    if (!targetRef?.current) {
      window.print();
      return;
    }

    const printMarkup = buildPrintDocument(targetRef.current.outerHTML);
    const printBlob = new Blob([printMarkup], { type: "text/html" });
    const printUrl = URL.createObjectURL(printBlob);
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      window.print();
      URL.revokeObjectURL(printUrl);
      return;
    }
    printWindow.location.href = printUrl;
    let attempts = 0;
    const tryPrint = () => {
      attempts += 1;
      if (printWindow.closed) return;
      try {
        if (printWindow.document.readyState === "complete") {
          printWindow.focus();
          printWindow.print();
          return;
        }
      } catch {
        // Keep retrying while the new tab finishes loading.
      }
      if (attempts < 20) {
        window.setTimeout(tryPrint, 250);
      }
    };
    window.setTimeout(tryPrint, 300);
    window.setTimeout(() => URL.revokeObjectURL(printUrl), 60_000);
  };

  return (
    <button type="button" onClick={handlePrint} title={title} aria-label={title ?? "Print"}>
      Print
    </button>
  );
}
