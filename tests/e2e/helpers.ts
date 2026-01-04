import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function resetDb() {
  const db = new PrismaClient();
  try {
    // Delete child tables first due to FKs
    await db.excludedPair.deleteMany();
    await db.bout.deleteMany();
    await db.meetTeam.deleteMany();
    await db.meet.deleteMany();
    await db.wrestler.deleteMany();
    await db.team.deleteMany();
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();

    // Create test user
    const email = "admin@example.com";
    const passwordHash = await bcrypt.hash("admin1234", 10);
    await db.user.create({
      data: { email, name: "Admin", passwordHash, mfaEnabled: false },
    });
  } finally {
    await db.$disconnect();
  }
}

export async function login(page: any) {
  await page.goto("/auth/signin");
  await page.getByPlaceholder("Email").fill("admin@example.com");
  await page.getByPlaceholder("Password").fill("admin1234");
  await page.getByRole("button", { name: "Sign in" }).click();
}
