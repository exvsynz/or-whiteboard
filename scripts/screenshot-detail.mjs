import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "..", "demo-班表.csv");

async function main() {
  // Launch HEADED at user's real resolution to see exactly what they see
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Import CSV
  await page.getByRole("button", { name: /匯入班表/ }).click();
  await page.waitForTimeout(500);
  await page.locator('input[type="file"]').setInputFiles(csvPath);
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /匯入.*人/ }).click();
  await page.waitForTimeout(2000);

  // Screenshot what user actually sees
  await page.screenshot({ path: "screenshot-real.png", fullPage: false });

  // Detailed measurements
  const info = await page.evaluate(() => {
    const result = {
      screen: `${screen.width}x${screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      dpr: window.devicePixelRatio,
    };

    // Check all text elements for truncation/overflow
    const broken = [];
    document.querySelectorAll("div, span, h1, h2, h3, p, button").forEach(el => {
      const style = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 2) {
        broken.push({
          tag: el.tagName,
          text: el.textContent?.slice(0, 30),
          clientW: el.clientWidth,
          scrollW: el.scrollWidth,
          overflow: style.overflow,
          textOverflow: style.textOverflow,
          whiteSpace: style.whiteSpace,
        });
      }
    });
    result.brokenText = broken.slice(0, 15);

    // Check scroll status of each column
    const scrollables = document.querySelectorAll(".board-grid-scroll");
    result.columns = Array.from(scrollables).map((el, i) => ({
      index: i,
      width: el.clientWidth,
      height: el.clientHeight,
      scrollH: el.scrollHeight,
      overflow: getComputedStyle(el).overflowY,
      touchAction: getComputedStyle(el).touchAction,
      pointerEvents: getComputedStyle(el).pointerEvents,
    }));

    // Check if DnD is blocking pointer events on the scroll containers
    const dndContext = document.querySelector("[data-dnd-context-id]");
    result.dndContextFound = !!dndContext;

    return result;
  });

  console.log(JSON.stringify(info, null, 2));

  await page.waitForTimeout(5000);
  await browser.close();
}

main().catch(console.error);
