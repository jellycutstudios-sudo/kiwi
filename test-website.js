import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  // Intercept network requests to see Firebase API calls
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('firestore.googleapis.com')) {
      console.log('Firestore request URL:', request.url());
    }
    request.continue();
  });

  await page.goto('https://dine.rupos.in/login', { waitUntil: 'networkidle0' });
  console.log("Page loaded");

  const title = await page.title();
  console.log("Title:", title);

  await browser.close();
})();
