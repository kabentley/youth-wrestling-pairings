import { Suspense } from "react";

import RostersClient from "./RostersClient";

// Server wrapper to render the roster client with Suspense.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <RostersClient />
    </Suspense>
  );
}
