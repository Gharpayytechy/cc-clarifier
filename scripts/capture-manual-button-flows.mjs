import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.CRM_URL || 'https://clean-lead-dream.lovable.app';
const OUT = process.env.SCREENSHOT_DIR || 'manual-button-flows';

const roleRoutes = {
  '00-shared-workflow-guarantee': ['/', '/tower/workflow-guarantee', '/queue', '/handoffs'],
  '01-control-tower': ['/tower', '/tower/workflow-guarantee', '/tower/review', '/control-tower-team', '/manager'],
  '02-flow-ops': ['/', '/today', '/execution', '/myt/flow-ops', '/myt/marketplace', '/queue', '/follow-ups'],
  '03-tour-conversion-manager': ['/myt/tcm', '/calendar', '/today', '/queue', '/handoffs'],
  '04-closing-specialist': ['/closing', '/myt/closing', '/queue', '/follow-ups', '/revenue'],
  '05-supply-pcm': ['/supply-hub', '/supply-hub/match', '/supply-hub/areas', '/myt/marketplace'],
  '06-zone-owner-manager': ['/manager', '/zone-brain', '/monitoring', '/heatmap', '/leaderboard'],
  '07-hr-qa-training': ['/academy', '/coach', '/tower/review', '/control-tower-team'],
  '08-property-owner': ['/owner', '/owner/rooms', '/owner/insights'],
  '09-admin-leadership': ['/health', '/manager', '/monitoring', '/tower', '/help']
};

const skipButton = /delete|remove|logout|log out|sign out|archive|reset|danger|clear all|erase|drop/i;
const primaryAction = /save|create|confirm|complete|schedule|start|next|assign|send|submit|done|got it|apply|continue/i;
const slug = (s) => String(s || '').replace(/^\/+/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'home';

async function mkdirp(d) { await fs.mkdir(d, { recursive: true }); }
async function wait(page, ms=900) { await page.waitForTimeout(ms); }
async function dismiss(page) {
  await page.evaluate(() => { try { localStorage.setItem('gharpayy.onboarding.completed.v1','1'); } catch {} }).catch(()=>{});
  await page.keyboard.press('Escape').catch(()=>{});
  for (const name of [/skip walkthrough/i, /^skip$/i, /got it/i, /close/i]) {
    const b = page.getByRole('button', { name });
    if (await b.count()) {
      const first = b.first();
      if (await first.isVisible().catch(()=>false)) await first.click({force:true}).catch(()=>{});
    }
  }
}
async function goto(page, route) {
  await page.goto(new URL(route, BASE_URL).toString(), { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(()=>{});
  await dismiss(page);
  await wait(page, 800);
}
async function cap(page, file) {
  await mkdirp(path.dirname(file));
  await page.screenshot({ path: file, fullPage: false, animations: 'disabled', timeout: 15000 });
}

async function buttonInventory(page) {
  return await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('main button, main [role="button"], main a[role="button"], main a[href], [role="dialog"] button, [data-radix-popper-content-wrapper] button'));
    const out = [];
    const seen = new Set();
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('aside')) continue;
      const r = el.getBoundingClientRect();
      const visible = r.width > 16 && r.height > 14 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).display !== 'none';
      if (!visible) continue;
      let text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g,' ').trim();
      if (!text) text = el.getAttribute('href') || el.tagName;
      if (!text || text.length > 70) continue;
      const key = text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      el.setAttribute('data-manual-button-index', String(out.length));
      out.push({ index: out.length, text, tag: el.tagName.toLowerCase(), href: el.getAttribute('href') || '', x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
    }
    return out.slice(0, 14);
  });
}

async function clickButtonByText(page, text, ordinal=0) {
  return await page.evaluate(({text, ordinal}) => {
    const norm = (s) => (s || '').replace(/\s+/g,' ').trim();
    const els = Array.from(document.querySelectorAll('main button, main [role="button"], main a[role="button"], main a[href], [role="dialog"] button, [data-radix-popper-content-wrapper] button'));
    const matches = [];
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.closest('aside')) continue;
      const r = el.getBoundingClientRect();
      if (!(r.width > 16 && r.height > 14 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight)) continue;
      const t = norm(el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.getAttribute('href'));
      if (t === text) matches.push(el);
    }
    const el = matches[ordinal] || matches[0];
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return true;
  }, {text, ordinal});
}

