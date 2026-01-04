import fs from "node:fs";
import path from "node:path";

const target = process.argv[2]; // "sqlite" | "postgres"
if (!target || !["sqlite", "postgres"].includes(target)) {
  console.error('Usage: node scripts/use-db-schema.mjs <sqlite|postgres>');
  process.exit(1);
}

const root = process.cwd();
const prismaDir = path.join(root, "prisma");
const src = path.join(prismaDir, `schema.${target}.prisma`);
const dst = path.join(prismaDir, "schema.prisma");

if (!fs.existsSync(src)) {
  console.error(`Missing schema file: ${src}`);
  process.exit(1);
}

fs.copyFileSync(src, dst);
console.log(`✓ Using ${target} schema (${path.relative(root, src)} -> prisma/schema.prisma)`);
