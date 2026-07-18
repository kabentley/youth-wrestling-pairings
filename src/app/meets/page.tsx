import MeetsPage from "./MeetsClient";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ create?: string; defaults?: string }>;
}) {
  const params = await searchParams;
  return <MeetsPage createParam={params?.create} defaultsParam={params?.defaults} />;
}
