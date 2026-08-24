// Supply Hub → CRM zone mapping.
// Every property is auto-tagged to one of the four training/ops cores.
import type { PG } from "../data/types";

export type SupplyZone = "SOUTH CORE" | "EAST CORE" | "NORTH CORE" | "YPR CORE" | "UNMAPPED";

export interface ZoneMeta {
  zone: SupplyZone;
  short: string;
  cluster: string;
  pages: number;
  mcqSets: string;
  masteryBar: string;
  accent: string;
}

export const ZONE_META: Record<SupplyZone, ZoneMeta> = {
  "SOUTH CORE": {
    zone: "SOUTH CORE",
    short: "South",
    cluster: "Koramangala + HSR + BTM",
    pages: 8,
    mcqSets: "7 × 30 MCQ formal",
    masteryBar: "80% D1–D3; 70%+ after two-property reasoning",
    accent: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  },
  "EAST CORE": {
    zone: "EAST CORE",
    short: "East",
    cluster: "Whitefield/Brookfield + MWB/Bellandur",
    pages: 8,
    mcqSets: "7 × 30 MCQ formal",
    masteryBar: "80% D1–D3; 70%+ after two-property reasoning",
    accent: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  },
  "NORTH CORE": {
    zone: "NORTH CORE",
    short: "North",
    cluster: "Manyata / Nagawara",
    pages: 8,
    mcqSets: "7 × 30 MCQ formal",
    masteryBar: "80% D1–D3; 70%+ after two-property reasoning",
    accent: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  },
  "YPR CORE": {
    zone: "YPR CORE",
    short: "YPR",
    cluster: "YPR / Christ YPR",
    pages: 8,
    mcqSets: "7 × 30 MCQ formal",
    masteryBar: "80% D1–D3; 70%+ after two-property reasoning",
    accent: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  },
  UNMAPPED: {
    zone: "UNMAPPED",
    short: "Unmapped",
    cluster: "Needs a zone owner",
    pages: 0,
    mcqSets: "—",
    masteryBar: "—",
    accent: "border-rose-400/40 bg-rose-400/10 text-rose-300",
  },
};

export const ZONES: SupplyZone[] = ["SOUTH CORE", "EAST CORE", "NORTH CORE", "YPR CORE", "UNMAPPED"];

// Keyword rules, checked in order. First hit wins.
const RULES: { zone: SupplyZone; kw: string[] }[] = [
  {
    zone: "YPR CORE",
    kw: ["ypr", "yeshwanthpur", "yeshwantpur", "christ yesh", "christ campus", "malleshwaram", "rajajinagar"],
  },
  {
    zone: "NORTH CORE",
    kw: ["manyata", "nagawara", "nagwara", "thanisandra", "bhartiya", "hebbal", "hennur", "kammanahalli"],
  },
  {
    zone: "EAST CORE",
    kw: [
      "whitefield", "wfd", "brookfield", "brookfeild", "brookefield", "aecs", "aces", "kundanhalli",
      "kundalahalli", "mahadevapura", "mahadevpura", "madadevpura", "mwb", "marathahalli", "marathalli",
      "munnekollal", "bellandur", "kadubees", "kadubeshanalli", "kadubeensanhalli", "sarjapur", "sarja pura",
      "spice garden", "varthur", "panathur", "ecospace", "outer ring road", "orr", "sjr", "domlur",
      "indiranagar", "indranagar", "thippasandra", "halasur", "hoodi", "itpl",
    ],
  },
  {
    zone: "SOUTH CORE",
    kw: [
      "koramangala", "koramangla", "sg palya", "sg palaya", "s.g palya", "sgpalya", "ejipura",
      "hsr", "btm", "jayanagar", "jp nagar", "bannerghatta", "bommanahalli", "silk board",
      "electronic city", "st joseph", "jain cms", "christ university", "madiwala", "audugodi", "adugodi",
      "shanti nagar", "shanthinagar", "wilson garden", "sampangi", "richmond", "mg road", "vasanth nagar",
    ],
  },
];

const norm = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ");

export function zoneOfPG(pg: Pick<PG, "area" | "locality" | "name"> & { landmarksInline?: string[] }): SupplyZone {
  const hay = norm([pg.area, pg.locality, pg.name, (pg.landmarksInline || []).join(" ")].join(" | "));
  for (const rule of RULES) {
    if (rule.kw.some((k) => hay.includes(k))) return rule.zone;
  }
  return "UNMAPPED";
}

export function zoneCounts(pgs: PG[]): Record<SupplyZone, number> {
  const out = Object.fromEntries(ZONES.map((z) => [z, 0])) as Record<SupplyZone, number>;
  pgs.forEach((p) => { out[zoneOfPG(p)] += 1; });
  return out;
}

/** Learning-plan numbers derived from live property counts. */
export function zonePlan(zone: SupplyZone, properties: number) {
  const meta = ZONE_META[zone];
  return {
    ...meta,
    properties,
    coverageQs: properties * 4,
  };
}
