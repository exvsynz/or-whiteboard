import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "..", "demo-班表.csv");

async function main() {
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

  // Debug: check every element from html down for overflow issues
  const debug = await page.evaluate(() => {
    const results = [];
    let el = document.documentElement;
    const chain = [];

    // Walk from html -> body -> board div -> inner wrapper
    while (el) {
      const cs = getComputedStyle(el);
      chain.push({
        tag: el.tagName + (el.className ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''),
        height: cs.height,
        maxHeight: cs.maxHeight,
        overflow: cs.overflow,
        overflowY: cs.overflowY,
        position: cs.position,
        zoom: cs.zoom,
        scrollH: el.scrollHeight,
        clientH: el.clientHeight,
        canScroll: el.scrollHeight > el.clientHeight,
      });
      // Go to first child that's a div or body
      el = el.querySelector(':scope > body, :scope > div[class]');
    }
    results.push({ chain });

    // Try programmatic scroll
    const beforeY = window.scrollY;
    window.scrollBy(0, 100);
    const afterY = window.scrollY;
    results.push({
      scrollTest: { beforeY, afterY, scrolled: afterY !== beforeY },
      docScrollH: document.documentElement.scrollHeight,
      docClientH: document.documentElement.clientHeight,
      bodyScrollH: document.body.scrollHeight,
      bodyClientH: document.body.clientHeight,
    });

    // Check if any ancestor has overflow:hidden
    const hiddenOverflow = [];
    document.querySelectorAll('*').forEach(el => {
      const cs = getComputedStyle(el);
      if ((cs.overflow === 'hidden' || cs.overflowY === 'hidden') && el.scrollHeight > el.clientHeight) {
        hiddenOverflow.push({
          tag: el.tagName + '.' + el.className.split(' ').slice(0, 2).join('.'),
          overflowY: cs.overflowY,
          scrollH: el.scrollHeight,
          clientH: el.clientHeight,
        });
      }
    });
    results.push({ hiddenOverflow });

    return results;
  });

  console.log(JSON.stringify(debug, null, 2));

  await page.screenshot({ path: "screenshot-debug-scroll.png" });

  // Keep open for manual testing
  console.log("\n--- Browser is open. Try scrolling manually. Press Ctrl+C to close. ---");
  await page.waitForTimeout(120000);
  await browser.close();
}

main().catch(console.error);
