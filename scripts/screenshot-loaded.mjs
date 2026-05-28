import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "..", "demo-班表.csv");

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Import the CSV
  await page.getByRole("button", { name: /匯入班表/ }).click();
  await page.waitForTimeout(500);
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(csvPath);
  await page.waitForTimeout(1000);
  const importBtn = page.getByRole("button", { name: /匯入.*人/ });
  await importBtn.click();
  await page.waitForTimeout(2000);

  // Screenshots
  await page.screenshot({ path: "screenshot-loaded-viewport.png", fullPage: false });
  await page.screenshot({ path: "screenshot-loaded-fullpage.png", fullPage: true });

  // Measurements
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(`Content height: ${height}px, Viewport: 1080px, Overflow: ${height - 1080}px`);

  // Per-column heights in the grid
  const gridInfo = await page.evaluate(() => {
    const grid = document.querySelector('.grid.grid-cols-1');
    if (!grid) return "Grid not found";
    const children = Array.from(grid.children);
    return children.map((child, i) => {
      const rect = child.getBoundingClientRect();
      const label = child.getAttribute('aria-label') || `col-${i}`;
      return `${label}: h=${Math.round(rect.height)}px (top=${Math.round(rect.top)}, bottom=${Math.round(rect.bottom)})`;
    });
  });
  console.log("\nGrid columns:");
  for (const g of gridInfo) console.log(`  ${g}`);

  // Check if any content is below viewport
  const below = await page.evaluate(() => {
    const els = document.querySelectorAll('[aria-label]');
    const results = [];
    for (const el of els) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > 1080) {
        results.push(`${el.getAttribute('aria-label')}: bottom=${Math.round(rect.bottom)}px (+${Math.round(rect.bottom - 1080)}px over)`);
      }
    }
    return results;
  });
  if (below.length) {
    console.log("\nElements below viewport:");
    for (const b of below) console.log(`  ${b}`);
  } else {
    console.log("\nAll elements within viewport.");
  }

  await browser.close();
}

main().catch(console.error);
