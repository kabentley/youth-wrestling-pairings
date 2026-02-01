"use client";

import type { RefObject } from "react";

type PrintButtonProps = {
  meetId?: string;
  targetRef?: RefObject<HTMLElement>;
  styles?: string;
};

export default function PrintButton({ meetId, targetRef, styles }: PrintButtonProps) {
  const handlePrint = () => {
    if (meetId) {
      fetch(`/api/meets/${meetId}/print`, { method: "POST" }).catch(() => {});
    }
    if (!targetRef?.current) {
      window.print();
      return;
    }

    const width = window.screen.availWidth;
    const height = window.screen.availHeight;
    const printWindow = window.open(
      "",
      "_blank",
      `width=${width},height=${height},left=0,top=0,toolbar=0,scrollbars=1,resizable=1`
    );
    if (!printWindow) {
      window.print();
      return;
    }

    printWindow.document.write(`<!DOCTYPE html><html><head><title>Wall Chart</title><style>${styles ?? ""}</style></head><body>`);
    printWindow.document.write(targetRef.current.outerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    printWindow.onload = () => {
      printWindow.focus();
      printWindow.print();
      printWindow.onafterprint = () => {
        printWindow.close();
      };
    };
  };

  return (
    <button type="button" onClick={handlePrint}>
      Print
    </button>
  );
}
