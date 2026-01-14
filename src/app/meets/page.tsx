import { Suspense } from "react";

import MeetsPage from "./MeetsClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MeetsPage />
    </Suspense>
  );
}
