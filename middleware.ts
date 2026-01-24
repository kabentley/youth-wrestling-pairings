import { NextResponse } from "next/server";
import { withAuth } from "next-auth/middleware";

export default withAuth(function middleware(req) {
  const pathname = req.nextUrl.pathname;
  const token = req.nextauth.token;
  if (token?.mustResetPassword) {
    const allowed =
      pathname.startsWith("/auth/force-reset") ||
      pathname.startsWith("/api/auth/force-reset") ||
      pathname.startsWith("/api/auth");
    if (!allowed) {
      const username =
        typeof token?.username === "string"
          ? token.username
          : typeof token?.user?.username === "string"
            ? token.user.username
            : "";
      const url = req.nextUrl.clone();
      url.pathname = "/auth/force-reset";
      url.search = username ? `?username=${encodeURIComponent(username)}` : "";
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
      if (pathname.startsWith("/api/league")) return true;

      // Everything else requires login
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
