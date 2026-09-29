import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9222' });
  const pages = await browser.pages();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    const dims = await p.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight, url: window.location.href }));
    console.log('Page ' + i + ':', dims);
    if (dims.url.includes('/pos')) {
      await p.screenshot({ path: '/Users/salman/.gemini/antigravity-ide/brain/cd7e9df6-519b-4346-a6de-84b3a04cdf42/pos_page_' + i + '_' + dims.w + 'x' + dims.h + '.png' });
    }
  }
  browser.disconnect();
})();
