// Spreadsheet view of the Admin Desk on its own route.
// Same data, same drill down: every cell opens the person sheet.

import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { RoleGate } from "@/founder/components/RoleGate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CalendarDays, Search } from "lucide-react";
import { subscribeAdminDesk, todayStamp } from "@/founder/lib/admin/admin-desk-store";
import { allPersonDays } from "@/founder/lib/admin/admin-digest";
import { dayAttendance, prettyDate, zoneAttendance } from "@/founder/lib/admin/admin-day";
import { companyLadders } from "@/founder/lib/admin/admin-goals";
import { useAdminNotes } from "@/founder/lib/admin/admin-notes";
import { DataSheet } from "@/founder/components/admin/DataSheet";
import { PersonSheet, type PersonPane } from "@/founder/components/admin/PersonSheet";

export const Route = createFileRoute("/admin/sheet")({
  component: () => (
    <RoleGate allow={["superadmin", "leadership", "hr"]}>
      <AdminSheet />
    </RoleGate>
  ),
  head: () => ({
    meta: [
      { title: "Admin Sheet · Every person, score and goal in one grid" },
      { name: "description", content: "Spreadsheet grid of the whole roster: score, today, week and month goals, report status, marks and notes. Every cell opens the person drill down." },
      { property: "og:title", content: "Admin Sheet · Every person, score and goal in one grid" },
      { property: "og:description", content: "Score, goals, report status and notes for the whole roster, copyable to Excel or WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AdminSheet() {
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    setHydrated(true);
    const off = subscribeAdminDesk(() => setTick((t) => t + 1));
    return () => { off(); };
  }, []);

  const [date, setDate] = useState(todayStamp());
  const [query, setQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [sheetPane, setSheetPane] = useState<PersonPane>("timeline");

  const rows = useMemo(() => (hydrated ? allPersonDays(date) : []), [hydrated, date, tick]);
  const att = useMemo(() => (hydrated ? dayAttendance(date) : []), [hydrated, date, tick]);
  const attById = useMemo(() => new Map(att.map((a) => [a.emp.id, a])), [att]);
  const ladders = useMemo(() => (hydrated ? companyLadders(date) : []), [hydrated, date, tick]);
  const laddersById = useMemo(() => new Map(ladders.map((l) => [l.emp.id, l.ladder])), [ladders]);
  const zoneNames = useMemo(() => zoneAttendance(att).map((z) => z.zone), [att]);

  const notes = useAdminNotes();
  const noteCounts = useMemo(() => {
    const m = new Map<string, number>();
    notes.forEach((n) => m.set(n.employeeId, (m.get(n.employeeId) ?? 0) + 1));
    return m;
  }, [notes]);

  const visible = rows.filter((r) => {
    const zone = r.emp.zone && r.emp.zone !== "All" ? r.emp.zone : "HQ";
    if (zoneFilter !== "all" && zone !== zoneFilter) return false;
    if (query && !`${r.emp.name} ${r.emp.role} ${zone}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  const openRow = rows.find((r) => r.emp.id === sheetId) ?? null;

  return (
    <div className="px-4 md:px-8 py-6 max-w-[1500px] mx-auto pb-24">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-widest text-primary mb-1.5">Admin sheet</div>
          <h1 className="font-display text-2xl md:text-4xl font-semibold tracking-tight">Everyone on one grid</h1>
          <p className="text-muted-foreground text-sm mt-1">{prettyDate(date)} · tap any cell to open that person</p>
        </div>
        <Link to="/admin">
          <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1.5" /> Back to Admin Desk</Button>
        </Link>
      </header>

      <section className="sticky top-0 z-30 rounded-2xl border border-border bg-card/95 backdrop-blur px-3 py-2.5 mb-4 flex flex-wrap items-center gap-2">
        <CalendarDays className="w-4 h-4 text-muted-foreground" />
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 w-[150px] text-xs" aria-label="Date" />
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search person, role or zone" className="h-9 pl-8 text-xs" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {["all", ...zoneNames].map((z) => (
            <button key={z} onClick={() => setZoneFilter(z)}
              className={`px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors ${zoneFilter === z ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
              {z === "all" ? "All zones" : z}
            </button>
          ))}
        </div>
      </section>

      {!hydrated && <div className="rounded-2xl border border-border bg-card px-4 py-10 text-sm text-muted-foreground">Loading the grid…</div>}

      {hydrated && (
        <DataSheet
          date={date}
          rows={visible}
          attById={attById}
          laddersById={laddersById}
          noteCounts={noteCounts}
          onPerson={(id, pane) => { setSheetId(id); setSheetPane(pane); }}
        />
      )}

      <PersonSheet
        open={!!openRow}
        onClose={() => setSheetId(null)}
        row={openRow}
        att={openRow ? attById.get(openRow.emp.id) : undefined}
        date={date}
        pane={sheetPane}
        onPane={setSheetPane}
        onJumpDate={(d) => setDate(d)}
      />
    </div>
  );
}
