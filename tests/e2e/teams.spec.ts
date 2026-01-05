import { test, expect } from "@playwright/test";
import { resetDb, login } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("create a team and add wrestlers", async ({ page }) => {
  await login(page);

  await page.goto("/teams");

  await page.getByPlaceholder("Team name").fill("Tigers");
  await page.getByRole("button", { name: "Add" }).click();

  await expect(page.getByRole("link", { name: "Tigers" })).toBeVisible();

  await page.getByRole("link", { name: "Tigers" }).click();
  await expect(page.getByRole("heading", { name: "Team Wrestlers" })).toBeVisible();

  await page.getByPlaceholder("First").fill("Jason");
  await page.getByPlaceholder("Last").fill("Nolf");
  await page.getByPlaceholder("Weight").fill("52");
  await page.locator('input[type="date"]').fill("2015-03-11");
  await page.getByPlaceholder("Exp").fill("1");
  await page.getByPlaceholder("Skill 0-5").fill("3");

  await page.getByRole("button", { name: "Add Wrestler" }).click();

  await expect(page.getByText("Jason Nolf")).toBeVisible();
  await expect(page.getByText("52")).toBeVisible();
});
