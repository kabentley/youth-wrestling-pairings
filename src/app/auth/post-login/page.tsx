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
  const defaultPath = "/rosters";
  const raw = typeof params?.callbackUrl === "string" ? params.callbackUrl : defaultPath;
  const safe = raw.startsWith("/") ? raw : defaultPath;

  if (role === "COACH" || role === "ADMIN") {
    redirect("/");
  }

  if (role === "PARENT") {
    redirect("/parent");
  }

  redirect(safe);
}
