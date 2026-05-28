import { chromium } from "playwright";

async function main() {
  // Launch headed so we match what user sees
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Don't set viewport — let it use real window size
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const board = document.querySelector('.flex.h-screen');
    const grid = document.querySelector('.grid.min-h-0');

    return {
      screen: { w: screen.width, h: screen.height },
      windowInner: { w: window.innerWidth, h: window.innerHeight },
      htmlScroll: { w: html.scrollWidth, h: html.scrollHeight },
      bodyScroll: { w: body.scrollWidth, h: body.scrollHeight },
      htmlStyles: {
        height: getComputedStyle(html).height,
        overflow: getComputedStyle(html).overflow,
        overflowY: getComputedStyle(html).overflowY,
      },
      bodyStyles: {
        height: getComputedStyle(body).height,
        minHeight: getComputedStyle(body).minHeight,
        overflow: getComputedStyle(body).overflow,
        overflowY: getComputedStyle(body).overflowY,
        display: getComputedStyle(body).display,
      },
      boardDiv: board ? {
        height: getComputedStyle(board).height,
        overflow: getComputedStyle(board).overflow,
        overflowY: getComputedStyle(board).overflowY,
        className: board.className,
        scrollH: board.scrollHeight,
        clientH: board.clientHeight,
      } : "NOT FOUND",
      gridDiv: grid ? {
        height: getComputedStyle(grid).height,
        overflow: getComputedStyle(grid).overflow,
        overflowY: getComputedStyle(grid).overflowY,
        scrollH: grid.scrollHeight,
        clientH: grid.clientHeight,
        isScrollable: grid.scrollHeight > grid.clientHeight,
      } : "NOT FOUND",
      devicePixelRatio: window.devicePixelRatio,
    };
  });

  console.log(JSON.stringify(info, null, 2));

  await page.screenshot({ path: "screenshot-real-window.png", fullPage: false });

  await page.waitForTimeout(3000);
  await browser.close();
}

main().catch(console.error);
