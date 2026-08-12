// Close-commitment store — every "Definitely Close" promise, and every change
// to it, kept forever. The point is accountability: the Control Tower must be
// able to ask "you said this closes today, why has it not?".

import { useSyncExternalStore } from "react";
import { WINDOW_BY_ID, type CloseWindowId } from "./windows";

export type CommitmentStatus = "open" | "kept" | "broken" | "cancelled";

export interface CommitmentEvent {
  at: string;
  by: string;
  kind: "promised" | "changed" | "kept" | "broken" | "cancelled" | "note";
  windowId?: CloseWindowId;
  dueAt?: string;
  /** Previous deadline when the promise moved. */
  prevDueAt?: string;
  reason?: string;
  note?: string;
}

export interface CloseCommitment {
  id: string;
  leadId: string;
  leadName: string;
  leadPhone: string;
  windowId: CloseWindowId;
  dueAt: string;
  /** The one thing standing between this lead and money. */
  blocker: string;
  /** Closer's own confidence, 50-100. */
  confidence: number;
  note: string;
  promisedBy: string;
  promisedAt: string;
  status: CommitmentStatus;
  closedAt?: string;
  bookingRef?: string;
  /** How many times the deadline moved. High = unreliable promise. */
  changeCount: number;
  history: CommitmentEvent[];
}

const KEY = "gharpayy.close.commitments.v1";

let cache: CloseCommitment[] | null = null;
const listeners = new Set<() => void>();
const EMPTY: CloseCommitment[] = [];

function read(): CloseCommitment[] {
  if (cache) return cache;
  if (typeof window === "undefined") return EMPTY;
  try {
    cache = JSON.parse(window.localStorage.getItem(KEY) ?? "[]") as CloseCommitment[];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: CloseCommitment[]) {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* quota — in-memory copy still serves this session */
    }
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useCommitments(): CloseCommitment[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function dueFromWindow(windowId: CloseWindowId, customDate?: string): string {
  const def = WINDOW_BY_ID[windowId];
  if (!def || def.hours === null) {
    return customDate ? new Date(customDate).toISOString() : new Date(Date.now() + 86_400_000).toISOString();
  }
  return new Date(Date.now() + def.hours * 3_600_000).toISOString();
}

export function openCommitmentFor(all: CloseCommitment[], leadId: string) {
  return all.find((c) => c.leadId === leadId && c.status === "open") ?? null;
}

export function commitmentsFor(all: CloseCommitment[], leadId: string) {
  return all.filter((c) => c.leadId === leadId);
}

export function promiseClose(input: {
  leadId: string;
  leadName: string;
  leadPhone: string;
  windowId: CloseWindowId;
  customDate?: string;
  blocker: string;
  confidence: number;
  note?: string;
  by: string;
}): CloseCommitment {
  const all = read();
  const existing = openCommitmentFor(all, input.leadId);
  const dueAt = dueFromWindow(input.windowId, input.customDate);
  const now = new Date().toISOString();

  if (existing) {
    // Same lead, live promise → this is a CHANGE, and the history keeps both.
    const ev: CommitmentEvent = {
      at: now, by: input.by, kind: "changed",
      windowId: input.windowId, dueAt, prevDueAt: existing.dueAt,
      reason: input.note?.trim() || "Deadline updated",
    };
    const updated: CloseCommitment = {
      ...existing,
      windowId: input.windowId,
      dueAt,
      blocker: input.blocker,
      confidence: input.confidence,
      note: input.note?.trim() ?? existing.note,
      changeCount: existing.changeCount + 1,
      history: [ev, ...existing.history],
    };
    write(all.map((c) => (c.id === existing.id ? updated : c)));
    return updated;
  }

  const rec: CloseCommitment = {
    id: `cc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    leadId: input.leadId,
    leadName: input.leadName,
    leadPhone: input.leadPhone,
    windowId: input.windowId,
    dueAt,
    blocker: input.blocker,
    confidence: input.confidence,
    note: input.note?.trim() ?? "",
    promisedBy: input.by,
    promisedAt: now,
    status: "open",
    changeCount: 0,
    history: [{ at: now, by: input.by, kind: "promised", windowId: input.windowId, dueAt, note: input.note?.trim() }],
  };
  write([rec, ...all]);
  return rec;
}

function settle(id: string, status: CommitmentStatus, by: string, reason: string, bookingRef?: string) {
  const now = new Date().toISOString();
  write(
    read().map((c) =>
      c.id === id
        ? {
            ...c,
            status,
            closedAt: now,
            bookingRef: bookingRef ?? c.bookingRef,
            history: [
              { at: now, by, kind: status === "kept" ? "kept" : status === "broken" ? "broken" : "cancelled", reason },
              ...c.history,
            ],
          }
        : c,
    ),
  );
}

export const markKept = (id: string, by: string, bookingRef = "", reason = "Booked") =>
  settle(id, "kept", by, reason, bookingRef);
export const markBroken = (id: string, by: string, reason: string) => settle(id, "broken", by, reason);
export const cancelCommitment = (id: string, by: string, reason: string) => settle(id, "cancelled", by, reason);

export function addCommitmentNote(id: string, by: string, note: string) {
  const now = new Date().toISOString();
  write(read().map((c) => (c.id === id ? { ...c, history: [{ at: now, by, kind: "note", note }, ...c.history] } : c)));
}

export function isExpired(c: CloseCommitment, now = Date.now()) {
  return c.status === "open" && new Date(c.dueAt).getTime() < now;
}

export function isDueToday(c: CloseCommitment, now = Date.now()) {
  if (c.status !== "open") return false;
  const d = new Date(c.dueAt);
  return d.toDateString() === new Date(now).toDateString() || d.getTime() < now;
}

export function hoursLeft(c: CloseCommitment, now = Date.now()) {
  return (new Date(c.dueAt).getTime() - now) / 3_600_000;
}

/** Per-person promise reliability — the number the daily review runs on. */
export function reliabilityByPerson(all: CloseCommitment[]) {
  const map = new Map<string, { person: string; promised: number; kept: number; broken: number; open: number; changes: number }>();
  for (const c of all) {
    const row = map.get(c.promisedBy) ?? { person: c.promisedBy, promised: 0, kept: 0, broken: 0, open: 0, changes: 0 };
    row.promised += 1;
    row.changes += c.changeCount;
    if (c.status === "kept") row.kept += 1;
    else if (c.status === "broken") row.broken += 1;
    else if (c.status === "open") row.open += 1;
    map.set(c.promisedBy, row);
  }
  return [...map.values()]
    .map((r) => ({ ...r, accuracy: r.kept + r.broken > 0 ? Math.round((r.kept / (r.kept + r.broken)) * 100) : null }))
    .sort((a, b) => b.promised - a.promised);
}

export function boardStats(all: CloseCommitment[], now = Date.now()) {
  const open = all.filter((c) => c.status === "open");
  const today = open.filter((c) => isDueToday(c, now));
  const settled = all.filter((c) => c.status === "kept" || c.status === "broken");
  const kept = all.filter((c) => c.status === "kept").length;
  return {
    open: open.length,
    today: today.length,
    expired: open.filter((c) => isExpired(c, now)).length,
    kept,
    broken: all.filter((c) => c.status === "broken").length,
    accuracy: settled.length ? Math.round((kept / settled.length) * 100) : null,
    keptToday: all.filter((c) => c.status === "kept" && c.closedAt && new Date(c.closedAt).toDateString() === new Date(now).toDateString()).length,
  };
}
