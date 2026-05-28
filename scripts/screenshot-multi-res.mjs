import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "..", "demo-班表.csv");

const resolutions = [
  { name: "720p", w: 1280, h: 720 },
  { name: "1080p", w: 1920, h: 1080 },
  { name: "4K", w: 3840, h: 2160 },
];

async function main() {
  for (const res of resolutions) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: res.w, height: res.h } });
    await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    // Import CSV
    await page.getByRole("button", { name: /匯入班表/ }).click();
    await page.waitForTimeout(500);
    await page.locator('input[type="file"]').setInputFiles(csvPath);
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /匯入.*人/ }).click();
    await page.waitForTimeout(1500);

    const info = await page.evaluate(() => ({
      contentH: document.documentElement.scrollHeight,
      viewportH: window.innerHeight,
      canScroll: document.documentElement.scrollHeight > window.innerHeight,
    }));

    const overflow = info.contentH - info.viewportH;
    const status = overflow <= 0 ? "FITS" : `SCROLLS ${overflow}px`;
    console.log(`${res.name} (${res.w}x${res.h}): content=${info.contentH}px ${status}`);

    await page.screenshot({ path: `screenshot-${res.name}.png`, fullPage: false });
    await browser.close();
  }
}

main().catch(console.error);
