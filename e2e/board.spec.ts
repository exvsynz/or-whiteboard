import { test, expect, type Page } from "@playwright/test";

// Demo mode (NEXT_PUBLIC_DEMO_MODE=true): editor role, localStorage-backed.
// Each test starts with cleared storage so the demo roster loads fresh.

async function gotoBoard(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "手術室人力白板" }),
  ).toBeVisible();
  // Board body renders after the async initial load.
  await expect(page.getByText("王小明")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
});

test("board loads demo roster with stats", async ({ page }) => {
  await gotoBoard(page);
  await expect(page.getByText("林怡君")).toBeVisible();
  await expect(page.getByText("總人數")).toBeVisible();
  // Demo roster: 6 people, all assigned.
  await expect(page.locator("text=總人數").locator("b")).toHaveText("6");
});

test("date navigation shows an empty board for tomorrow and restores today", async ({
  page,
}) => {
  await gotoBoard(page);
  await page.getByRole("button", { name: "後一天" }).click();
  await expect(page.getByText("王小明")).toHaveCount(0);
  await page.getByRole("button", { name: "今天" }).click();
  await expect(page.getByText("王小明")).toBeVisible();
});

test("drag moves a person between rooms", async ({ page }) => {
  await gotoBoard(page);

  const card = page.getByText("王小明");
  const target = page.locator('[data-area="R2"]');
  const cardBox = (await card.boundingBox())!;
  const targetBox = (await target.boundingBox())!;

  // MouseSensor has a 10px activation distance — move in steps.
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
    page.locator('[data-area="R2"]').getByText("王小明"),
  ).toBeVisible();
});

test("room status dialog sets a status chip", async ({ page }) => {
  await gotoBoard(page);
  await page.getByRole("button", { name: "設定 R3 狀態" }).click();
  await page.getByRole("button", { name: "手術中" }).click();
  await page.getByRole("button", { name: "儲存" }).last().click();
  await expect(
    page.locator('[data-area="R3"]').getByText("手術中"),
  ).toBeVisible();
});

test("fit-to-screen shrinks overflowing columns and stays within the viewport", async ({
  page,
}) => {
  // Seed an overflowing roster (30 people in one fixed-task column).
  await page.evaluate(() => {
    const d = new Date();
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const people = Array.from({ length: 30 }, (_, i) => ({
      id: `seed-${i}`,
      name: `測試${i}`,
      role: "麻醉護理師",
      color: "bg-amber-100",
      area: "OPD前台",
    }));
    localStorage.setItem(
      `or-whiteboard-board:${date}`,
      JSON.stringify({ savedAt: new Date().toISOString(), people }),
    );
  });
  await page.reload();
  await expect(page.getByText("測試0")).toBeVisible();

  await page.getByRole("button", { name: /縮放/ }).click();
  // recalc runs in a rAF and React commits after it.
  await page.waitForTimeout(400);

  const result = await page.evaluate(() => {
    const cols = [
      ...document.querySelectorAll<HTMLElement>("[data-scroll-col]"),
    ];
    return {
      overflowing: cols.some((c) => c.scrollHeight > c.clientHeight + 1),
      rightMost: Math.max(
        ...cols.map((c) => c.getBoundingClientRect().right),
      ),
      viewportWidth: window.innerWidth,
    };
  });
  // No column may still scroll, and nothing may be pushed off-screen
  // (the width-compensation regression pushed columns past the right edge).
  expect(result.overflowing).toBe(false);
  expect(result.rightMost).toBeLessThanOrEqual(result.viewportWidth + 1);
});

test("add person lands in 未分派 and save confirms", async ({ page }) => {
  await gotoBoard(page);
  await page.getByPlaceholder("新增人名").fill("測試新人");
  await page.getByRole("button", { name: "新增" }).click();
  await expect(
    page.locator('[data-area="未分派"]').getByText("測試新人"),
  ).toBeVisible();

  await page.getByRole("button", { name: "儲存" }).first().click();
  await expect(page.getByText("已儲存")).toBeVisible();
});
