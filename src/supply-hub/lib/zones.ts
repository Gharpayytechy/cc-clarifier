// Supply Hub → zone registry.
// Zones are configurable: the four defaults ship with the app, and ops can add
// their own (e.g. MTPSJR = Manyata + Sarjapur) or override any property manually.
import { useCallback, useSyncExternalStore } from "react";
import type { PG } from "../data/types";

export interface ZoneDef {
  id: string;            // e.g. "MTPSJR"
  label: string;         // display name
  short: string;         // badge text
  cluster: string;       // human description of the catchment
  keywords: string[];    // lowercase match terms (area / locality / name / landmarks)
  accent: string;        // tailwind classes for the badge
  builtin?: boolean;
}

export const UNMAPPED = "UNMAPPED";

export const ZONE_ACCENTS = [
  "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  "border-sky-400/40 bg-sky-400/10 text-sky-300",
  "border-amber-400/40 bg-amber-400/10 text-amber-300",
  "border-violet-400/40 bg-violet-400/10 text-violet-300",
  "border-cyan-400/40 bg-cyan-400/10 text-cyan-300",
  "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
  "border-lime-400/40 bg-lime-400/10 text-lime-300",
  "border-orange-400/40 bg-orange-400/10 text-orange-300",
];

export const UNMAPPED_META: ZoneDef = {
  id: UNMAPPED,
  label: "UNMAPPED",
  short: "Unmapped",
  cluster: "Needs a zone owner",
  keywords: [],
  accent: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  builtin: true,
};

// Order matters — first keyword hit wins.
export const DEFAULT_ZONES: ZoneDef[] = [
  {
    id: "MTPSJR",
    label: "MTPSJR",
    short: "MTPSJR",
    cluster: "Manyata / Nagawara + Sarjapur",
    keywords: [
      "manyata", "nagawara", "nagwara", "thanisandra", "bhartiya", "hebbal", "hennur",
      "sarjapur", "sarja pura", "sarjapura",
    ],
    accent: ZONE_ACCENTS[2],
    builtin: true,
  },
  {
    id: "YPR CORE",
    label: "YPR CORE",
    short: "YPR",
    cluster: "YPR / Christ YPR",
    keywords: ["ypr", "yeshwanthpur", "yeshwantpur", "christ yesh", "christ campus", "malleshwaram", "rajajinagar"],
    accent: ZONE_ACCENTS[3],
    builtin: true,
  },
  {
    id: "EAST CORE",
    label: "EAST CORE",
    short: "East",
    cluster: "Whitefield/Brookfield + MWB/Bellandur",
    keywords: [
      "whitefield", "wfd", "brookfield", "brookfeild", "brookefield", "aecs", "aces", "kundanhalli",
      "kundalahalli", "mahadevapura", "mahadevpura", "madadevpura", "mwb", "marathahalli", "marathalli",
      "munnekollal", "bellandur", "kadubees", "kadubeshanalli", "kadubeensanhalli",
      "spice garden", "varthur", "panathur", "ecospace", "outer ring road", "orr", "sjr", "domlur",
      "indiranagar", "indranagar", "thippasandra", "halasur", "hoodi", "itpl",
    ],
    accent: ZONE_ACCENTS[1],
    builtin: true,
  },
  {
    id: "SOUTH CORE",
    label: "SOUTH CORE",
    short: "South",
    cluster: "Koramangala + HSR + BTM",
    keywords: [
      "koramangala", "koramangla", "sg palya", "sg palaya", "s.g palya", "sgpalya", "ejipura",
      "hsr", "btm", "jayanagar", "jp nagar", "bannerghatta", "bommanahalli", "silk board",
      "electronic city", "st joseph", "jain cms", "christ university", "madiwala", "audugodi", "adugodi",
      "shanti nagar", "shanthinagar", "wilson garden", "sampangi", "richmond", "mg road", "vasanth nagar",
    ],
    accent: ZONE_ACCENTS[0],
    builtin: true,
  },
];

const ZONES_KEY = "gharpayy.supply.zones.v2";
const OVERRIDES_KEY = "gharpayy.supply.zone-overrides.v1";

const canStore = () => typeof window !== "undefined";

function readZones(): ZoneDef[] {
  if (!canStore()) return DEFAULT_ZONES;
  try {
    const raw = window.localStorage.getItem(ZONES_KEY);
    if (!raw) return DEFAULT_ZONES;
    const parsed = JSON.parse(raw) as ZoneDef[];
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ZONES;
  } catch {
    return DEFAULT_ZONES;
  }
}

