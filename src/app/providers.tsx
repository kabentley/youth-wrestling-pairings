"use client";

import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider
      refetchOnWindowFocus={false}
      refetchOnReconnect={false}
      refetchInterval={0}
    >
      {children}
    </SessionProvider>
  );
}
