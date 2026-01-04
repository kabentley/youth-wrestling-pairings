import { test, expect } from "@playwright/test";
import { resetDb, login } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

async function createTeamWith2(page: any, name: string, w1: any, w2: any) {
  await page.goto("/teams");
  await page.getByPlaceholder("Team name").fill(name);
  await page.getByRole("button", { name: "Add" }).click();
  await page.getByRole("link", { name }).click();

  for (const w of [w1, w2]) {
    await page.getByPlaceholder("First").fill(w.first);
    await page.getByPlaceholder("Last").fill(w.last);
    await page.getByPlaceholder("Weight").fill(String(w.weight));
    await page.locator('input[type="date"]').fill(w.birthdate);
    await page.getByPlaceholder("Exp").fill(String(w.exp));
    await page.getByPlaceholder("Skill 0-5").fill(String(w.skill));
    await page.getByRole("button", { name: "Add Wrestler" }).click();
    await expect(page.getByText(`${w.first} ${w.last}`)).toBeVisible();
  }
}

test("create meet, generate pairings, assign mats, lock a bout", async ({ page }) => {
  await login(page);

  await createTeamWith2(page, "Tigers",
    { first: "Ben", last: "B", weight: 52, birthdate: "2015-03-11", exp: 1, skill: 3 },
    { first: "Sam", last: "S", weight: 55, birthdate: "2014-11-02", exp: 0, skill: 2 },
  );
  await createTeamWith2(page, "Bears",
    { first: "Max", last: "M", weight: 53, birthdate: "2015-01-10", exp: 1, skill: 3 },
    { first: "Leo", last: "L", weight: 56, birthdate: "2014-12-05", exp: 0, skill: 2 },
  );

  await page.goto("/meets");
  await page.getByPlaceholder("Meet name").fill("Week 1");
  await page.locator('input[type="date"]').fill("2026-01-15");

  await page.getByLabel("Tigers").check();
  await page.getByLabel("Bears").check();

  await page.getByRole("button", { name: "Create Meet" }).click();
  await expect(page.getByRole("link", { name: "Week 1" })).toBeVisible();

  await page.getByRole("link", { name: "Week 1" }).click();
  await expect(page.getByRole("heading", { name: "Meet Pairings" })).toBeVisible();

  await page.getByRole("button", { name: "Generate Pairings" }).click();

  // Should show at least 2 bouts (4 wrestlers)
  await expect(page.locator("table tbody tr")).toHaveCount(2);

  await page.getByRole("button", { name: "Assign Mats" }).click();
  // Enter result for first bout
  await page.locator('table tbody tr').first().locator('select').first().selectOption({ index: 1 });
  await page.locator('table tbody tr').first().getByPlaceholder('Type').fill('DEC');
  await page.locator('table tbody tr').first().getByPlaceholder('Score').fill('6-2');
  await page.locator('table tbody tr').first().getByPlaceholder('Per').fill('3');
  await page.locator('table tbody tr').first().getByPlaceholder('Time').fill('2:45');
  await page.locator('table tbody tr').first().getByRole('button', { name: 'Save' }).click();


  // Lock first bout
  await page.locator("table tbody tr").first().getByRole("button", { name: /Lock|Unlock/ }).click();
  await expect(page.locator("table tbody tr").first().getByRole("button", { name: "Unlock" })).toBeVisible();
});
