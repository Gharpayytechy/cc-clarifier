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
  await page.waitForTimeout(1400);
}

async function dismissBlockingOverlays(page) {
  // Dismiss the first-run walkthrough via the same localStorage contract the app uses.
  await page.evaluate(() => {
    try { localStorage.setItem('gharpayy.onboarding.completed.v1', '1'); } catch {}
  }).catch(() => {});

  // Close any transient Radix dialog / onboarding surface that may already have mounted.
  for (let i = 0; i < 4; i++) {
    const candidates = [
      page.getByRole('button', { name: /skip walkthrough/i }),
      page.getByRole('button', { name: /^skip$/i }),
      page.getByRole('button', { name: /close/i }),
      page.getByRole('button', { name: /dismiss/i }),
      page.getByRole('button', { name: /got it/i }),
    ];
    let clicked = false;
    for (const locator of candidates) {
      if (await locator.count()) {
        const first = locator.first();
        if (await first.isVisible().catch(() => false)) {
          await first.click({ force: true }).catch(() => {});
          clicked = true;
          await page.waitForTimeout(200);
          break;
        }
      }
    }
    await page.keyboard.press('Escape').catch(() => {});
    if (!clicked) break;
  }

  // Last-resort cleanup for non-business first-load modals only; this prevents
  // an overlay from blocking navigation during documentation capture.
  await page.evaluate(() => {
    document.querySelectorAll('[data-state="open"][aria-hidden="true"]').forEach((el) => {
      const htmlEl = el;
      if (htmlEl instanceof HTMLElement) htmlEl.style.pointerEvents = 'none';
    });
  }).catch(() => {});
}

async function selectRole(page, roleLabel) {
  await dismissBlockingOverlays(page);
  const trigger = page.locator('text=View as').locator('..').locator('button').first();
  if (await trigger.count()) {
    await trigger.click({ force: true, timeout: 10000 });
    await page.waitForTimeout(200);
    const option = page.getByRole('option', { name: roleLabel });
    if (await option.count()) await option.click({ force: true });
    else {
      const fallback = page.getByText(roleLabel, { exact: true }).last();
      if (await fallback.count()) await fallback.click({ force: true });
    }
    await page.waitForTimeout(600);
    await dismissBlockingOverlays(page);
  }
}

async function capture(page, roleValue, route, suffix = '') {
  const dir = path.join(OUT, roleValue);
  await ensureDir(dir);
  const filename = `${slug(route)}${suffix}.png`;
  const file = path.join(dir, filename);
  await dismissBlockingOverlays(page);
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled' });
  console.log(`CAPTURED ${roleValue} ${route} -> ${file}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await context.addInitScript(() => {
  try { localStorage.setItem('gharpayy.onboarding.completed.v1', '1'); } catch {}
});
const page = await context.newPage();

page.on('pageerror', err => console.error('PAGEERROR', err.message));
page.on('console', msg => { if (msg.type() === 'error') console.error('CONSOLE', msg.text()); });

for (const role of roles) {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await settle(page);
  await dismissBlockingOverlays(page);
  await selectRole(page, role.label);

  await capture(page, role.value, '/');

  const roleRoutes = await page.locator('aside nav a[href]').evaluateAll(els => [...new Set(els.map(a => a.getAttribute('href')).filter(Boolean))]);
  console.log(`ROLE ${role.value} ROUTES`, roleRoutes);

  for (const route of roleRoutes) {
    try {
      await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 60000 });
      await settle(page);
      await dismissBlockingOverlays(page);
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
      await dismissBlockingOverlays(page);
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
