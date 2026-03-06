import { readFile } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

let cachedPackageInfo:
  | {
      name: string | null;
      version: string | null;
    }
  | null = null;

function readEnvFirst(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

async function getPackageInfo() {
  if (cachedPackageInfo) return cachedPackageInfo;
  try {
    const packagePath = path.join(process.cwd(), "package.json");
    const raw = await readFile(packagePath, "utf8");
    const parsed = JSON.parse(raw) as { name?: unknown; version?: unknown };
    cachedPackageInfo = {
      name: typeof parsed.name === "string" ? parsed.name : null,
      version: typeof parsed.version === "string" ? parsed.version : null,
    };
  } catch {
    cachedPackageInfo = { name: null, version: null };
  }
  return cachedPackageInfo;
}

export async function GET() {
  const packageInfo = await getPackageInfo();
  const commitSha = readEnvFirst(
    "VERCEL_GIT_COMMIT_SHA",
    "GITHUB_SHA",
    "SOURCE_VERSION",
    "COMMIT_SHA",
  );
  const commitRef = readEnvFirst(
    "VERCEL_GIT_COMMIT_REF",
    "GITHUB_REF_NAME",
    "GITHUB_REF",
    "BRANCH",
  );
  const buildId = readEnvFirst(
    "VERCEL_GIT_COMMIT_SHA",
    "VERCEL_URL",
    "RENDER_GIT_COMMIT",
    "RAILWAY_GIT_COMMIT_SHA",
  );

  return NextResponse.json(
    {
      name: packageInfo.name,
      version: packageInfo.version,
      commitSha,
      commitRef,
      buildId,
      serverTime: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
    },
    { headers: NO_STORE_HEADERS },
  );
}
