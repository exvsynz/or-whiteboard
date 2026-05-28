import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "..", "demo-班表.csv");

async function main() {
  // Real browser viewport on 1080p = ~960-980px after chrome
  const viewportHeights = [960, 900, 800];

  for (const vh of viewportHeights) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1920, height: vh } });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Import CSV
    await page.getByRole("button", { name: /匯入班表/ }).click();
    await page.waitForTimeout(500);
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /匯入.*人/ }).click();
    await page.waitForTimeout(1500);

    const contentH = await page.evaluate(() => document.documentElement.scrollHeight);
    const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight);
    console.log(`\nViewport ${vh}px: content=${contentH}px, overflow=${contentH - vh}px, canScroll=${canScroll}`);

    // Check what's cut off
    const clipped = await page.evaluate((viewH) => {
      const sections = document.querySelectorAll('section[aria-label], header, [class*="rounded"]');
      const results = [];
      for (const el of sections) {
        const rect = el.getBoundingClientRect();
        if (rect.bottom > viewH && rect.top < viewH) {
          const label = el.getAttribute('aria-label') || el.textContent?.slice(0, 20) || 'unknown';
          results.push(`CLIPPED: "${label}" top=${Math.round(rect.top)} bottom=${Math.round(rect.bottom)}`);
        } else if (rect.top >= viewH) {
          const label = el.getAttribute('aria-label') || el.textContent?.slice(0, 20) || 'unknown';
          results.push(`HIDDEN: "${label}" top=${Math.round(rect.top)}`);
        }
      }
      return results;
    }, vh);

    for (const c of clipped) console.log(`  ${c}`);

    await page.screenshot({ path: `screenshot-${vh}px.png`, fullPage: false });
    await browser.close();
  }
}

main().catch(console.error);
