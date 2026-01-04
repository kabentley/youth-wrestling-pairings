import { withAuth } from "next-auth/middleware";

export default withAuth(function middleware() {}, {
  callbacks: {
    authorized: ({ token, req }) => {
      const pathname = req.nextUrl.pathname;

      // Public routes
      if (pathname === "/" || pathname.startsWith("/auth")) return true;
      if (pathname.startsWith("/api/auth")) return true;

      // Everything else requires login
      return !!token;
    },
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
