import { CallStage, Lead, DiscoveryKey } from './types';
import { CALL_PLAYS, DISCOVERY_FIELDS, filled } from './call-plan';

/** ---------------------------------------------------------------
 *  The talk track — C1..C5 written as a conversation, not a form.
 *  Each line is something the operator actually says out loud, in
 *  order, with whatever we already know spliced in so the call
 *  never starts from zero. Read top to bottom and the call is done.
 *  --------------------------------------------------------------- */

export type LineKind = 'open' | 'say' | 'ask' | 'listen' | 'handle' | 'close';

export interface TalkLine {
  kind: LineKind;
  /** Word-for-word line. Anything in [brackets] is a live value. */
  text: string;
  /** Dossier field this line fills, when it fills one. */
  field?: DiscoveryKey;
  /** Why this line exists — one short reason, shown small. */
  note?: string;
}

export const LINE_META: Record<LineKind, { label: string; tone: 'primary' | 'good' | 'warn' | 'muted' }> = {
  open: { label: 'Open', tone: 'primary' },
  say: { label: 'Say', tone: 'muted' },
  ask: { label: 'Ask', tone: 'primary' },
  listen: { label: 'Listen', tone: 'muted' },
  handle: { label: 'Handle', tone: 'warn' },
  close: { label: 'Close', tone: 'good' },
};

const first = (n: string) => (n || 'there').split(' ')[0];

function known(lead: Lead, key: DiscoveryKey, fallback: string) {
  const v = lead.discovery?.[key];
  return v && v.trim() ? v.trim() : fallback;
}

const money = (n?: number) => (n ? `₹${(n / 1000).toFixed(0)}k` : 'your budget');

