import { test, expect } from "@playwright/test";

import { resetDb, login } from "./helpers";

test.beforeEach(async () => {
  await resetDb();
});

test("CSV import creates and then re-import overwrites existing by name+birthday", async ({ page }) => {
  await login(page);

  await page.goto("/rosters");

  // Create team
  await page.getByPlaceholder("Team name").fill("Tigers");
  await page.getByRole("button", { name: "Add" }).click();

  // Select team for import
  await page.getByLabel("Existing team").selectOption({ label: "Tigers" });

  // Upload a CSV via file chooser
  const csv1 = `first,last,weight,birthdate,experienceYears,skill
Jason,Nolf,52,2015-03-11,1,3
`;
  await page.setInputFiles('input[type="file"]', {
    name: "roster.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv1),
  });

  await page.getByRole("button", { name: "Import Roster" }).click();
  await expect(page.getByText(/Imported 1 wrestlers/i)).toBeVisible();

  // Re-import with different weight/exp/skill for same name+bday -> should update not duplicate
  const csv2 = `first,last,weight,birthdate,experienceYears,skill
Jason,Nolf,60,2015-03-11,2,5
`;
  await page.setInputFiles('input[type="file"]', {
    name: "roster2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv2),
  });
  await page.getByRole("button", { name: "Import Roster" }).click();
  await expect(page.getByText(/Imported/i)).toBeVisible();

  // Check team roster reflects updated fields
  await page.getByRole("link", { name: "Tigers" }).click();
  await expect(page.getByText("Jason Nolf")).toBeVisible();
  await expect(page.getByText("60")).toBeVisible();
  await expect(page.getByText("2")).toBeVisible();
  await expect(page.getByText("5")).toBeVisible();
});
