import { Lead, CallStage, DiscoveryKey, LeadDiscovery, WaStatus } from './types';

/** ---------------------------------------------------------------
 *  WhatsApp state — the missing link between "claim" and "call".
 *  Before dialling, the rep must say what the chat looks like and
 *  label the chat on WhatsApp so the whole team sees the same thing.
 *  --------------------------------------------------------------- */

export const WA_STATUSES: { value: WaStatus; label: string; hint: string; tone: 'good' | 'warn' | 'bad' }[] = [
  { value: 'chat-replied', label: 'Chat exists · they replied', hint: 'Read the thread first — pull every detail before calling.', tone: 'good' },
  { value: 'chat-no-reply', label: 'Chat exists · no reply yet', hint: 'They saw us. Call is the unlock, not another message.', tone: 'warn' },
  { value: 'chat-stale', label: 'Old chat · gone cold', hint: 'Reopen with context from the last thread, then call.', tone: 'warn' },
  { value: 'no-chat', label: 'No chat at all', hint: 'Nothing known. Call 1 must collect every basic field.', tone: 'bad' },
  { value: 'not-on-wa', label: 'Number not on WhatsApp', hint: 'Call only. Confirm an alternate number on the call.', tone: 'bad' },
];

export function waStatusMeta(v?: WaStatus | null) {
  return WA_STATUSES.find((s) => s.value === v);
}

/** Labels applied inside WhatsApp so chat + CRM stay in sync. */
export const WA_LABELS: { value: string; label: string }[] = [
  { value: 'MYT-New', label: 'MYT · New' },
  { value: 'MYT-Call1', label: 'MYT · Call 1 basics' },
  { value: 'MYT-Call2', label: 'MYT · Call 2 schedule' },
  { value: 'MYT-Call3', label: 'MYT · Call 3 booking' },
  { value: 'MYT-Tour', label: 'MYT · Tour set' },
  { value: 'MYT-Nurture', label: 'MYT · Nurture' },
  { value: 'MYT-Dead', label: 'MYT · Dead' },
];

export function suggestedWaLabel(stage: CallStage): string {
  return stage === 1 ? 'MYT-Call1' : stage === 2 ? 'MYT-Call2' : 'MYT-Call3';
}

/** ---------------------------------------------------------------
 *  Discovery — one canonical list of everything we must know.
 *  Each field is owned by a call stage, so nobody asks Call-3
 *  questions on Call 1 and nothing gets skipped either.
 *  --------------------------------------------------------------- */

export interface DiscoveryField {
  key: DiscoveryKey;
  label: string;
  stage: CallStage;
  kind: 'text' | 'choice' | 'date' | 'number';
  options?: string[];
  why: string;
  required: boolean;
}

export const DISCOVERY_FIELDS: DiscoveryField[] = [
  // ---- Call 1 — basics
  { key: 'inBangalore', label: 'In Bangalore?', stage: 1, kind: 'choice', options: ['In Bangalore', 'Out of Bangalore', 'Unknown'], why: 'Out-of-city leads need a virtual tour path, not a physical one.', required: true },
  { key: 'areas', label: 'Preferred areas', stage: 1, kind: 'text', why: 'Localises inventory match to their zone.', required: true },
  { key: 'budget', label: 'Budget', stage: 1, kind: 'text', why: 'Filters inventory to what they can actually afford.', required: true },
  { key: 'moveIn', label: 'Move-in date', stage: 1, kind: 'date', why: 'Every priority bucket is derived from the move date.', required: true },
  { key: 'personaType', label: 'Who is this', stage: 1, kind: 'choice', options: ['Student', 'Working pro', 'Intern', 'Family', 'Group', 'Other'], why: 'Persona changes room math, price and pitch on line one.', required: true },
  { key: 'roomType', label: 'Room type', stage: 1, kind: 'choice', options: ['Private', 'Shared', 'Both', 'Studio'], why: 'Private / double / triple changes the pricing tier.', required: true },
  { key: 'genderNeed', label: 'Gender need', stage: 1, kind: 'choice', options: ['Boys', 'Girls', 'Coed'], why: 'Some properties are single-gender only.', required: true },
  { key: 'whoIsComing', label: 'Who is coming', stage: 1, kind: 'choice', options: ['Self', 'Couple', 'Friends', 'Family', 'Group of interns'], why: 'Group size changes room math and pitch.', required: false },

  // ---- Call 2 — schedule
  { key: 'officeLocation', label: 'Office / college location', stage: 2, kind: 'text', why: 'Commute is the #1 predictor of stay-length.', required: true },
  { key: 'company', label: 'Company / college name', stage: 2, kind: 'text', why: 'Strong B2B anchor and a trust signal.', required: false },
  { key: 'sharing', label: 'Sharing preference', stage: 2, kind: 'choice', options: ['Single', 'Double', 'Triple', 'Any'], why: 'Sets the exact price band to quote.', required: true },
  { key: 'food', label: 'Food preference', stage: 2, kind: 'choice', options: ['Veg', 'Non-veg', 'Both', 'Cooks own'], why: 'Meal plan match — a deal-breaker for many.', required: false },
  { key: 'stayDuration', label: 'Stay duration', stage: 2, kind: 'choice', options: ['< 3 months', '3-6 months', '6-12 months', '12 months+'], why: 'Short vs long stay changes deposit and discount.', required: false },
  { key: 'decisionMaker', label: 'Decision maker', stage: 2, kind: 'choice', options: ['Self', 'Parents', 'Company / HR', 'Group'], why: 'If parents or company decide, loop them in early.', required: true },
  { key: 'tourSlot', label: 'Tour slot agreed', stage: 2, kind: 'text', why: 'Call 2 exists to put a visit on the calendar.', required: true },

  // ---- Call 3 — booking
  { key: 'competition', label: 'Comparing / booked elsewhere', stage: 3, kind: 'choice', options: ['Only us', 'Comparing 2-3', 'Booked elsewhere'], why: 'Competition changes urgency and the discount lever.', required: true },
  { key: 'objection', label: 'Main objection', stage: 3, kind: 'text', why: 'Name it out loud or it kills the close silently.', required: false },
  { key: 'tokenReadiness', label: 'Token readiness', stage: 3, kind: 'choice', options: ['Ready now', 'After visit', 'Needs approval', 'Not ready'], why: 'Sets close probability and the SLA downstream.', required: true },
  { key: 'moveInConfirmed', label: 'Move-in confirmed', stage: 3, kind: 'choice', options: ['Confirmed', 'Tentative', 'Changed'], why: 'A confirmed date is what turns a tour into a booking.', required: true },
];

