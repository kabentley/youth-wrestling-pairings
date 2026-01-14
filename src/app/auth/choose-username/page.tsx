import { Suspense } from "react";

import ChooseUsernameClient from "./ChooseUsernameClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ChooseUsernameClient />
    </Suspense>
  );
}
