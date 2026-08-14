import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.CRM_URL || 'https://clean-lead-dream.lovable.app';
const OUT = process.env.SCREENSHOT_DIR || 'manual-screenshots';

const roleRoutes = {
  '00-shared-workflow-guarantee': [
    '/', '/tower', '/tower/workflow-guarantee', '/queue', '/handoffs', '/follow-ups', '/activity', '/health', '/help'
  ],
  '01-control-tower': [
    '/tower', '/tower/workflow-guarantee', '/tower/review', '/control-tower-team', '/manager', '/zone-brain', '/monitoring', '/heatmap', '/leaderboard', '/revenue', '/health'
  ],
  '02-flow-ops': [
    '/', '/today', '/execution', '/myt/flow-ops', '/myt/marketplace', '/queue', '/follow-ups', '/activity', '/handoffs', '/academy'
  ],
  '03-tour-conversion-manager': [
    '/myt/tcm', '/calendar', '/today', '/queue', '/handoffs', '/follow-ups', '/activity', '/academy', '/coach'
  ],
  '04-closing-specialist': [
    '/closing', '/myt/closing', '/queue', '/follow-ups', '/handoffs', '/activity', '/revenue', '/leaderboard'
  ],
  '05-supply-pcm': [
    '/supply-hub', '/supply-hub/match', '/supply-hub/areas', '/myt/marketplace', '/zone-brain', '/activity', '/handoffs'
  ],
  '06-zone-owner-manager': [
    '/manager', '/zone-brain', '/heatmap', '/monitoring', '/leaderboard', '/revenue', '/control-tower-team', '/health'
  ],
  '07-hr-qa-training': [
    '/academy', '/coach', '/tower/review', '/control-tower-team', '/heatmap', '/leaderboard', '/activity'
  ],
  '08-property-owner': [
    '/owner', '/owner/rooms', '/owner/insights', '/supply-hub', '/supply-hub/areas', '/activity'
  ],
  '09-admin-leadership': [
    '/health', '/manager', '/monitoring', '/tower', '/zone-brain', '/revenue', '/leaderboard', '/help'
  ]
};

const slug = (s) => s.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'home';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(2200);
}

async function dismissOnboarding(page) {
  await page.evaluate(() => {
    try { localStorage.setItem('gharpayy.onboarding.completed.v1', '1'); } catch {}
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  for (const name of [/skip walkthrough/i, /^skip$/i, /got it/i, /close/i]) {
    const btn = page.getByRole('button', { name });
    if (await btn.count()) {
      const first = btn.first();
      if (await first.isVisible().catch(() => false)) {
        await first.click({ force: true }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }
}

async function capture(page, role, route) {
  const dir = path.join(OUT, role);
  await ensureDir(dir);
  const target = new URL(route, BASE_URL).toString();
  const file = path.join(dir, `${slug(route)}.png`);
  try {
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await settle(page);
    await dismissOnboarding(page);
    await page.screenshot({ path: file, fullPage: true, animations: 'disabled', timeout: 30000 });
    console.log(`CAPTURED ${role} ${route} -> ${file}`);
  } catch (err) {
    console.error(`FAILED ${role} ${route}: ${err.message}`);
    // Capture whatever is visible so the manual still has an evidence image.
    try {
      await ensureDir(dir);
      await page.screenshot({ path: path.join(dir, `${slug(route)}-failed-visible.png`), fullPage: false, timeout: 10000 });
    } catch {}
  }
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  try { localStorage.setItem('gharpayy.onboarding.completed.v1', '1'); } catch {}
});
const page = await context.newPage();
page.on('pageerror', err => console.error('PAGEERROR', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE', msg.text()); });

for (const [role, routes] of Object.entries(roleRoutes)) {
  const unique = [...new Set(routes)];
  for (const route of unique) await capture(page, role, route);
}

await browser.close();
console.log('Screenshot capture complete.');
