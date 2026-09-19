import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');
const iconsDir = path.resolve(publicDir, 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

function getIconHtml(size) {
  const markHeight = Math.round(size * 0.57);
  const markWidth = Math.round(markHeight * (76.89 / 101.79));
  const shadowBlur = Math.max(4, Math.round(size * 0.06));
  const shadowY = Math.max(2, Math.round(size * 0.025));

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body {
        width: ${size}px;
        height: ${size}px;
        overflow: hidden;
      }
      body {
        background: radial-gradient(circle at 50% 30%, #1e2028 0%, #0b0c10 100%);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .logo {
        width: ${markWidth}px;
        height: ${markHeight}px;
        filter: drop-shadow(0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, 0.55));
      }
    </style>
  </head>
  <body>
    <svg class="logo" viewBox="0 0 77 102" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M76.88 38.45C76.88 49.07 72.58 58.67 65.62 65.63C62.6 68.65 59.07 71.18 55.17 73.06C50.11 75.51 44.43 76.89 38.43 76.89H0V10.11C0 7.53 0.97 5.17 2.56 3.39C4.41 1.31 7.1 0 10.1 0H38.44C59.67 0 76.88 17.21 76.88 38.44V38.45Z" fill="#FFFFFF"/>
      <path d="M76.88 101.79H10.11C4.53001 101.79 0.0100098 97.26 0.0100098 91.69V10.11C0.0100098 7.53 0.980009 5.17 2.57001 3.39L55.19 73.05L76.89 101.78L76.88 101.79Z" fill="#D1D5DB"/>
    </svg>
  </body>
  </html>`;
}

async function renderIcon(browser, size, outputPath) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(getIconHtml(size), { waitUntil: 'domcontentloaded' });
  await page.screenshot({
    path: outputPath,
    type: 'png',
    clip: { x: 0, y: 0, width: size, height: size }
  });
  await page.close();
  console.log(`Generated: ${outputPath} (${size}x${size})`);
}

async function generateAllIcons() {
  console.log('Launching browser to render icons...');
  const browser = await puppeteer.launch({ headless: 'new' });

  try {
    // 1. Android PWA Standard & Maskable Icons
    await renderIcon(browser, 512, path.resolve(iconsDir, 'icon-512.png'));
    await renderIcon(browser, 512, path.resolve(iconsDir, 'icon-maskable-512.png'));
    await renderIcon(browser, 192, path.resolve(iconsDir, 'icon-192.png'));
    await renderIcon(browser, 192, path.resolve(iconsDir, 'icon-maskable-192.png'));

    // 2. Apple Touch Icon (iOS home screen)
    await renderIcon(browser, 180, path.resolve(publicDir, 'apple-touch-icon.png'));

    // 3. Fallback / Favicon png
    await renderIcon(browser, 192, path.resolve(publicDir, 'fav.png'));
    await renderIcon(browser, 32, path.resolve(publicDir, 'favicon-32x32.png'));
    await renderIcon(browser, 16, path.resolve(publicDir, 'favicon-16x16.png'));

    console.log('All icons generated successfully!');
  } finally {
    await browser.close();
  }
}

generateAllIcons().catch(err => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