function readOverrides(): Record<string, string> {
  if (!canStore()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(OVERRIDES_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

let ZONE_LIST: ZoneDef[] = readZones();
let OVERRIDES: Record<string, string> = readOverrides();
let SNAPSHOT = { zones: ZONE_LIST, overrides: OVERRIDES };

const listeners = new Set<() => void>();
function emit() {
  SNAPSHOT = { zones: ZONE_LIST, overrides: OVERRIDES };
  listeners.forEach((l) => l());
}

export function listZones(): ZoneDef[] {
  return ZONE_LIST;
}

export function zoneMeta(id: string): ZoneDef {
  return ZONE_LIST.find((z) => z.id === id) ?? UNMAPPED_META;
}

const propKey = (pg: { name: string }) => (pg.name || "").trim().toUpperCase();
const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ");

export function zoneOfPG(pg: Pick<PG, "area" | "locality" | "name"> & { landmarksInline?: string[] }): string {
  const override = OVERRIDES[propKey(pg)];
  if (override && (override === UNMAPPED || ZONE_LIST.some((z) => z.id === override))) return override;
  const hay = norm([pg.area, pg.locality, pg.name, (pg.landmarksInline || []).join(" ")].join(" | "));
  for (const z of ZONE_LIST) {
    if (z.keywords.some((k) => k && hay.includes(k.toLowerCase()))) return z.id;
  }
  return UNMAPPED;
}

export function zoneCounts(pgs: PG[]): Record<string, number> {
  const out: Record<string, number> = {};
  [...ZONE_LIST.map((z) => z.id), UNMAPPED].forEach((id) => { out[id] = 0; });
  pgs.forEach((p) => {
    const z = zoneOfPG(p);
    out[z] = (out[z] || 0) + 1;
  });
  return out;
}

/** Learning-plan numbers derived from live property counts. */
export function zonePlan(id: string, properties: number) {
  const meta = zoneMeta(id);
  return {
    ...meta,
    properties,
    pages: 8,
    mcqSets: "7 × 30 MCQ formal",
    masteryBar: "80% D1–D3; 70%+ after two-property reasoning",
    coverageQs: properties * 4,
  };
}

// ---- mutations ----------------------------------------------------------

function persistZones() {
  if (canStore()) window.localStorage.setItem(ZONES_KEY, JSON.stringify(ZONE_LIST));
  emit();
}

function persistOverrides() {
  if (canStore()) window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(OVERRIDES));
  emit();
}

export function upsertZone(zone: ZoneDef) {
  const idx = ZONE_LIST.findIndex((z) => z.id === zone.id);
  ZONE_LIST = idx >= 0
    ? ZONE_LIST.map((z, i) => (i === idx ? { ...z, ...zone } : z))
    : [zone, ...ZONE_LIST];
  persistZones();
}

export function removeZone(id: string) {
  ZONE_LIST = ZONE_LIST.filter((z) => z.id !== id);
  persistZones();
}

export function moveZone(id: string, dir: -1 | 1) {
  const i = ZONE_LIST.findIndex((z) => z.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ZONE_LIST.length) return;
  const next = [...ZONE_LIST];
  [next[i], next[j]] = [next[j], next[i]];
  ZONE_LIST = next;
  persistZones();
}

export function resetZones() {
  ZONE_LIST = DEFAULT_ZONES;
  persistZones();
}

export function setZoneOverride(pg: { name: string }, zoneId: string | null) {
  const key = propKey(pg);
  const next = { ...OVERRIDES };
  if (!zoneId) delete next[key];
  else next[key] = zoneId;
  OVERRIDES = next;
  persistOverrides();
}

export function zoneOverrideOf(pg: { name: string }): string | null {
  return OVERRIDES[propKey(pg)] ?? null;
}

// ---- react binding ------------------------------------------------------

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

const serverSnapshot = { zones: DEFAULT_ZONES, overrides: {} as Record<string, string> };

export function useZones() {
  const snap = useSyncExternalStore(subscribe, () => SNAPSHOT, () => serverSnapshot);
  const addZone = useCallback((z: Omit<ZoneDef, "accent"> & { accent?: string }) => {
    upsertZone({ ...z, accent: z.accent ?? ZONE_ACCENTS[ZONE_LIST.length % ZONE_ACCENTS.length] });
  }, []);
  return {
    zones: snap.zones,
    overrides: snap.overrides,
    addZone,
    upsertZone,
    removeZone,
    moveZone,
    resetZones,
    setZoneOverride,
  };
}
