import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.CRM_URL || 'https://clean-lead-dream.lovable.app';
const OUT = process.env.SCREENSHOT_DIR || 'manual-screenshots';

const roles = [
  { value: 'flow-ops', label: 'Flow Ops' },
  { value: 'tcm', label: 'TCM' },
  { value: 'hr', label: 'HR / Leadership' },
  { value: 'owner', label: 'Property Owner' },
];

const extraRoutes = [
  '/academy', '/closing', '/heatmap', '/revenue', '/leaderboard', '/manager', '/queue', '/zone-brain', '/monitoring', '/health', '/help',
  '/tower', '/tower/review', '/control-tower-team', '/supply-hub', '/supply-hub/match', '/supply-hub/areas',
];

const slug = (s) => s.replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'home';

async function ensureDir(dir) { await fs.mkdir(dir, { recursive: true }); }

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(1600);
}

async function selectRole(page, roleLabel) {
  const trigger = page.locator('text=View as').locator('..').locator('button').first();
  if (await trigger.count()) {
    await trigger.click();
    const option = page.getByRole('option', { name: roleLabel });
    if (await option.count()) await option.click();
    else {
      const fallback = page.getByText(roleLabel, { exact: true }).last();
      if (await fallback.count()) await fallback.click();
    }
    await page.waitForTimeout(700);
  }
}

async function capture(page, roleValue, route, suffix = '') {
  const dir = path.join(OUT, roleValue);
  await ensureDir(dir);
  const filename = `${slug(route)}${suffix}.png`;
  const file = path.join(dir, filename);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  console.log(`CAPTURED ${roleValue} ${route} -> ${file}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
const page = await context.newPage();

page.on('pageerror', err => console.error('PAGEERROR', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE', msg.text()); });

for (const role of roles) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
  await selectRole(page, role.label);

  await capture(page, role.value, '/');

  const roleRoutes = await page.locator('aside nav a[href]').evaluateAll(els => [...new Set(els.map(a => a.getAttribute('href')).filter(Boolean))]);
  console.log(`ROLE ${role.value} ROUTES`, roleRoutes);

  for (const route of roleRoutes) {
    try {
      await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);
      await selectRole(page, role.label);
      await settle(page);
      await capture(page, role.value, route);
    } catch (err) {
      console.error(`FAILED ${role.value} ${route}:`, err.message);
    }
  }

  for (const route of extraRoutes) {
    if (roleRoutes.includes(route)) continue;
    try {
      await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);
      await selectRole(page, role.label);
      await settle(page);
      await capture(page, role.value, route, '-extra');
    } catch (err) {
      console.error(`FAILED EXTRA ${role.value} ${route}:`, err.message);
    }
  }
}

await browser.close();
console.log('Screenshot capture complete.');
