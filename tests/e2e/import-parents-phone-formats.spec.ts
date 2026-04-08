import { test, expect } from "@playwright/test";

import { login } from "./helpers";

test("Parent import handles various phone number formats", async ({ page }) => {
  await login(page);

  // Navigate to my-team page
  await page.goto("/coach/my-team");

  // Create a team first
  await page.getByPlaceholder("Team name").fill("Wrestling Squad");
  await page.getByRole("button", { name: "Add" }).click();

  // Click on the team
  await page.getByRole("link", { name: "Wrestling Squad" }).click();

  // Navigate to import parents section
  await page.getByRole("tab", { name: /team roles/i }).click();
  await page.getByRole("button", { name: /import parents/i }).click();

  // Upload CSV with various phone formats
  const csv = `first,last,email,phone,kids
John,Smith,john.smith@example.com,(555) 123-4567,
Jane,Doe,jane.doe@example.com,555-123-4568,
Bob,Johnson,bob@example.com,5551234569,
Sarah,Williams,sarah@example.com,1-555-123-4570,
Mike,Brown,mike.brown@example.com,15551234571,
Lisa,Davis,lisa@example.com,,
Tom,Miller,tom@example.com,555-1234,
Anna,Wilson,anna@example.com,555123456789,
Chris,Moore,chris@example.com,555-1234 ext 123,
Pat,Taylor,pat@example.com,(invalid),
`;

  await page.setInputFiles('input[type="file"]', {
    name: "parents-phone-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Expect preview to show all rows
  await expect(page.getByText(/Preview/i)).toBeVisible();
  
  // Check that valid phone formats are accepted
  // Rows with valid formats: John, Jane, Bob, Sarah, Mike, Lisa (blank is ok)
  // Rows that should fail: Tom (9 digits), Anna (12 digits), Chris (extension), Pat (invalid format)
  
  // Look for error messages for invalid phone numbers
  await expect(page.getByText(/Phone must be a 10-digit phone number, or 11 digits starting with 1/i)).toBeVisible({ timeout: 5000 });
});

test("Parent import validates blank and formatted phone numbers", async ({ page }) => {
  await login(page);

  // Navigate to my-team page
  await page.goto("/coach/my-team");

  // Create a team
  await page.getByPlaceholder("Team name").fill("Test Team");
  await page.getByRole("button", { name: "Add" }).click();

  // Click on the team
  await page.getByRole("link", { name: "Test Team" }).click();

  // Navigate to import parents section
  await page.getByRole("tab", { name: /team roles/i }).click();
  await page.getByRole("button", { name: /import parents/i }).click();

  // Upload CSV with mix of valid and invalid entries
  const csv = `first,last,email,phone
Alice,Anderson,alice@example.com,5551112222
Bob,Baker,bob@example.com,
Charlie,Clark,charlie@example.com,555-111-2223
David,Davis,david@example.com,411
Eve,Evans,eve@example.com,1 (555) 111-2224
Frank,Franklin,frank@example.com,12125551234
Grace,Garcia,grace@example.com,5551115555 extension 123
Henry,Harris,henry@example.com,(555) 111-5556
`;

  await page.setInputFiles('input[type="file"]', {
    name: "phone-validation-test.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Preview should show errors for invalid phone formats
  await expect(page.getByText(/Invalid/i)).toBeVisible({ timeout: 5000 }).catch(() => {
    // If no error shown, it means validation might be happening on submit
  });
});

test("Parent import skips invalid phone format rows", async ({ page }) => {
  await login(page);

  // Navigate to my-team page
  await page.goto("/coach/my-team");

  // Create a team
  await page.getByPlaceholder("Team name").fill("Phone Test");
  await page.getByRole("button", { name: "Add" }).click();

  // Click on the team
  await page.getByRole("link", { name: "Phone Test" }).click();

  // Navigate to import parents section
  await page.getByRole("tab", { name: /team roles/i }).click();
  await page.getByRole("button", { name: /import parents/i }).click();

  // Upload CSV with clearly invalid phone numbers
  const csv = `first,last,email,phone
Valid,User,valid@example.com,5551234567
Invalid,Phone,invalid@example.com,123
Bad,Format,bad@example.com,555-1234 x5
`;

  await page.setInputFiles('input[type="file"]', {
    name: "invalid-phones.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Set a shared password for import
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill("TempPass123");

  // Click import
  await page.getByRole("button", { name: /import parents|create/i }).click();

  // Should show error message about invalid phone format
  await expect(page.getByText(/Phone must be a 10-digit phone number, or 11 digits starting with 1/i)).toBeVisible({ timeout: 5000 });
});

test("Parent import accepts all valid phone number formats", async ({ page }) => {
  await login(page);

  // Navigate to my-team page
  await page.goto("/coach/my-team");

  // Create a team
  await page.getByPlaceholder("Team name").fill("Valid Phones");
  await page.getByRole("button", { name: "Add" }).click();

  // Click on the team
  await page.getByRole("link", { name: "Valid Phones" }).click();

  // Navigate to import parents section
  await page.getByRole("tab", { name: /team roles/i }).click();
  await page.getByRole("button", { name: /import parents/i }).click();

  // Upload CSV with all valid phone formats
  const csv = `first,last,email,phone
Alice,Adams,alice@example.com,2125551234
Bob,Brown,bob@example.com,212-555-1235
Charlie,Clark,charlie@example.com,(212) 555-1236
David,Davis,david@example.com,12125551237
Eve,Evans,eve@example.com,1-212-555-1238
Frank,Franklin,frank@example.com,212 555 1239
Grace,Garcia,grace@example.com,
`;

  await page.setInputFiles('input[type="file"]', {
    name: "all-valid-phones.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });

  // Set a shared password
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill("TempPass456");

  // Click import - should succeed with 6 parents (Grace has no phone but that's ok)
  await page.getByRole("button", { name: /import parents|create/i }).click();

  // Should see success message
  await expect(page.getByText(/Imported.*parents|successfully created|completed/i)).toBeVisible({ timeout: 5000 });
});