function describe(role, route, btn, clicked, second) {
  const label = btn.text;
  const destructive = skipButton.test(label);
  let type = 'Open / inspect action';
  if (/call/i.test(label)) type = 'Call action';
  else if (/whatsapp|message/i.test(label)) type = 'WhatsApp / communication action';
  else if (/schedule|tour|visit/i.test(label)) type = 'Tour / visit action';
  else if (/quote|quotation|offer/i.test(label)) type = 'Quotation action';
  else if (/assign|handoff|transfer/i.test(label)) type = 'Ownership / handoff action';
  else if (/filter|apply|view|open|details/i.test(label)) type = 'View / filter action';
  else if (/save|create|confirm|complete|submit|done/i.test(label)) type = 'Completion action';
  return { role, route, button: label, type, destructive, clicked, secondaryClicked: second || null, purpose: destructive ? 'Documented but not executed because it can remove or reset data.' : `Use this button to move the ${route} workflow forward for ${role}.`, expected: destructive ? 'Requires manager/admin approval before use.' : 'The screen should open the next modal, drawer, confirmation state, filtered view, or downstream workflow step. Record outcome and create next action before leaving.' };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 });
await context.addInitScript(() => { try { localStorage.setItem('gharpayy.onboarding.completed.v1','1'); } catch {} });
const page = await context.newPage();
page.setDefaultTimeout(9000);
page.on('pageerror', err => console.error('PAGEERROR', err.message));

const manifest = [];
for (const [role, routes] of Object.entries(roleRoutes)) {
  for (const route of routes) {
    const routeDir = path.join(OUT, role, slug(route));
    try {
      await goto(page, route);
      await cap(page, path.join(routeDir, '00-screen-before-actions.png'));
      const buttons = await buttonInventory(page);
      manifest.push({ role, route, screen: path.join(role, slug(route), '00-screen-before-actions.png'), buttonsFound: buttons });
      let n = 0;
      for (const btn of buttons) {
        if (n >= 10) break;
        const base = `${String(n+1).padStart(2,'0')}-${slug(btn.text)}`;
        const item = { role, route, button: btn.text, bbox: btn, files: {}, notes: [] };
        await goto(page, route);
        await cap(page, path.join(routeDir, `${base}-before.png`));
        item.files.before = path.join(role, slug(route), `${base}-before.png`);
        let clicked = false;
        let secondary = null;
        if (skipButton.test(btn.text)) {
          item.notes.push('Destructive or admin-risk action: documented but not clicked.');
        } else {
          clicked = await clickButtonByText(page, btn.text).catch(()=>false);
          await wait(page, 900);
          await dismiss(page);
          await cap(page, path.join(routeDir, `${base}-after-click.png`));
          item.files.afterClick = path.join(role, slug(route), `${base}-after-click.png`);
          const inner = await buttonInventory(page).catch(()=>[]);
          const second = inner.find(b => primaryAction.test(b.text) && !skipButton.test(b.text) && b.text.toLowerCase() !== btn.text.toLowerCase());
          if (second) {
            secondary = second.text;
            await clickButtonByText(page, second.text).catch(()=>false);
            await wait(page, 900);
            await dismiss(page);
            await cap(page, path.join(routeDir, `${base}-after-${slug(second.text)}.png`));
            item.files.afterSecondary = path.join(role, slug(route), `${base}-after-${slug(second.text)}.png`);
          }
        }
        item.explanation = describe(role, route, btn, clicked, secondary);
        manifest.push(item);
        n++;
      }
    } catch (err) {
      manifest.push({ role, route, error: err.message });
      console.error(`FAILED ROUTE ${role} ${route}`, err.message);
    }
  }
}
await mkdirp(OUT);
await fs.writeFile(path.join(OUT, 'button-flow-manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
console.log('Button-flow screenshot capture complete.');
