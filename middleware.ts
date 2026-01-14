import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export default withAuth(function middleware(req) {
  const pathname = req.nextUrl.pathname;
  const token = req.nextauth?.token;
  if (pathname.startsWith("/auth/force-reset") && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/signin";
    url.searchParams.set("callbackUrl", "/auth/force-reset");
    return NextResponse.redirect(url);
  }
  if (token?.mustResetPassword) {
    const allowed =
      pathname.startsWith("/auth/force-reset") ||
      pathname.startsWith("/api/auth/force-reset") ||
      pathname.startsWith("/api/auth");
    if (!allowed) {
      const url = req.nextUrl.clone();
      url.pathname = "/auth/force-reset";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
}, {
  callbacks: {
    authorized: ({ token, req }) => {
      const pathname = req.nextUrl.pathname;

      // Public routes
      if (pathname === "/" || pathname.startsWith("/auth")) return true;
      if (pathname.startsWith("/api/auth")) return true;
      if (pathname.startsWith("/api/public")) return true;

      // Everything else requires login
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
