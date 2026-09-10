import { cleanSignature } from '../../src/domain/branding.js';
import type { Config } from '../../src/domain/models.js';
import { chromium, type Browser, type Page } from 'playwright';
import { DataError } from './storage.js';
// A local Playwright/Edge browser takes ~1s to launch. PDF generation and branding
// checks happen often in a single session, so one instance is kept warm and reused
// across requests instead of launching and closing a new process every time.
let sharedBrowser: Promise<Browser> | undefined;
export function getBrowser() {
  if (!sharedBrowser) {
    sharedBrowser = chromium.launch({ channel: 'msedge', headless: true, timeout: 30_000 });
    sharedBrowser
      .then((browser) => browser.on('disconnected', () => (sharedBrowser = undefined)))
      .catch(() => (sharedBrowser = undefined));
  }
  return sharedBrowser;
}
export async function closeBrowser() {
  if (!sharedBrowser) return;
  const browser = await sharedBrowser.catch(() => undefined);
  sharedBrowser = undefined;
  await browser?.close();
}
export const signatureStyle =
  'font:10px/1.4 Arial,sans-serif;color:#637168;overflow-wrap:anywhere;text-align:center';
export const signatureReset =
  '<style>.signature p,.signature div{margin:0}.signature a{color:inherit}</style>';
export async function measureBranding(page: Page, config: Config) {
  await page.setContent(
    `<div id="footer" style="width:172mm;${signatureStyle}">${signatureReset}<div class="signature">${cleanSignature(config.signatureHtml)}</div><div style="margin-top:6px">1 / 1</div></div>${config.logoDataUrl ? `<img src="${config.logoDataUrl}">` : ''}`,
  );
  const height = await page.locator('#footer').evaluate((el) => el.getBoundingClientRect().height);
  if (height > 240)
    throw new DataError(
      'La signature est trop haute pour le pied de page. Réduisez les retours à la ligne dans les paramètres.',
      400,
    );
  const valid = await page
    .locator('img')
    .evaluateAll((images) =>
      images.every(
        (image) =>
          (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0,
      ),
    );
  if (!valid)
    throw new DataError(
      'Le logo est illisible. Sélectionnez à nouveau une image dans les paramètres.',
      400,
    );
  return height;
}
export async function validateBranding(config: Config) {
  const browser = await getBrowser();
  const page = await browser.newPage({ javaScriptEnabled: false });
  try {
    page.setDefaultTimeout(15_000);
    await page.route('**/*', (route) => route.abort());
    await measureBranding(page, config);
  } finally {
    await page.close();
  }
}
export function footerHtml(config: Config) {
  return `${signatureReset}<div style="width:100%;padding:0 19mm;${signatureStyle}"><div style="border-top:1px solid #dbe2e8;padding-top:8px"><div class="signature">${cleanSignature(config.signatureHtml)}</div><div style="margin-top:6px">Page <span class="pageNumber"></span> / <span class="totalPages"></span></div></div></div>`;
}
export function brandDocument(html: string, config: Config) {
  const brand = config.logoDataUrl
    ? `<img class="logo" src="${config.logoDataUrl}" alt="Logo de l’association">`
    : undefined;
  if (brand) html = html.replace(/<div class="brand">[\s\S]*?<\/div>/, () => brand);
  return html
    .replace('@page{size:A4;margin:20mm 19mm 22mm}', '@page{size:A4}')
    .replace(
      '</style>',
      `.logo{max-width:65mm;max-height:26mm;object-fit:contain}.brand{overflow-wrap:anywhere}.signature{${signatureStyle};margin-top:24px}.signature p,.signature div{margin:0}@media print{body>.signature{display:none}}</style>`,
    );
}
