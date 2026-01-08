
declare module "next-auth" {
  interface Session {
    user?: {
      id?: string;
      username?: string | null;
      email?: string | null;
      name?: string | null;
      role?: "ADMIN" | "COACH" | "PARENT" | "TABLE_WORKER";
      teamId?: string | null;
      sessionVersion?: number;
      mustResetPassword?: boolean;
    };
  }
}
