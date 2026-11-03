// Browser smoke test: every route at desktop and phone width, then the full
// demo paper-order journey. Uses an installed Chrome or Edge (playwright-core).
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/e2e-smoke.mjs [http://127.0.0.1:4173] [screenshot-dir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const SHOTS = process.argv[3] ?? null;
const exe = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && fs.existsSync(p));

const ROUTES = ['/', '/find', '/workspace/context', '/workspace/entry', '/workspace/exit', '/workspace/replay', '/workspace/size', '/workspace/review', '/research/company', '/research/disclosures', '/orders', '/alerts', '/settings'];
const fail = [];
const ok = (cond, msg) => { if (!cond) fail.push(msg); console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); };

const browser = await chromium.launch({ executablePath: exe, headless: true });

for (const vp of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: vp.name === 'phone' ? 'dark' : 'light' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  for (const r of ROUTES) {
    await page.goto(`${BASE}/#${r}`);
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 1, `${vp.name} ${r}: no horizontal page scroll (${overflow}px)`);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.name}${r.replace(/\//g, '_') || '_home'}.png`, fullPage: vp.name === 'desktop' });
  }
  ok(errors.length === 0, `${vp.name}: no console or page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

// ---------------------------------------------------------------- the journey
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`${BASE}/#/settings`);
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/#/find`);
await page.getByPlaceholder(/Search symbol/).fill('TSLA');
await page.waitForTimeout(500);
ok(await page.getByText('TSLA', { exact: true }).first().isVisible(), 'find: TSLA listed');
ok(await page.getByText(/Partial scan: 233 of 234/).isVisible(), 'find: partial coverage shown (1 chart failed)');
await page.getByRole('button', { name: 'View setup' }).first().click();
await page.waitForURL(/workspace\/context/);
await page.waitForTimeout(1200);
ok(await page.getByText(/The 10:10 candle closed at 364.18 at 10:15 AM, \+0.55% above the opening-range high 362.18/).first().isVisible(), 'context: factual match reason');

await page.goto(`${BASE}/#/workspace/entry`);
await page.getByRole('button', { name: '10:12 AM' }).click();
ok(await page.getByText('Waiting', { exact: true }).isVisible(), 'entry 10:12: waiting');
ok(await page.getByText(/The 10:10 candle is still forming/).isVisible(), 'entry 10:12: forming candle does not count');
await page.getByRole('button', { name: '10:15 AM' }).click();
ok(await page.getByText('Triggered', { exact: true }).isVisible(), 'entry 10:15: triggered');

await page.getByRole('button', { name: 'Plan the exit' }).click();
await page.waitForURL(/workspace\/exit/);
await page.waitForTimeout(400);
ok(await page.getByText('358.32').first().isVisible(), 'exit: midpoint stop 358.32');
ok(await page.getByText('370.04').first().isVisible(), 'exit: 1R target 370.04');
await page.getByRole('button', { name: 'Save plan' }).click();
ok(await page.getByText('Plan v1 saved').isVisible(), 'exit: plan v1 saved');

await page.goto(`${BASE}/#/workspace/replay`);
await page.waitForTimeout(800);
ok(await page.getByText('29.2%').first().isVisible(), 'replay: target first 29.2%');
ok(await page.getByText(/Close to a coin flip/).isVisible(), 'replay: verdict printed by the tool');
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/journey_${name}.png`, fullPage: true }); };
await shot('replay');

await page.goto(`${BASE}/#/workspace/size`);
await page.waitForTimeout(300);
ok(await page.getByText('8 shares').first().isVisible(), 'size: 8 shares');
ok(await page.getByText('$46.88').first().isVisible(), 'size: $46.88 at the stop');
await page.getByRole('button', { name: 'Run the rules check' }).click();
ok(await page.getByText('All rules within configured limits').isVisible(), 'rules: within configured limits');
await shot('size');

// switching modes keeps the plan and the check
await page.getByRole('radio', { name: 'Pro' }).click();
ok(await page.getByText('All rules within configured limits').isVisible(), 'mode switch keeps the check');
await page.getByRole('radio', { name: 'Beginner' }).click();

// a change invalidates the check: risk allowance 40 -> 6 shares, new fingerprint
await page.locator('#sz-risk').fill('40');
await page.waitForTimeout(300);
ok(await page.getByText('All rules within configured limits').count() === 0, 'changing the size invalidates the earlier check');
await page.locator('#sz-risk').fill('50');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /Run the (rules check|check again)/ }).click();

await page.goto(`${BASE}/#/workspace/review`);
const confirm = page.getByRole('button', { name: 'Confirm paper order' });
ok(await confirm.isDisabled(), 'review: confirm disabled before the box is ticked');
await page.getByRole('checkbox').check();
ok(await confirm.isEnabled(), 'review: confirm enabled after a PASS and the tick');
await shot('review');
await page.setViewportSize({ width: 390, height: 844 });
await shot('review_phone');
await page.setViewportSize({ width: 1280, height: 900 });
await confirm.click();
await page.waitForTimeout(1800);
await page.goto(`${BASE}/#/orders`);
await page.waitForTimeout(300);
ok(await page.getByText('Filled', { exact: true }).first().isVisible(), 'orders: demo paper order filled');
ok(await page.getByText(/BUY 8 TSLA/).first().isVisible(), 'orders: BUY 8 TSLA');
await shot('orders');
await page.goto(`${BASE}/#/`);
await page.waitForTimeout(600);
await shot('overview');

// keyboard: skip link and a jargon term on focus
await page.goto(`${BASE}/#/workspace/size`);
await page.keyboard.press('Tab');
ok(await page.getByText('Skip to content').isVisible(), 'keyboard: skip link appears on Tab');
await page.getByRole('button', { name: 'What is Position size?' }).focus();
ok(await page.getByRole('tooltip').isVisible(), 'keyboard: jargon opens on focus');

// Hinglish
await page.getByRole('radio', { name: 'Hinglish' }).click();
await page.goto(`${BASE}/#/workspace/entry`);
await page.getByRole('button', { name: '10:12 AM' }).click();
ok(await page.getByText(/Abhi condition complete nahi hui. Alert laga sakte ho./).isVisible(), 'hinglish: entry copy');
ok(errs.length === 0, `journey: no page errors${errs.length ? ': ' + errs.join(' | ') : ''}`);

await browser.close();
console.log(fail.length ? `\n${fail.length} check(s) failed` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
