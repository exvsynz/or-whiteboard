import { test, expect } from "@playwright/test";

test("board page loads with heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "手術室人力白板" })).toBeVisible();
});
