import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.CRM_URL || 'https://clean-lead-dream.lovable.app';
const OUT = process.env.SCREENSHOT_DIR || 'manual-screenshots';

const roleRoutes = {
  '00-shared-workflow-guarantee': ['/', '/tower', '/queue', '/handoffs', '/health'],
  '01-control-tower': ['/tower', '/tower/review', '/control-tower-team', '/zone-brain', '/monitoring'],
  '02-flow-ops': ['/', '/today', '/execution', '/myt/flow-ops', '/myt/marketplace'],
  '03-tour-conversion-manager': ['/myt/tcm', '/calendar', '/today', '/queue', '/handoffs'],
  '04-closing-specialist': ['/closing', '/queue', '/follow-ups', '/revenue', '/leaderboard'],
  '05-supply-pcm': ['/supply-hub', '/supply-hub/match', '/supply-hub/areas', '/zone-brain'],
  '06-zone-owner-manager': ['/manager', '/zone-brain', '/heatmap', '/monitoring', '/revenue'],
  '07-hr-qa-training': ['/academy', '/coach', '/tower/review', '/control-tower-team'],
  '08-property-owner': ['/owner', '/owner/rooms', '/owner/insights', '/supply-hub'],
  '09-admin-leadership': ['/health', '/manager', '/tower', '/help']
};

const slug = (s) => s.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'home';
const ensureDir = (dir) => fs.mkdir(dir, { recursive: true });

async function capture(page, role, route) {
  const dir = path.join(OUT, role);
  await ensureDir(dir);
  const file = path.join(dir, `${slug(route)}.png`);
  const url = new URL(route, BASE_URL).toString();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 18000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => { try { localStorage.setItem('gharpayy.onboarding.completed.v1', '1'); } catch {} }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.screenshot({ path: file, fullPage: false, animations: 'disabled', timeout: 12000 });
    console.log(`CAPTURED ${role} ${route}`);
  } catch (err) {
    console.error(`FAILED ${role} ${route}: ${err.message}`);
    try { await page.screenshot({ path: path.join(dir, `${slug(route)}-failed.png`), fullPage: false, timeout: 8000 }); } catch {}
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addInitScript(() => { try { localStorage.setItem('gharpayy.onboarding.completed.v1', '1'); } catch {} });
const page = await context.newPage();

for (const [role, routes] of Object.entries(roleRoutes)) {
  for (const route of routes) await capture(page, role, route);
}

await browser.close();
console.log('Screenshot capture complete.');
