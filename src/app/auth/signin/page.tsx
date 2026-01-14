import { Suspense } from "react";

import SignInClient from "./SignInClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SignInClient />
    </Suspense>
  );
}
