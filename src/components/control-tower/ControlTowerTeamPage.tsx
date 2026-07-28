import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  useControlTower,
  inventoryByHorizon,
  suggestLineup,
  chatScore,
  BBD_TARGET_PER_DAY,
  type OwnershipMode,
  type InventoryHorizon,
  type LineupSlot,
  type ChatReview,
} from "@/lib/control-tower/team";
import { WhyCaption } from "@/components/common/WhyCaption";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, ShieldCheck, Users, Boxes, Trophy, MessageSquare, ClipboardList, Activity, Plus, X } from "lucide-react";

const HORIZONS: { key: InventoryHorizon; label: string; hint: string }[] = [
  { key: "today",      label: "Today",      hint: "Fill first — beds ready NOW" },
  { key: "this-week",  label: "This Week",  hint: "Bank of options for pending qualifieds" },
  { key: "this-month", label: "This Month", hint: "For future-move-in leads" },
  { key: "later",      label: "Later",      hint: "Long-tail / hidden inventory" },
];

const SHIFTS = ["morning", "afternoon", "evening", "night"] as const;

export function ControlTowerTeamPage() {
  const ct = useControlTower();
  const app = useApp();

  return (
    <div className="space-y-4">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-semibold">Control Tower Team</h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            The alignment layer above zones. No CRM is solo-dependent. Every lead has exactly one owner.
            The 4-gate process is mandatory. Inventory focus, BBD lineup and chat-depth reviews live here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">{ct.members.filter((m) => m.present).length}/{ct.members.length} on-shift</Badge>
          <Badge variant="outline" className="text-xs">Ownership: {ct.ownershipMode}</Badge>
          <Badge variant="outline" className="text-xs">Inventory active: {ct.inventory.filter((i) => i.active).length}</Badge>
        </div>
      </header>

      <Tabs defaultValue="volume">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="volume"><Activity className="h-3.5 w-3.5 mr-1" />Volume</TabsTrigger>
          <TabsTrigger value="team"><Users className="h-3.5 w-3.5 mr-1" />CT Team</TabsTrigger>
          <TabsTrigger value="worklist"><ClipboardList className="h-3.5 w-3.5 mr-1" />Assigned Worklist</TabsTrigger>
          <TabsTrigger value="ownership"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Single-Owner</TabsTrigger>
          <TabsTrigger value="gates"><CheckCircle2 className="h-3.5 w-3.5 mr-1" />4-Gate Process</TabsTrigger>
          <TabsTrigger value="inventory"><Boxes className="h-3.5 w-3.5 mr-1" />Inventory Focus</TabsTrigger>
          <TabsTrigger value="lineup"><Trophy className="h-3.5 w-3.5 mr-1" />BBD Lineup</TabsTrigger>
          <TabsTrigger value="chat"><MessageSquare className="h-3.5 w-3.5 mr-1" />Chat Review</TabsTrigger>
        </TabsList>

        <TabsContent value="volume"><VolumeTab /></TabsContent>
        <TabsContent value="team"><TeamTab /></TabsContent>
        <TabsContent value="worklist"><WorklistTab /></TabsContent>
        <TabsContent value="ownership"><OwnershipTab /></TabsContent>
        <TabsContent value="gates"><GatesTab /></TabsContent>
        <TabsContent value="inventory"><InventoryTab /></TabsContent>
        <TabsContent value="lineup"><LineupTab /></TabsContent>
        <TabsContent value="chat"><ChatReviewTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── Volume ───────────────────────── */

function VolumeTab() {
  const { volume, setVolume } = useControlTower();
  const pct = Math.min(100, Math.round((volume.leadsToday / Math.max(1, volume.targetToday)) * 100));
  const status = pct >= 100 ? "on-target" : pct >= 60 ? "on-track" : "at-risk";
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-4 lg:col-span-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Total Leads — the CT team calls this out FIRST every day</h3>
          <Badge variant={status === "at-risk" ? "destructive" : status === "on-target" ? "default" : "secondary"} className="text-[10px]">{status}</Badge>
        </div>
        <WhyCaption why="If we don't know volume, no number after that makes sense. CT must raise the flag before operators do." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" />
        <div className="mt-3 grid grid-cols-3 gap-3 text-center">
          <Metric big={volume.leadsToday} label={`Today (target ${volume.targetToday})`} />
          <Metric big={volume.leads7d} label="Last 7 days" />
          <Metric big={volume.leads30d} label="Last 30 days" />
        </div>
        <div className="mt-3">
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>Today vs target</span><span>{pct}%</span></div>
          <Progress value={pct} className="h-2 mt-1" />
          {pct < 60 && (
            <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
              <AlertTriangle className="inline h-3.5 w-3.5 mr-1 text-amber-500" />
              Low inbound today. CT team switches to <b>Old Leads (7d/30d)</b> — this is why the worklist exists.
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="text-xs font-semibold mb-2">Per-Zone volume (last 7d)</div>
          <div className="space-y-1.5">
            {Object.entries(volume.perZone).map(([z, n]) => {
              const max = Math.max(...Object.values(volume.perZone));
              return (
                <div key={z} className="flex items-center gap-2 text-xs">
                  <span className="w-20 capitalize">{z}</span>
                  <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${(n / max) * 100}%` }} />
                  </div>
                  <span className="w-10 text-right font-mono">{n}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            Best-performing zone gets fewer NEW leads (only good ones left) — CT must interpret this before flagging under-performance.
          </p>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Adjust today's counters</h3>
        <p className="text-[11px] text-muted-foreground mb-3">Wire to Cloud next turn. Local edit for now.</p>
        <div className="space-y-2">
          <NumField label="Leads today" value={volume.leadsToday} onChange={(v) => setVolume({ leadsToday: v })} />
          <NumField label="Target/day" value={volume.targetToday} onChange={(v) => setVolume({ targetToday: v })} />
          <NumField label="Leads 7d"   value={volume.leads7d}    onChange={(v) => setVolume({ leads7d: v })} />
          <NumField label="Leads 30d"  value={volume.leads30d}   onChange={(v) => setVolume({ leads30d: v })} />
        </div>
      </Card>
    </div>
  );
}

/* ───────────────────────── Team ───────────────────────── */

function TeamTab() {
  const { members } = useControlTower();
  return (
    <div className="space-y-3">
      <WhyCaption why="Multiple CT members rotate so the CRM never depends on one operator. Each guarantees a minimum daily worklist." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" client="Same experience every time" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {members.map((m) => (
          <Card key={m.id} className={cn("p-4", !m.present && "opacity-60")}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center font-mono text-sm">{m.initials}</div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{m.name}</div>
                <div className="text-[11px] text-muted-foreground capitalize">{m.shift} shift · covers {m.zonesCovered.join(", ")}</div>
              </div>
              <Badge variant={m.present ? "default" : "outline"} className="text-[10px]">{m.present ? "On" : "Off"}</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <Metric big={m.minLeadsPerDay} label="Min leads/day" small />
              <Metric big={m.minOldLeadTouches} label="Old-lead touches" small />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Worklist ───────────────────────── */

function WorklistTab() {
  const { members, worklist, assignWorklist, markWorklist } = useControlTower();
  const app = useApp();
  const [selectedMember, setSelectedMember] = useState(members[0]?.id ?? "");

  function autoAssign() {
    if (!selectedMember) return;
    const member = members.find((m) => m.id === selectedMember);
    if (!member) return;
    // Pull recent + stale leads from the app store
    const now = Date.now();
    const candidates = app.leads
      .map((l) => ({
        lead: l,
        ageDays: Math.max(0, Math.round((now - +new Date(l.createdAt)) / 86400000)),
      }))
      .sort((a, b) => a.ageDays - b.ageDays);
    const today = candidates.filter((c) => c.ageDays === 0).slice(0, 5);
    const seven = candidates.filter((c) => c.ageDays > 0 && c.ageDays <= 7).slice(0, member.minOldLeadTouches);
    const thirty = candidates.filter((c) => c.ageDays > 7 && c.ageDays <= 30).slice(0, Math.max(0, member.minLeadsPerDay - today.length - seven.length));
    const items = [
      ...today.map((c) => ({ ctMemberId: member.id, leadId: c.lead.id, leadName: c.lead.name, ageDays: c.ageDays, bucket: "today" as const, reason: "Fresh inbound — first response" })),
      ...seven.map((c) => ({ ctMemberId: member.id, leadId: c.lead.id, leadName: c.lead.name, ageDays: c.ageDays, bucket: "7d" as const, reason: "Nudge — reheat before it goes cold" })),
      ...thirty.map((c) => ({ ctMemberId: member.id, leadId: c.lead.id, leadName: c.lead.name, ageDays: c.ageDays, bucket: "30d" as const, reason: "Revival — check if they're searching again" })),
    ];
    assignWorklist(items);
  }

  const rows = worklist.filter((w) => !selectedMember || w.ctMemberId === selectedMember).slice(0, 60);

  return (
    <div className="space-y-3">
      <WhyCaption why="No more 'I was short of leads'. Every CT member gets a pre-assigned list mixing today + 7d + 30d leads. Completion is tracked." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" />
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">CT member</Label>
          <Select value={selectedMember} onValueChange={setSelectedMember}>
            <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} · {m.shift}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={autoAssign}><Plus className="h-3.5 w-3.5 mr-1" />Auto-assign today's worklist</Button>
          <div className="text-xs text-muted-foreground ml-auto">
            Total open: <b>{worklist.filter((w) => w.status === "pending").length}</b> · Done: <b>{worklist.filter((w) => w.status === "done").length}</b>
          </div>
        </div>
      </Card>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Lead</th>
              <th className="p-2 text-left">Bucket</th>
              <th className="p-2 text-left">Age</th>
              <th className="p-2 text-left">Reason</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No worklist yet — pick a member and auto-assign.</td></tr>
            )}
            {rows.map((w) => (
              <tr key={w.id} className="border-t">
                <td className="p-2 font-medium">{w.leadName}</td>
                <td className="p-2">
                  <Badge variant="outline" className="text-[10px]">
                    {w.bucket === "today" ? "Today" : w.bucket === "7d" ? "Last 7d" : "Last 30d"}
                  </Badge>
                </td>
                <td className="p-2 text-muted-foreground">{w.ageDays}d</td>
                <td className="p-2 text-muted-foreground">{w.reason}</td>
                <td className="p-2">
                  <Badge variant={w.status === "done" ? "default" : w.status === "skipped" ? "destructive" : "secondary"} className="text-[10px] capitalize">{w.status}</Badge>
                </td>
                <td className="p-2 flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => markWorklist(w.id, "in-progress")}>Start</Button>
                  <Button size="sm" variant="outline" onClick={() => markWorklist(w.id, "done", "Completed via CT")}>Done</Button>
                  <Button size="sm" variant="ghost" onClick={() => markWorklist(w.id, "skipped")}>Skip</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────── Ownership ───────────────────────── */

function OwnershipTab() {
  const { ownershipMode, setOwnershipMode } = useControlTower();
  const opts: { key: OwnershipMode; label: string; desc: string }[] = [
    { key: "hard-lock",       label: "Hard lock",       desc: "Only the assigned owner can act. Anyone else must request reassignment. No shared edits, no shadow." },
    { key: "shadow-allowed",  label: "Hard lock + shadow view", desc: "Owner-only edits. Others can VIEW read-only for training/handover. This is the recommended default." },
    { key: "cowork-legacy",   label: "Legacy co-work",  desc: "Previous behaviour — multiple people could touch the same lead. Not recommended." },
  ];
  return (
    <div className="space-y-3">
      <WhyCaption why="Single owner means 100% accountability. No 'this guy told me… that guy told me…'. If a CT member can't own it clearly, they don't fit." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" client="Same experience every time" />
      <div className="grid gap-3 md:grid-cols-3">
        {opts.map((o) => (
          <Card key={o.key} className={cn("p-4 cursor-pointer border-2", ownershipMode === o.key ? "border-primary" : "border-transparent hover:border-muted-foreground/30")} onClick={() => setOwnershipMode(o.key)}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-semibold text-sm">{o.label}</div>
              {ownershipMode === o.key && <CheckCircle2 className="h-4 w-4 text-primary" />}
            </div>
            <p className="text-xs text-muted-foreground">{o.desc}</p>
          </Card>
        ))}
      </div>
      <Card className="p-4 bg-muted/30">
        <div className="text-xs font-semibold mb-1">How this is enforced across the app</div>
        <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
          <li><b>Hard lock:</b> non-owner action returns <code>{"{ allowed: false, requestReassign: true }"}</code> from <code>canEditLead()</code>. Buttons/inputs are disabled and show a reassignment prompt.</li>
          <li><b>Shadow view:</b> read is allowed; write returns the same block. Used for training and handover only.</li>
          <li>Every override is logged into the lead's audit trail with actor + reason + timestamp.</li>
        </ul>
      </Card>
    </div>
  );
}

/* ───────────────────────── 4-Gate ───────────────────────── */

function GatesTab() {
  const app = useApp();
  const { gatesByLead, getGates, setGate } = useControlTower();
  const [leadId, setLeadId] = useState(app.leads[0]?.id ?? "");
  const gates = getGates(leadId);
  const green = gates.every((g) => g.status === "green");
  return (
    <div className="space-y-3">
      <WhyCaption why="Tour + Quotation is a menu with no pay button unless all 4 gates are green. This blocks 'let's just schedule and see' from happening." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" client="Same experience every time" />
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Lead</Label>
          <Select value={leadId} onValueChange={setLeadId}>
            <SelectTrigger className="h-8 w-72 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {app.leads.slice(0, 60).map((l) => <SelectItem key={l.id} value={l.id}>{l.name} · {l.preferredArea}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge variant={green ? "default" : "destructive"} className="text-[10px] ml-auto">
            {green ? "ALL GATES GREEN — tour + quote allowed" : `${gates.filter(g => g.status === "green").length}/4 green — tour BLOCKED`}
          </Badge>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {gates.map((g) => (
          <Card key={g.key} className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{g.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5">{g.question}</p>
              </div>
              <StatusPill status={g.status} />
            </div>
            <div className="mt-3">
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Evidence</Label>
              <Textarea
                className="mt-1 text-xs min-h-[60px]"
                placeholder="What did you verify? Quote what the customer / owner said."
                value={g.evidence ?? ""}
                onChange={(e) => setGate(leadId, g.key, { evidence: e.target.value })}
              />
              <div className="mt-2 flex gap-1">
                {(["green", "amber", "red"] as const).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={g.status === s ? "default" : "outline"}
                    onClick={() => setGate(leadId, g.key, { status: s })}
                    className="capitalize"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {green && (
        <Card className="p-4 border-2 border-emerald-500/40 bg-emerald-500/5">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            All 4 gates green — proceed to Tour + auto-Quote
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Post-tour: quotation must be sent within 15 minutes. Otherwise a breach is logged against the owner.
          </p>
        </Card>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: "green" | "amber" | "red" | "unknown" }) {
  const map = {
    green:   "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
    amber:   "bg-amber-500/15 text-amber-600 border-amber-500/30",
    red:     "bg-destructive/15 text-destructive border-destructive/30",
    unknown: "bg-muted text-muted-foreground border-muted-foreground/20",
  } as const;
  return <span className={cn("text-[10px] px-2 py-0.5 rounded-full border capitalize", map[status])}>{status}</span>;
}

/* ───────────────────────── Inventory ───────────────────────── */

function InventoryTab() {
  const { inventory, toggleInventory, addInventory, removeInventory } = useControlTower();
  const grouped = useMemo(() => inventoryByHorizon(inventory), [inventory]);
  const [draft, setDraft] = useState({ propertyName: "", area: "", bedType: "Single AC", price: 12000, horizon: "today" as InventoryHorizon, whyChoose: "", bedsAvailable: 1, photosCount: 0, active: true });

  return (
    <div className="space-y-4">
      <WhyCaption why="Without inventory knowledge no BBD is possible. CT owns the daily 'what to sell today / this week / this month' board so every operator opens the app already knowing which beds to push." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" client="Same experience every time" />

      {HORIZONS.map((h) => (
        <Card key={h.key} className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-semibold text-sm capitalize">{h.label}</h3>
              <p className="text-[11px] text-muted-foreground">{h.hint}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">{grouped[h.key].length} listings</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {grouped[h.key].map((i) => (
              <div key={i.id} className={cn("p-3 rounded-md border text-xs space-y-1", i.active ? "bg-card" : "bg-muted/40 opacity-70")}>
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{i.propertyName}</div>
                  <Switch checked={i.active} onCheckedChange={() => toggleInventory(i.id)} />
                </div>
                <div className="text-muted-foreground">{i.area} · {i.bedType} · ₹{i.price.toLocaleString("en-IN")}</div>
                <div className="text-[11px]"><b>Why choose:</b> {i.whyChoose}</div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{i.bedsAvailable} beds · {i.photosCount} photos</span>
                  <button className="hover:text-destructive" onClick={() => removeInventory(i.id)}><X className="h-3 w-3" /></button>
                </div>
                {i.ownerNote && <div className="text-[10px] text-emerald-600">Owner: {i.ownerNote}</div>}
              </div>
            ))}
            {grouped[h.key].length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-6 text-xs">No listings yet in this horizon.</div>
            )}
          </div>
        </Card>
      ))}

      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">Add inventory focus</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <Input placeholder="Property name" value={draft.propertyName} onChange={(e) => setDraft({ ...draft, propertyName: e.target.value })} />
          <Input placeholder="Area" value={draft.area} onChange={(e) => setDraft({ ...draft, area: e.target.value })} />
          <Input placeholder="Bed type" value={draft.bedType} onChange={(e) => setDraft({ ...draft, bedType: e.target.value })} />
          <Input type="number" placeholder="Price" value={draft.price} onChange={(e) => setDraft({ ...draft, price: +e.target.value })} />
          <Select value={draft.horizon} onValueChange={(v) => setDraft({ ...draft, horizon: v as InventoryHorizon })}>
            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HORIZONS.map((h) => <SelectItem key={h.key} value={h.key}>{h.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" placeholder="Beds available" value={draft.bedsAvailable} onChange={(e) => setDraft({ ...draft, bedsAvailable: +e.target.value })} />
          <Input type="number" placeholder="Photos count" value={draft.photosCount} onChange={(e) => setDraft({ ...draft, photosCount: +e.target.value })} />
          <Input placeholder="Why choose (1 line)" value={draft.whyChoose} onChange={(e) => setDraft({ ...draft, whyChoose: e.target.value })} />
        </div>
        <Button size="sm" className="mt-3" onClick={() => { if (draft.propertyName) { addInventory(draft); setDraft({ ...draft, propertyName: "", whyChoose: "" }); } }}>
          <Plus className="h-3.5 w-3.5 mr-1" />Add
        </Button>
      </Card>
    </div>
  );
}

/* ───────────────────────── Lineup ───────────────────────── */

function LineupTab() {
  const { lineup, setLineup, updatePick } = useControlTower();
  const app = useApp();

  function autoLineup() {
    const picks = suggestLineup(
      app.tcms.map((t, i) => ({ id: t.id, name: t.name, role: "TCM", performance: 80 - i * 3 })),
    );
    setLineup(picks);
  }

  const total = lineup.reduce((a, b) => a + b.targetBookings, 0);
  const bySlot: Record<LineupSlot, typeof lineup> = { opener: [], middle: [], finisher: [], bench: [] };
  lineup.forEach((p) => bySlot[p.slot].push(p));

  return (
    <div className="space-y-3">
      <WhyCaption why="Like cricket: openers face the new hot leads at day-open; finishers close negotiation at day-end. No random allocation." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" />
      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Today's BBD lineup</div>
          <div className="text-[11px] text-muted-foreground">Target: <b>{BBD_TARGET_PER_DAY} BBD/day</b> · Committed: <b>{total}</b></div>
        </div>
        <Button size="sm" onClick={autoLineup}>Auto-suggest from TCM roster</Button>
      </Card>

      {(["opener", "middle", "finisher", "bench"] as LineupSlot[]).map((slot) => (
        <Card key={slot} className="p-4">
          <div className="text-sm font-semibold capitalize mb-2">
            {slot === "opener" && "Openers — face the new hot leads"}
            {slot === "middle" && "Middle order — steady conversion"}
            {slot === "finisher" && "Finishers — close negotiation"}
            {slot === "bench" && "Bench — rotation cover"}
          </div>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {bySlot[slot].map((p) => (
              <div key={p.memberId} className="p-3 rounded border text-xs">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">{p.memberName}</div>
                  <Badge variant="outline" className="text-[10px]">{p.role}</Badge>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <Label className="text-[10px] text-muted-foreground">Target</Label>
                  <Input type="number" className="h-7 w-16 text-xs" value={p.targetBookings} onChange={(e) => updatePick(p.memberId, { targetBookings: +e.target.value })} />
                  <Select value={p.slot} onValueChange={(v) => updatePick(p.memberId, { slot: v as LineupSlot })}>
                    <SelectTrigger className="h-7 text-xs w-24"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="opener">Opener</SelectItem>
                      <SelectItem value="middle">Middle</SelectItem>
                      <SelectItem value="finisher">Finisher</SelectItem>
                      <SelectItem value="bench">Bench</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="mt-1 text-[10px] text-muted-foreground">{p.reason}</div>
              </div>
            ))}
            {bySlot[slot].length === 0 && (
              <div className="col-span-full text-center text-muted-foreground py-4 text-xs">No one in this slot yet.</div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

/* ───────────────────────── Chat Review ───────────────────────── */

function ChatReviewTab() {
  const app = useApp();
  const { reviews, addReview } = useControlTower();
  const [draft, setDraft] = useState<Omit<ChatReview, "id" | "reviewedAt">>({
    leadId: app.leads[0]?.id ?? "",
    reviewerId: "ct-1",
    responseSpeed: 3,
    acknowledgment: 3,
    realProblemFocus: 3,
    valueDrivenAnswer: 3,
    advancedNextStep: 3,
    stillLooking: "unknown",
    whatActuallyHappened: "",
    overall: 3,
  });
  const score = chatScore({ ...draft, id: "", reviewedAt: "" } as ChatReview);

  return (
    <div className="space-y-3">
      <WhyCaption why="Every chat should feel like the same Domino's burger — same process, no random 'extra cheese' from a new operator. Deep review catches this." admin="Visibility + accountability" tcm="Clear next step, no ambiguity" client="Same experience every time" />
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Lead being reviewed</Label>
          <Select value={draft.leadId} onValueChange={(v) => setDraft({ ...draft, leadId: v })}>
            <SelectTrigger className="h-8 w-72 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {app.leads.slice(0, 60).map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Badge className="ml-auto text-[10px]">Score {score}/100</Badge>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <ScoreSlider label="Response speed"     hint="5 = under 1 minute · 1 = >1 hour"       value={draft.responseSpeed}    onChange={(v) => setDraft({ ...draft, responseSpeed: v })} />
          <ScoreSlider label="Acknowledgment"     hint="Did we recognise their pain?"          value={draft.acknowledgment}   onChange={(v) => setDraft({ ...draft, acknowledgment: v })} />
          <ScoreSlider label="Real problem focus" hint="Solved real issue, not surface fluff"  value={draft.realProblemFocus} onChange={(v) => setDraft({ ...draft, realProblemFocus: v })} />
          <ScoreSlider label="Value-driven answer" hint="Concrete, not vague"                  value={draft.valueDrivenAnswer} onChange={(v) => setDraft({ ...draft, valueDrivenAnswer: v })} />
          <ScoreSlider label="Advanced next step" hint="Did the chat move forward?"            value={draft.advancedNextStep} onChange={(v) => setDraft({ ...draft, advancedNextStep: v })} />
          <div>
            <Label className="text-xs">Are they still looking?</Label>
            <Select value={draft.stillLooking} onValueChange={(v) => setDraft({ ...draft, stillLooking: v as ChatReview["stillLooking"] })}>
              <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="yes">Yes — still active</SelectItem>
                <SelectItem value="no">No — booked elsewhere / dropped</SelectItem>
                <SelectItem value="never-was">Never was serious</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <Label className="text-xs">If tour was scheduled but not booked — why?</Label>
          <Textarea value={draft.tourBookedButUnbookedReason ?? ""} onChange={(e) => setDraft({ ...draft, tourBookedButUnbookedReason: e.target.value })} className="text-xs mt-1" placeholder="Real reason, not the polite one they gave" />
        </div>
        <div>
          <Label className="text-xs">What actually happened (verbatim, no assumptions)</Label>
          <Textarea value={draft.whatActuallyHappened} onChange={(e) => setDraft({ ...draft, whatActuallyHappened: e.target.value })} className="text-xs mt-1 min-h-[70px]" />
        </div>
        <Button size="sm" onClick={() => addReview(draft)}>Save review</Button>
      </Card>

      <div>
        <div className="text-xs font-semibold mb-2">Recent reviews ({reviews.length})</div>
        <div className="space-y-2">
          {reviews.slice(0, 10).map((r) => (
            <Card key={r.id} className="p-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="font-medium">{app.leads.find((l) => l.id === r.leadId)?.name ?? r.leadId}</div>
                <Badge variant="outline" className="text-[10px]">Score {chatScore(r)}/100 · still {r.stillLooking}</Badge>
              </div>
              <div className="text-muted-foreground mt-1">{r.whatActuallyHappened}</div>
              {r.tourBookedButUnbookedReason && <div className="text-[10px] mt-1"><b>Why not booked:</b> {r.tourBookedButUnbookedReason}</div>}
            </Card>
          ))}
          {reviews.length === 0 && <div className="text-center text-muted-foreground text-xs py-6">No reviews yet.</div>}
        </div>
      </div>
    </div>
  );
}

function ScoreSlider({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <div className="flex gap-1 mt-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <Button key={n} size="sm" variant={value === n ? "default" : "outline"} className="h-7 w-7 p-0" onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}>{n}</Button>
        ))}
      </div>
    </div>
  );
}

/* ───────────────────────── Small ───────────────────────── */

function Metric({ big, label, small = false }: { big: number | string; label: string; small?: boolean }) {
  return (
    <div>
      <div className={cn("font-display font-semibold", small ? "text-lg" : "text-2xl")}>{big}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs">{label}</Label>
      <Input type="number" value={value} onChange={(e) => onChange(+e.target.value)} className="h-8 w-28 text-xs" />
    </div>
  );
}