import type { Lead } from '@/myt/lib/types';

/**
 * Gharpayy lead journey — the single ladder every lead climbs.
 * Main gates are S1..S8; the lowercase sub-gates (PDF, AMEN, LOCATION) are
 * micro-proofs that sit between them. NR / NU / NO are blockers, not steps.
 */
export type JourneyId =
  | 'S1' | 'PDF' | 'S2' | 'AMEN' | 'S3' | 'LOC' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8';

export interface JourneyStep {
  id: JourneyId;
  code: string;
  label: string;
  sub?: boolean;
  why: string;
}

export const JOURNEY: JourneyStep[] = [
  { id: 'S1', code: 'S1 IN BLR', label: 'IN BLR', why: 'Is the person in / coming to Bangalore at all?' },
  { id: 'PDF', code: 'S PDF2', label: 'PDF SENT', sub: true, why: 'Property PDF / options shared on WhatsApp.' },
  { id: 'S2', code: 'S2 WHERE', label: 'WHERE', why: 'Which area they want to stay in.' },
  { id: 'AMEN', code: 'S AMEN', label: 'AMENITIES', sub: true, why: 'Food, sharing and must-have amenities agreed.' },
  { id: 'S3', code: 'S3 EXACTDATE', label: 'EXACT DATE', why: 'A confirmed move-in date, not a guess.' },
  { id: 'LOC', code: 'S LOCATION', label: 'LOCATION', sub: true, why: 'Office / college location captured.' },
  { id: 'S4', code: 'S4 LOC FEASIBLE', label: 'LOC FEASIBLE', why: 'Commute from our PG actually works for them.' },
  { id: 'S5', code: 'S5 VTOUR OR PHYSICAL', label: 'VTOUR OR PHYSICAL', why: 'A tour is booked — virtual or physical.' },
  { id: 'S6', code: 'S6 TOUR DONE', label: 'TOUR DONE', why: 'They have seen the property.' },
  { id: 'S7', code: 'S7 QUOTATION', label: 'QUOTATION', why: 'Price, deposit and terms sent in writing.' },
  { id: 'S8', code: 'S8 BOOKING DONE', label: 'BOOKING DONE', why: 'Token collected — lead is closed won.' },
];

export type BlockerId = 'NR' | 'NU' | 'NO';
export const BLOCKERS: Record<BlockerId, { label: string; why: string }> = {
  NR: { label: 'NO RESPOND', why: 'Repeated calls / messages with no reply.' },
  NU: { label: 'NO UPDATE AFTER TOUR', why: 'Tour happened but no decision since.' },
  NO: { label: 'OBJECTIONS', why: 'An open objection is blocking the close.' },
};

const has = (v?: string) => !!v && v.trim().length > 0;
const tagged = (lead: Lead, ...needles: string[]) =>
  (lead.tags ?? []).some((t) => needles.some((n) => t.toLowerCase().includes(n)));

/** Which gates this lead has cleared, derived from everything we captured. */
export function journeyDone(lead: Lead): Record<JourneyId, boolean> {
  const d = lead.discovery ?? {};
  const touches = lead.touches ?? [];
  const action = lead.nextAction?.type;

  const s5 = has(d.tourSlot) || lead.status === 'tour-scheduled' || action === 'schedule-tour' || tagged(lead, 'tour');
  const s6 = tagged(lead, 'tour done', 'tour-done', 'visited') || touches.some((t) => t.stage === 4);
  const s7 = tagged(lead, 'quote') || action === 'send-quote' || action === 'collect-token' || has(d.tokenReadiness);
  const s8 = tagged(lead, 'booked', 'token paid') || has(d.tokenAmount) || has(d.agreementReady);

  return {
    S1: has(d.inBangalore),
    PDF: tagged(lead, 'pdf', 'options sent') || has(lead.waLabel) || lead.waStatus === 'chat-replied',
    S2: has(d.areas) || has(lead.area),
    AMEN: has(d.food) || has(d.sharing) || has(d.roomType),
    S3: lead.dateConfirmed || has(d.moveInConfirmed) || has(d.moveIn),
    LOC: has(d.officeLocation) || has(d.company),
    S4: has(d.movingFeasibility),
    S5: s5,
    S6: s6,
    S7: s7,
    S8: s8,
  };
}

/** The step they are standing on right now — first gate not yet cleared. */
export function currentJourneyStep(lead: Lead): JourneyStep {
  const done = journeyDone(lead);
  return JOURNEY.find((s) => !done[s.id]) ?? JOURNEY[JOURNEY.length - 1];
}

export function journeyBlockers(lead: Lead): BlockerId[] {
  const out: BlockerId[] = [];
  const touches = lead.touches ?? [];
  const done = journeyDone(lead);
  const misses = touches.slice(-3).filter((t) => t.outcome === 'no-answer' || t.outcome === 'busy-callback');
  if (misses.length >= 2 || lead.waStatus === 'chat-no-reply' || lead.waStatus === 'chat-stale') out.push('NR');
  if (done.S6 && !done.S7 && !done.S8) out.push('NU');
  if (has(lead.discovery?.objection) || tagged(lead, 'objection', 'price issue')) out.push('NO');
  return out;
}

export function journeyProgress(lead: Lead) {
  const done = journeyDone(lead);
  const gates = JOURNEY.filter((s) => !s.sub);
  const cleared = gates.filter((s) => done[s.id]).length;
  return { cleared, total: gates.length, pct: Math.round((cleared / gates.length) * 100) };
}