/** The full script for one call, personalised with what we already know. */
export function talkTrack(lead: Lead, stage: CallStage): TalkLine[] {
  const n = first(lead.name);
  const area = known(lead, 'areas', lead.area || 'Bangalore');
  const budget = known(lead, 'budget', money(lead.budget));
  const move = known(lead, 'moveIn', lead.moveInDate || 'your move date');
  const who = known(lead, 'whoIsComing', 'you');
  const office = known(lead, 'officeLocation', 'your office / college');
  const sharing = known(lead, 'sharing', 'the sharing you want');

  if (stage === 1) return [
    { kind: 'open', text: `Hey, am I speaking with ${n}? This is from Gharpayy — you were looking for a stay in Bangalore, right?`, note: 'Name first, purpose second. Never open with a pitch.' },
    { kind: 'say', text: `Great, I will take two minutes and then send you options on WhatsApp — no spam, just the 3 that actually fit.`, note: 'Sets the length of the call so they stay on.' },
    { kind: 'ask', text: `First — are you already in Bangalore, or shifting from another city?`, field: 'inBangalore', note: 'Out of city = virtual tour path, not a physical visit.' },
    { kind: 'ask', text: `And which side of the city do you want to stay in — any area you have in mind?`, field: 'areas', note: 'Their words, not our zones. Write it as they say it.' },
    { kind: 'ask', text: `What kind of monthly rent are you comfortable with — a range is fine.`, field: 'budget', note: 'Range before price. Never quote first.' },
    { kind: 'ask', text: `And by when do you want to move in?`, field: 'moveIn', note: 'The move date decides the whole follow-up cadence.' },
    { kind: 'ask', text: `Is this just for you, or are you shifting with someone?`, field: 'whoIsComing', note: 'Group size changes the room and the price.' },
    { kind: 'listen', text: `Let them talk here. Write down the exact words they use for area and budget.`, note: 'The dossier below is filled from this line.' },
    { kind: 'close', text: `Perfect ${n} — so ${area}, around ${budget}, moving by ${move}. I will send 3 options on WhatsApp today and call you back tomorrow to shortlist.`, note: 'Read the summary back. That is what makes it a qualified lead.' },
  ];

  if (stage === 2) return [
    { kind: 'open', text: `Hey ${n}, Gharpayy here — I sent you 3 places in ${area} around ${budget}. Did you get a chance to look?`, note: 'Reference the last call so it feels continuous.' },
    { kind: 'say', text: `Before I narrow it down, one thing matters more than anything else — the daily commute.`, note: 'Commute is the #1 reason people leave a stay.' },
    { kind: 'ask', text: `Where do you head out to every morning — office or college?`, field: 'officeLocation', note: 'Distance to work beats every other filter.' },
    { kind: 'ask', text: `Do you want a private room, or are you okay sharing with one or two people?`, field: 'sharing', note: 'Sharing sets the pricing tier.' },
    { kind: 'ask', text: `Is this your own decision, or do your parents / company also need to see it?`, field: 'decisionMaker', note: 'If someone else decides, get them on the visit.' },
    { kind: 'say', text: `Based on ${office} and ${sharing}, two of the three make sense. Best if you see them yourself — photos never tell the full story.`, note: 'Justify the visit before asking for it.' },
    { kind: 'ask', text: `I can do today around 6, or tomorrow morning around 11 — which one works?`, field: 'tourSlot', note: 'Two slots, never "when are you free?".' },
    { kind: 'close', text: `Done — locking [slot]. I will send the location pin and the caretaker number on WhatsApp, and I will call you an hour before.`, note: 'A visit is only real once the pin is sent.' },
  ];

  if (stage === 3) return [
    { kind: 'open', text: `Hey ${n}, how did the place feel when you saw it?`, note: 'Open question about feeling, not about booking.' },
    { kind: 'listen', text: `Stay quiet for the first ten seconds. Their first sentence is the real objection.`, note: 'Most closes are lost by talking too early.' },
    { kind: 'ask', text: `Honestly, what is the one thing stopping you from confirming today?`, field: 'objection', note: 'Name it out loud or it kills the deal silently.' },
    { kind: 'ask', text: `Are you also looking at a couple of other places, or is this the one?`, field: 'competition', note: 'Comparing / booked elsewhere changes the urgency.' },
    { kind: 'handle', text: `Handle exactly one objection — price, location or timing. One answer, then stop.`, note: 'Stacking answers sounds like desperation.' },
    { kind: 'ask', text: `And you are still moving in around ${move}, correct?`, field: 'moveInConfirmed', note: 'A confirmed date turns a tour into a booking.' },
    { kind: 'ask', text: `Then let me block the room for you today — shall I go ahead?`, field: 'tokenReadiness', note: 'Ask, then be silent until they answer.' },
    { kind: 'close', text: `Great — I am blocking it now. I will send the payment link on WhatsApp and stay on the line with you.`, note: 'Never end C3 without the next step being money.' },
  ];

  if (stage === 4) return [
    { kind: 'open', text: `Hey ${n}, sending you the payment link right now — I will stay on the call while you do it.`, note: 'Do not hang up before the money lands.' },
    { kind: 'ask', text: `Confirming the token amount we agreed — [amount], right?`, field: 'tokenAmount', note: 'No agreed number = no booking, only a promise.' },
    { kind: 'ask', text: `Will you do UPI now, or bank transfer?`, field: 'paymentMode', note: 'Mode decides how fast money actually lands.' },
    { kind: 'say', text: `While that goes through — for the agreement I need an ID, one photo and one emergency contact.`, note: 'Handover stalls on paperwork more than on price.' },
    { kind: 'ask', text: `Do you have those ready, or should I keep it pending for today?`, field: 'agreementReady' },
    { kind: 'close', text: `Received. Your room is locked for ${move}. I will send the agreement and the caretaker's number, and someone will hand over the keys on the day.`, note: 'End with who, what and when — no loose ends.' },
  ];

  return [
    { kind: 'open', text: `Hey ${n}, this is Gharpayy — we spoke a while back about a stay in ${area}. Is that plan still on, or has it changed?`, note: 'Say why you are calling back before pitching anything.' },
    { kind: 'ask', text: `Last time it did not move forward — what was the actual reason?`, field: 'revivalReason', note: 'C5 only works if you name the real reason it went cold.' },
    { kind: 'say', text: `Fair enough. One thing that changed since then — [new property / price drop / new slot] in ${area}.`, note: 'One new reason to restart. Only one.' },
    { kind: 'ask', text: `Should I check back this week, or is it a later thing for you?`, field: 'recallWindow', note: 'Sets when the lead re-enters the queue.' },
    { kind: 'close', text: `Noted ${n}. If it is not happening at all, tell me straight and I will stop calling — no problem either way.`, note: 'A clean dead beats a fake maybe.' },
  ];
}

/** How far through the script we are, measured by dossier fields filled. */
export function trackProgress(lead: Lead, stage: CallStage) {
  const lines = talkTrack(lead, stage).filter((l) => l.field);
  const done = lines.filter((l) => filled(lead.discovery, l.field!)).length;
  return { done, total: lines.length, pct: lines.length ? Math.round((done / lines.length) * 100) : 100 };
}

/** Every dossier value captured so far, newest-relevant first — for the header strip. */
export function capturedDossier(lead: Lead): { key: DiscoveryKey; label: string; value: string; stage: CallStage }[] {
  return DISCOVERY_FIELDS
    .filter((f) => filled(lead.discovery, f.key))
    .map((f) => ({ key: f.key, label: f.label, value: lead.discovery![f.key]!, stage: f.stage }));
}

/** The one-line read-back: what we can now say without guessing. */
export function dossierSummary(lead: Lead): string {
  const d = lead.discovery ?? {};
  const bits = [
    d.inBangalore,
    d.areas ?? lead.area,
    d.budget ?? (lead.budget ? money(lead.budget) : undefined),
    d.moveIn ?? lead.moveInDate,
    d.sharing,
    d.whoIsComing,
  ].filter((v): v is string => !!v && v.trim().length > 0);
  return bits.length ? bits.join(' · ') : 'Nothing captured yet — start at C1.';
}

export { CALL_PLAYS };
