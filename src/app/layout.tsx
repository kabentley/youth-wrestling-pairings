import "./globals.css";
import type { Metadata } from "next";

import Providers from "./providers";

import HelpButton from "@/components/HelpButton";

export const metadata: Metadata = {
  title: "Wrestling Scheduler",
  description: "Youth wrestling meet scheduler and pairing tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-frame">{children}</div>
          <HelpButton />
        </Providers>
      </body>
    </html>
  );
}
