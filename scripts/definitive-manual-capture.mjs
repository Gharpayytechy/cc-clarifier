import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.CRM_URL || 'https://clean-lead-dream.lovable.app';
const OUT = process.env.SCREENSHOT_DIR || 'definitive-manual-capture';
await fs.mkdir(OUT, { recursive: true });

const desktopRoutes = [
  '/', '/today', '/my-work', '/queue', '/leads', '/leads/add', '/follow-ups', '/handoffs', '/calendar',
  '/myt/flow-ops', '/myt/marketplace', '/myt/my-leads', '/myt/leads', '/myt/schedule', '/myt/tcm', '/myt/tours',
  '/myt/bookings', '/myt/properties', '/myt/drafts', '/myt/mismatch', '/revival', '/sequences',
  '/supply-hub', '/supply-hub/match', '/supply-hub/areas', '/property360', '/property360/onboard',
  '/closing', '/os', '/control-tower-team', '/tower', '/tower/workflow-guarantee', '/tower/interventions',
  '/tower/analytics', '/tower/eod', '/tower/access', '/tower/admin', '/tower/review', '/tower/quality',
  '/manager', '/monitoring', '/zone-brain', '/zones', '/productivity', '/academy', '/l1', '/health', '/help',
  '/owner', '/owner/inventory', '/owner/rooms', '/owner/blocks', '/owner/insights', '/owner/visits'
];
const mobileRoutes = [
  '/today', '/my-work', '/queue', '/leads', '/myt/schedule', '/myt/tcm', '/myt/bookings',
  '/supply-hub', '/tower/workflow-guarantee', '/calendar', '/owner'
];

const slug = s => (s === '/' ? 'home' : s.replace(/^\//,'').replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,''));
const manifest = [];

async function sanitize(page) {
  await page.evaluate(() => {
    try { localStorage.setItem('gharpayy.onboarding.completed.v1','1'); } catch {}
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      let t = n.nodeValue || '';
      t = t.replace(/(?:\+91[-\s]?)?\b[6-9]\d{9}\b/g, '+91••••••••••');
      t = t.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '•••@•••.com');
      if (t !== n.nodeValue) n.nodeValue = t;
    }
  }).catch(()=>{});
  await page.keyboard.press('Escape').catch(()=>{});
  for (const pat of [/skip walkthrough/i,/^skip$/i,/got it/i]) {
    const b=page.getByRole('button',{name:pat});
    if(await b.count()) await b.first().click({force:true}).catch(()=>{});
  }
}

async function settle(page) {
  await page.waitForLoadState('domcontentloaded').catch(()=>{});
  await page.waitForTimeout(1800);
  await sanitize(page);
}

async function metadata(page) {
  return await page.evaluate(() => {
    const visible = el => {
      const r=el.getBoundingClientRect(), s=getComputedStyle(el);
      return r.width>0 && r.height>0 && s.visibility!=='hidden' && s.display!=='none';
    };
    const box = el => { const r=el.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; };
    const buttons=[...document.querySelectorAll('button,a,[role="button"]')].filter(visible).slice(0,160).map(el=>({
      text:(el.innerText||el.getAttribute('aria-label')||el.getAttribute('title')||'').trim().replace(/\s+/g,' ').slice(0,140),
      tag:el.tagName.toLowerCase(), href:el.getAttribute('href'), aria:el.getAttribute('aria-label'), box:box(el)
    })).filter(x=>x.text);
    const fields=[...document.querySelectorAll('input,textarea,select,[role="combobox"]')].filter(visible).slice(0,160).map(el=>({
      tag:el.tagName.toLowerCase(), type:el.getAttribute('type'), name:el.getAttribute('name'), placeholder:el.getAttribute('placeholder'),
      aria:el.getAttribute('aria-label'), required:el.hasAttribute('required')||el.getAttribute('aria-required')==='true', box:box(el)
    }));
    return {title:document.title,h1:[...document.querySelectorAll('h1')].filter(visible).map(x=>x.textContent?.trim()).filter(Boolean),buttons,fields};
  }).catch(()=>({title:'',h1:[],buttons:[],fields:[]}));
}

async function shot(page, group, route, name, fullPage=false) {
  await sanitize(page);
  const dir=path.join(OUT,group); await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,`${slug(route)}__${name}.png`);
  const meta=await metadata(page);
  await page.screenshot({path:file,fullPage,animations:'disabled',timeout:30000});
  manifest.push({group,route,name,file,viewport:page.viewportSize(),url:page.url(),...meta});
  console.log('CAPTURED',file);
}

async function goto(page, route) {
  await page.goto(new URL(route,BASE).toString(),{waitUntil:'domcontentloaded',timeout:45000});
  await settle(page);
}

