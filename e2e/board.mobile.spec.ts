import { test, expect } from "@playwright/test";

// Leaders check the board on their phones, so it must reflow into a stacked,
// page-scrolling layout rather than staying locked to the wall-display kiosk.
test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("board reflows for a phone: renders stacked, fit-to-screen hidden, page scrolls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "手術室人力白板" }),
  ).toBeVisible();
  // Demo roster + a left-column task both render (content not clipped away).
  await expect(page.getByText("王小明")).toBeVisible();
  await expect(page.getByText("OPD前台").first()).toBeVisible();

  // The wall-display-only fit-to-screen control is hidden on phones.
  await expect(page.getByTitle("自動縮放至螢幕大小")).toBeHidden();

  // The page scrolls (content taller than the viewport) instead of being
  // locked to a single screen height.
  const scrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > window.innerHeight + 10,
  );
  expect(scrolls).toBe(true);
});
