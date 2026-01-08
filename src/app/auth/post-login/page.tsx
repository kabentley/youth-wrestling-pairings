import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";

export default async function PostLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/auth/signin");
  }

  const params = await searchParams;
  const role = (session.user as any)?.role as string | undefined;
  const raw = typeof params?.callbackUrl === "string" ? params.callbackUrl : "/teams";
  const safe = raw.startsWith("/") ? raw : "/teams";

  if (role === "ADMIN" && (safe === "/teams" || safe === "/" || safe.startsWith("/auth/"))) {
    redirect("/admin");
  }

  redirect(safe);
}