async function safeClick(page, label, options={}) {
  const {exact=false, role='button'}=options;
  let loc = role==='link' ? page.getByRole('link',{name:label,exact}) : page.getByRole('button',{name:label,exact});
  if(!await loc.count()) loc=page.getByText(label,{exact}).filter({visible:true});
  if(!await loc.count()) return false;
  await loc.first().click({force:true,timeout:6000}).catch(()=>{});
  await page.waitForTimeout(650); await sanitize(page); return true;
}

const browser=await chromium.launch({headless:true});
const desktop=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1});
await desktop.addInitScript(()=>{try{localStorage.setItem('gharpayy.onboarding.completed.v1','1')}catch{}});
const page=await desktop.newPage();

for (const route of desktopRoutes) {
  try { await goto(page,route); await shot(page,'desktop',route,'screen',false); }
  catch(e){ console.error('ROUTE_FAIL',route,e.message); }
}

// Lead detail + activity flow (no save)
try {
  await goto(page,'/leads');
  const row=page.locator('[data-testid^="lead-row-"]').first();
  if(await row.count()){await row.click({force:true});await page.waitForTimeout(700);await shot(page,'desktop-flows','/leads','lead-detail');
    if(await safeClick(page,/Log activity/i)) await shot(page,'desktop-flows','/leads','log-activity-dialog');
  }
}catch(e){console.error('FLOW_LEAD',e.message)}

// Schedule Tour wizard with fake non-sensitive values; do not submit.
try {
  await goto(page,'/myt/schedule');
  const inputs=page.locator('input');
  if(await inputs.count()>=2){await inputs.nth(0).fill('Demo Customer');await inputs.nth(1).fill('9000000000');}
  await shot(page,'desktop-flows','/myt/schedule','step-1-filled');
  if(await safeClick(page,/Next: Intent/i)){await shot(page,'desktop-flows','/myt/schedule','step-2-intent');
    const next=page.getByRole('button',{name:/Next/i}); if(await next.count()){await next.last().click({force:true}).catch(()=>{});await page.waitForTimeout(500);await shot(page,'desktop-flows','/myt/schedule','step-3-tour-slot');}}
}catch(e){console.error('FLOW_SCHEDULE',e.message)}

// Booking form (no submit)
try{await goto(page,'/myt/bookings');if(await safeClick(page,/Log Booking/i))await shot(page,'desktop-flows','/myt/bookings','log-booking-form');}catch(e){console.error('FLOW_BOOKING',e.message)}
// Property quick add (no submit)
try{await goto(page,'/myt/properties');if(await safeClick(page,/Quick add/i))await shot(page,'desktop-flows','/myt/properties','quick-add-property');}catch(e){console.error('FLOW_PROPERTY',e.message)}
// Calendar new event (no submit)
try{await goto(page,'/calendar');if(await safeClick(page,/New event/i))await shot(page,'desktop-flows','/calendar','new-event');}catch(e){console.error('FLOW_CAL',e.message)}
// Control Tower tab states
try{await goto(page,'/control-tower-team');for(const l of ['CT Team','Worklist','Single-Owner','4-Gate','SLA','Escalations','Handover','Audit']){if(await safeClick(page,new RegExp(l,'i')))await shot(page,'desktop-flows','/control-tower-team',`tab-${slug(l)}`);}}catch(e){console.error('FLOW_CT',e.message)}
// Closing buckets
try{await goto(page,'/closing');for(const l of ['Closing today','Overdue','All live','Settled']){if(await safeClick(page,new RegExp(l,'i')))await shot(page,'desktop-flows','/closing',`bucket-${slug(l)}`);}}catch(e){console.error('FLOW_CLOSE',e.message)}
// Owner room forms (no submit)
try{await goto(page,'/owner/rooms');for(const l of [/Add property/i,/Add room/i]){if(await safeClick(page,l)) {await shot(page,'desktop-flows','/owner/rooms',`action-${slug(String(l))}`);await page.keyboard.press('Escape').catch(()=>{});}}}catch(e){console.error('FLOW_OWNER',e.message)}

await desktop.close();

// Mobile evidence
const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
await mobile.addInitScript(()=>{try{localStorage.setItem('gharpayy.onboarding.completed.v1','1')}catch{}});
const mp=await mobile.newPage();
for(const route of mobileRoutes){try{await goto(mp,route);await shot(mp,'mobile',route,'screen',false);}catch(e){console.error('MOBILE_FAIL',route,e.message)}}
await mobile.close();
await browser.close();

await fs.writeFile(path.join(OUT,'capture-manifest.json'),JSON.stringify(manifest,null,2));
console.log('DONE',manifest.length,'captures');