export const CALL_STAGES: { stage: CallStage; title: string; goal: string }[] = [
  { stage: 1, title: 'Call 1 · Basics', goal: 'Collect every basic: city, area, budget, move-in, persona, room need.' },
  { stage: 2, title: 'Call 2 · Schedule', goal: 'Commute, sharing, decision maker — then lock a tour slot.' },
  { stage: 3, title: 'Call 3 · Booking', goal: 'Kill the objection, confirm move-in, collect the token.' },
];

export function stageFields(stage: CallStage) {
  return DISCOVERY_FIELDS.filter((f) => f.stage === stage);
}

export function filled(d: LeadDiscovery | undefined, key: DiscoveryKey) {
  const v = d?.[key];
  return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
}

export function missingForStage(d: LeadDiscovery | undefined, stage: CallStage) {
  return stageFields(stage).filter((f) => f.required && !filled(d, f.key));
}

export function stageComplete(d: LeadDiscovery | undefined, stage: CallStage) {
  return missingForStage(d, stage).length === 0;
}

/** Where this lead actually is in the 3-call ladder. */
export function currentStage(l: Pick<Lead, 'discovery' | 'callStage'>): CallStage {
  const d = l.discovery;
  if (!stageComplete(d, 1)) return 1;
  if (!stageComplete(d, 2)) return 2;
  return 3;
}

export function discoveryProgress(d: LeadDiscovery | undefined) {
  const all = DISCOVERY_FIELDS.filter((f) => f.required);
  const done = all.filter((f) => filled(d, f.key)).length;
  return { done, total: all.length, pct: Math.round((done / all.length) * 100) };
}

/** Everything still unknown, for the "what we don't know yet" strip. */
export function missingAll(d: LeadDiscovery | undefined) {
  return DISCOVERY_FIELDS.filter((f) => f.required && !filled(d, f.key));
}

/** After this call, when should the next one happen? */
export function nextCallDefaultHours(stage: CallStage, connected: boolean) {
  if (!connected) return 3;
  return stage === 1 ? 24 : stage === 2 ? 12 : 6;
}

export function nextStage(stage: CallStage, d: LeadDiscovery | undefined): CallStage {
  if (!stageComplete(d, 1)) return 1;
  if (!stageComplete(d, 2)) return 2;
  return 3;
}

/** Opening message for WhatsApp, tuned to the stage + what we already know. */
export function waOpener(lead: Lead, stage: CallStage) {
  const name = lead.name.split(' ')[0];
  if (stage === 1) return `Hi ${name}, Gharpayy here about your stay in ${lead.area}. Quick 2 mins — can I check your budget, move-in date and preferred area?`;
  if (stage === 2) return `Hi ${name}, shortlisted a few options near you. When can you visit — today evening or tomorrow morning?`;
  return `Hi ${name}, holding the room for you. Shall we block it with the token today?`;
}
