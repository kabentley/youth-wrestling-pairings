import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function resetDb() {
  const db = new PrismaClient();
  try {
    // Delete child tables first due to FKs
    await db.bout.deleteMany();
    await db.meetTeam.deleteMany();
    await db.meet.deleteMany();
    await db.wrestler.deleteMany();
    await db.team.deleteMany();
    await db.session.deleteMany();
    await db.account.deleteMany();
    await db.user.deleteMany();

    // Create test user
    const username = "admin";
    const passwordHash = await bcrypt.hash("admin1234", 10);
    await db.user.create({
      data: {
        username,
        name: "Admin",
        passwordHash,
        email: `${username}@example.com`,
        phone: "",
      },
    });
  } finally {
    await db.$disconnect();
  }
}

export async function login(page: any) {
  await page.goto("/auth/signin");
  await page.getByPlaceholder("Username").fill("admin");
  await page.getByPlaceholder("Password").fill("admin1234");
  await page.getByRole("button", { name: "Sign in" }).click();
}
