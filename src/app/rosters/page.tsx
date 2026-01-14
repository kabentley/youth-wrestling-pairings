import { Suspense } from "react";

import RostersClient from "./RostersClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RostersClient />
    </Suspense>
  );
}
