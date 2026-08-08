import { CallOutcome, Lead, LeadTouch, NextActionType } from './types';

export const OWNERSHIP_DAYS = 15;

/** Daily team goal — connected calls, not dials. */
export const DAILY_CONNECT_TARGET = 80;

/** Outcomes that count as a real human conversation. */
export const CONNECTED_OUTCOMES: CallOutcome[] = [
  'connected-interested',
  'connected-not-now',
  'busy-callback',
];

export function isConnected(o?: CallOutcome | null) {
  return Boolean(o && CONNECTED_OUTCOMES.includes(o));
}

export function allTouches(leads: Lead[]): LeadTouch[] {
  return leads.flatMap((l) => l.touches ?? []);
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.toDateString() === n.toDateString();
}

/** Today's scoreboard against the 80-connected-calls goal. */
export function todayScoreboard(leads: Lead[]) {
  const touches = allTouches(leads).filter((t) => isToday(t.at));
  const connected = touches.filter((t) => isConnected(t.outcome)).length;
  const calls = touches.filter((t) => t.channel === 'call').length;
  const chats = touches.filter((t) => t.channel === 'whatsapp').length;
  const tours = touches.filter((t) => t.action === 'schedule-tour').length;
  return {
    target: DAILY_CONNECT_TARGET,
    connected,
    calls,
    chats,
    touches: touches.length,
    tours,
    remaining: Math.max(0, DAILY_CONNECT_TARGET - connected),
    pct: Math.min(100, Math.round((connected / DAILY_CONNECT_TARGET) * 100)),
  };
}

/** Shared vocabulary so notes stay comparable across the team. */
export const marketplaceTags: { value: string; label: string; tone: 'good' | 'warn' | 'bad' }[] = [
  { value: 'budget-flexible', label: 'Budget flexible', tone: 'good' },
  { value: 'ready-to-book', label: 'Ready to book', tone: 'good' },
  { value: 'wants-single', label: 'Wants single room', tone: 'warn' },
  { value: 'wants-food', label: 'Food matters', tone: 'warn' },
  { value: 'family-decides', label: 'Family decides', tone: 'warn' },
  { value: 'comparing', label: 'Comparing others', tone: 'warn' },
  { value: 'area-mismatch', label: 'Area mismatch', tone: 'warn' },
  { value: 'low-budget', label: 'Budget too low', tone: 'bad' },
  { value: 'future-movein', label: 'Future move-in', tone: 'bad' },
  { value: 'unreachable', label: 'Hard to reach', tone: 'bad' },
  { value: 'language-hindi', label: 'Prefers Hindi', tone: 'warn' },
  { value: 'student', label: 'Student', tone: 'warn' },
];

export function tagLabel(v: string) {
  return marketplaceTags.find((t) => t.value === v)?.label ?? v;
}

export function tagTone(v: string) {
  return marketplaceTags.find((t) => t.value === v)?.tone ?? 'warn';
}

export const callOutcomes: { value: CallOutcome; label: string; tone: 'good' | 'warn' | 'bad' }[] = [
  { value: 'connected-interested', label: 'Connected · interested', tone: 'good' },
  { value: 'connected-not-now', label: 'Connected · not now', tone: 'warn' },
  { value: 'busy-callback', label: 'Busy · asked callback', tone: 'warn' },
  { value: 'no-answer', label: 'No answer', tone: 'warn' },
  { value: 'wrong-number', label: 'Wrong number', tone: 'bad' },
  { value: 'not-interested', label: 'Not interested', tone: 'bad' },
];

export const nextActions: { value: NextActionType; label: string; defaultInHours: number }[] = [
  { value: 'call-back', label: 'Call back', defaultInHours: 2 },
  { value: 'whatsapp-options', label: 'Send WhatsApp options', defaultInHours: 1 },
  { value: 'schedule-tour', label: 'Schedule tour', defaultInHours: 4 },
  { value: 'send-quote', label: 'Send quotation', defaultInHours: 1 },
  { value: 'collect-token', label: 'Collect token', defaultInHours: 24 },
  { value: 'nurture', label: 'Nurture / future move-in', defaultInHours: 72 },
];

/** Suggested outcome → next action pairing so nobody has to think twice. */
export const suggestedAction: Record<CallOutcome, NextActionType> = {
  'connected-interested': 'schedule-tour',
  'connected-not-now': 'nurture',
  'busy-callback': 'call-back',
  'no-answer': 'call-back',
  'wrong-number': 'nurture',
  'not-interested': 'nurture',
};

export function isoIn(hours: number) {
  return new Date(Date.now() + hours * 3600_000).toISOString();
}

/** A claimed lead that has no logged call or no next action = broken promise. */
export function isIncomplete(l: Lead) {
  return Boolean(l.claimedBy) && (!l.firstCallAt || !l.nextAction);
}

export function ownershipDay(l: Lead) {
  if (!l.claimedAt) return 0;
  const days = Math.floor((Date.now() - new Date(l.claimedAt).getTime()) / 86_400_000);
  return Math.min(OWNERSHIP_DAYS, Math.max(1, days + 1));
}

export function actionDueLabel(dueAt: string) {
  const diff = new Date(dueAt).getTime() - Date.now();
  const mins = Math.round(diff / 60_000);
  if (mins <= 0) return { text: `Overdue ${Math.abs(mins)}m`, overdue: true };
  if (mins < 60) return { text: `Due in ${mins}m`, overdue: false };
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return { text: `Due in ${hrs}h`, overdue: false };
  return { text: `Due in ${Math.round(hrs / 24)}d`, overdue: false };
}

export function waLink(phone: string, text?: string) {
  const digits = phone.replace(/[^\d]/g, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/** Parse pasted bulk lines: "Name, Phone, Area, Budget, MoveInDate" (comma/tab separated). */
export function parseBulkLeads(raw: string) {
  const rows = raw
    .split(/\r?\n/)
    .map((r) => r.trim())
    .filter(Boolean);
  const parsed: { name: string; phone: string; area: string; budget: number; moveInDate: string }[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    if (/^name\s*[,\t]/i.test(row)) return; // header
    const cols = row.split(/[,\t]|\s{2,}/).map((c) => c.trim()).filter(Boolean);
    const phoneCol = cols.find((c) => c.replace(/[^\d]/g, '').length >= 10);
    if (!cols[0] || !phoneCol) {
      errors.push(`Line ${i + 1}: need at least a name and a 10-digit phone`);
      return;
    }
    const budgetCol = cols.find((c) => c !== phoneCol && /^₹?\s*\d{4,6}k?$/i.test(c));
    const dateCol = cols.find((c) => /^\d{4}-\d{2}-\d{2}$/.test(c));
    const areaCol = cols.find((c) => c !== cols[0] && c !== phoneCol && c !== budgetCol && c !== dateCol);
    const budgetRaw = (budgetCol ?? '').replace(/[^\dk]/gi, '');
    const budget = budgetRaw.toLowerCase().endsWith('k')
      ? Number(budgetRaw.slice(0, -1)) * 1000
      : Number(budgetRaw || 0);

    parsed.push({
      name: cols[0],
      phone: phoneCol,
      area: areaCol ?? '',
      budget: budget || 0,
      moveInDate: dateCol ?? new Date(Date.now() + 7 * 86_400_000).toISOString().split('T')[0],
    });
  });

  return { parsed, errors };
}
