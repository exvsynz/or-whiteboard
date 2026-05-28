import { chromium } from "playwright";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const csvPath = path.resolve(__dirname, "..", "demo-班表.csv");

async function main() {
  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  console.log("Opening board...");
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  console.log("Clicking 匯入班表...");
  await page.getByRole("button", { name: /匯入班表/ }).click();
  await page.waitForTimeout(500);

  console.log("Uploading CSV...");
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(csvPath);
  await page.waitForTimeout(1000);

  console.log("Enabling animated playback...");
  const checkbox = page.getByLabel(/動畫/);
  if (await checkbox.isVisible()) {
    await checkbox.check();
  }
  await page.waitForTimeout(300);

  console.log("Clicking import button...");
  const importBtn = page.getByRole("button", { name: /匯入.*人/ });
  await importBtn.click();

  console.log("Playback running — watch the board fill up!");
  console.log("Press Ctrl+C to close when done.");

  // Keep browser open
  await page.waitForTimeout(600000);
  await browser.close();
}

main().catch(console.error);
