import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
  const pages = await browser.pages();
  const page = pages.find(p => p.url().includes('localhost:5173/pos'));
  if (!page) {
    console.error('POS page not found');
    browser.disconnect();
    return;
  }

  // 1. Tablet (1024x768 iPad / POS Screen)
  await page.setViewport({ width: 1024, height: 768 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: '/Users/salman/.gemini/antigravity-ide/brain/cd7e9df6-519b-4346-a6de-84b3a04cdf42/tablet_1024x768_optimized.png' });

  // 2. Compact Tablet (800x600)
  await page.setViewport({ width: 800, height: 600 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: '/Users/salman/.gemini/antigravity-ide/brain/cd7e9df6-519b-4346-a6de-84b3a04cdf42/tablet_800x600_optimized.png' });

  // 3. Mobile Phone (390x844 iPhone 14/15)
  await page.setViewport({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: '/Users/salman/.gemini/antigravity-ide/brain/cd7e9df6-519b-4346-a6de-84b3a04cdf42/mobile_390x844_optimized.png' });

  // 4. Desktop (1440x900)
  await page.setViewport({ width: 1440, height: 900 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: '/Users/salman/.gemini/antigravity-ide/brain/cd7e9df6-519b-4346-a6de-84b3a04cdf42/desktop_1440x900_optimized.png' });

  // Inspect sidebar to confirm install button is gone
  const sidebarButtons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.sidebar-footer button')).map(b => ({
      title: b.title,
      text: b.innerText.trim()
    }));
  });
  console.log('Sidebar footer buttons:', sidebarButtons);

  browser.disconnect();
  console.log('All responsive viewports tested and screenshots captured');
})();
