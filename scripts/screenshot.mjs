import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // Full page screenshot (shows everything including overflow)
  await page.screenshot({ path: "screenshot-fullpage.png", fullPage: true });

  // Viewport-only screenshot (shows what user actually sees)
  await page.screenshot({ path: "screenshot-viewport.png", fullPage: false });

  // Measure actual content height
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const viewportH = await page.evaluate(() => window.innerHeight);
  console.log(`Content height: ${height}px, Viewport: ${viewportH}px, Overflow: ${height - viewportH}px`);

  // Measure each section
  const sections = await page.evaluate(() => {
    const results = [];
    const container = document.querySelector('.space-y-2');
    if (container) {
      for (const child of container.children) {
        const rect = child.getBoundingClientRect();
        const label = child.getAttribute('aria-label') || child.tagName + '.' + child.className.slice(0, 30);
        results.push({ label, top: Math.round(rect.top), bottom: Math.round(rect.bottom), height: Math.round(rect.height) });
      }
    }
    return results;
  });
  console.log("\nSection layout:");
  for (const s of sections) {
    const visible = s.bottom <= 1080 ? "✓" : `✗ (${s.bottom - 1080}px over)`;
    console.log(`  ${s.label}: top=${s.top} bottom=${s.bottom} h=${s.height} ${visible}`);
  }

  await browser.close();
}

main().catch(console.error);
