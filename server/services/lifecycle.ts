import { closeBrowser } from './pdf-branding.js';

// Runs the exact same cleanup as Ctrl+C (closes the shared PDF browser) before exiting.
// Kept in its own module so the launcher's remote-shutdown route can be tested without
// ever actually terminating the test process — see tests/app.test.ts.
export async function shutdown() {
  await closeBrowser();
  process.exit(0);
}
