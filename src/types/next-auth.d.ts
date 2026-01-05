import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      username?: string | null;
      email?: string | null;
      name?: string | null;
      mfaEnabled?: boolean;
      role?: "ADMIN" | "COACH" | "PARENT";
      teamId?: string | null;
    };
  }
}
