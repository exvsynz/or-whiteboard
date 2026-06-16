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

test("drag is disabled on phones — cards stay put (tap/scroll only)", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.getByText("王小明");
  await card.scrollIntoViewIfNeeded();
  const cardBox = (await card.boundingBox())!;
  const target = page.locator('[data-area="R2"]');
  const targetBox = (await target.boundingBox())!;

  // Same gesture the desktop test uses to reassign — must be a no-op here,
  // because the drag sensors are off below lg (so taps + scroll stay free).
  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();

  await expect(
    page.locator('[data-area="R1"]').getByText("王小明"),
  ).toBeVisible();
  await expect(
    page.locator('[data-area="R2"]').getByText("王小明"),
  ).toHaveCount(0);
});
